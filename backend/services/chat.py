from __future__ import annotations

import queue
import threading
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from backend.database.models import ChatMessage, ChatSession
from backend.models import ChatMessageResponse, ChatSessionResponse, ChatSessionSummaryResponse
from backend.services import chat_knowledge, llm_providers, versions

TITLE_MAX_LENGTH = 30
ROLES = {"user", "assistant"}
STATUSES = {"complete", "partial", "error"}

EVENT_DELTA = "delta"
EVENT_DONE = "done"
EVENT_ERROR = "error"

SYSTEM_PROMPT = (
    "你是 ASRbox 的内置助手，回答两类问题：ASRbox 软件的使用方法，以及用户当前绑定转写任务的字幕内容。"
    "回答只能基于下面提供的内置资料、字幕内容和会话历史；资料没有覆盖的内容要明确说明不知道，不要编造软件功能。"
    "回答字幕内容问题时，只依据字幕文本本身：引用原文作答，不要推测、联想或补充字幕之外的信息；"
    "字幕每行开头的方括号是该句的时间戳（分:秒），涉及时间位置的问题用它来回答。"
)
NO_KNOWLEDGE_HINT = "本次问题未命中内置答疑资料；若问题超出资料范围，请明确说明，而不是编造功能。"
MAX_CONTEXT_CHARS = 100_000
HISTORY_LIMIT = 20
REPLY_TIMEOUT = 120
STREAM_QUEUE_MAXSIZE = 256


class _StreamAborted(Exception):
    pass


def _title_from(content: str) -> str:
    title = " ".join(content.split())
    return title[:TITLE_MAX_LENGTH]


def create_session(db: Session, *, task_id: str | None = None, provider_id: str | None = None,
                   title: str = "") -> ChatSession:
    row = ChatSession(task_id=task_id, provider_id=provider_id, title=title)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_sessions(db: Session) -> list[ChatSession]:
    return db.query(ChatSession).order_by(ChatSession.updated_at.desc()).all()


def get_session(db: Session, session_id: str) -> ChatSession | None:
    return db.query(ChatSession).filter(ChatSession.id == session_id).first()


def delete_session(db: Session, session_id: str) -> bool:
    row = get_session(db, session_id)
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True


def add_message(db: Session, session_id: str, *, role: str, content: str,
                status: str = "complete") -> ChatMessage | None:
    if role not in ROLES:
        raise ValueError(f"Unsupported chat message role: {role}")
    if status not in STATUSES:
        raise ValueError(f"Unsupported chat message status: {status}")
    session = get_session(db, session_id)
    if session is None:
        return None
    row = ChatMessage(session_id=session.id, role=role, content=content, status=status)
    session.updated_at = datetime.now(UTC)
    if role == "user" and not session.title:
        session.title = _title_from(content)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_session(db: Session, session_id: str, *, task_id=None, provider_id=None,
                   fields: set[str] | None = None) -> ChatSession | None:
    row = get_session(db, session_id)
    if row is None:
        return None
    fields = fields or set()
    if "task_id" in fields:
        row.task_id = task_id
    if "provider_id" in fields:
        row.provider_id = provider_id
    row.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(row)
    return row


def message_to_response(row: ChatMessage) -> ChatMessageResponse:
    return ChatMessageResponse(
        id=row.id,
        session_id=row.session_id,
        role=row.role,
        content=row.content,
        status=row.status,
        created_at=row.created_at,
    )


def session_summary(row: ChatSession) -> ChatSessionSummaryResponse:
    return ChatSessionSummaryResponse(
        id=row.id,
        task_id=row.task_id,
        provider_id=row.provider_id,
        title=row.title,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def session_to_response(row: ChatSession) -> ChatSessionResponse:
    return ChatSessionResponse(
        **session_summary(row).model_dump(),
        messages=[message_to_response(message) for message in row.messages],
    )


def build_context_messages(db: Session, session: ChatSession, content: str) -> list[dict[str, str]]:
    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.id.asc())
        .all()
    )
    hits = chat_knowledge.search(content)
    if not hits:
        previous_user = next(
            (message.content for message in reversed(history)
             if message.role == "user" and message.content.strip()),
            "",
        )
        if previous_user:
            hits = chat_knowledge.search(f"{previous_user} {content}")
    system = SYSTEM_PROMPT
    if hits:
        system += "\n\n以下内置答疑资料可能与本次问题相关：\n" + "\n\n".join(
            f"【{hit['title']}】\n{hit['text']}" for hit in hits
        )
    else:
        system += "\n\n" + NO_KNOWLEDGE_HINT
    messages = [{"role": "system", "content": system}]
    if session.task_id:
        version_id = versions.latest_version_id(db, session.task_id)
        if version_id is not None:
            version = versions.get_version(db, session.task_id, version_id)
            subtitle = "\n".join(
                f"[{_format_timestamp(segment.start)}] {segment.text}" for segment in version.segments
            ) if version else ""
            if subtitle.strip():
                messages.append({"role": "system", "content": "以下是用户当前绑定任务的字幕内容：\n" + subtitle})
    prefix = len(messages)
    messages.extend(
        {"role": message.role, "content": message.content}
        for message in history
        if message.content.strip()
    )
    messages[prefix:] = messages[prefix:][-HISTORY_LIMIT:]
    while len(messages) > prefix + 1 and _context_chars(messages) > MAX_CONTEXT_CHARS:
        del messages[prefix]
    if _context_chars(messages) > MAX_CONTEXT_CHARS:
        raise llm_providers.LLMProviderError(
            "LLM_PROVIDER_CONTEXT_TOO_LONG",
            "Subtitle and conversation exceed the provider context limit; unbind the task or shorten the history",
        )
    return messages


def _format_timestamp(start_seconds: float) -> str:
    total_seconds = max(0, int(start_seconds))
    return f"{total_seconds // 60:02d}:{total_seconds % 60:02d}"


def _context_chars(messages: list[dict[str, str]]) -> int:
    return sum(len(message["content"]) for message in messages)


def _emit(updates: queue.Queue, cancel: threading.Event, item) -> bool:
    while not cancel.is_set():
        try:
            updates.put(item, timeout=0.5)
            return True
        except queue.Full:
            continue
    return False


def run_reply(session_id: str, provider_id: str, messages: list[dict[str, str]],
              updates: queue.Queue, cancel: threading.Event) -> None:
    from backend.database import session as db_session

    parts: list[str] = []

    def on_delta(delta: str) -> None:
        if cancel.is_set():
            raise _StreamAborted()
        parts.append(delta)
        if not _emit(updates, cancel, (EVENT_DELTA, {"content": delta})):
            raise _StreamAborted()

    db = db_session.SessionLocal()
    try:
        provider = llm_providers.get_provider_row(db, provider_id)
        content = llm_providers.chat_completion(
            provider, messages, timeout=REPLY_TIMEOUT, on_delta=on_delta,
        )
        row = add_message(db, session_id, role="assistant", content=content, status="complete")
        _emit(updates, cancel, (EVENT_DONE, {"message": message_to_response(row).model_dump(mode="json")}))
    except _StreamAborted:
        partial = "".join(parts)
        row = add_message(db, session_id, role="assistant", content=partial, status="partial") if partial.strip() else None
        _emit(updates, cancel, (EVENT_DONE, {
            "aborted": True,
            "message": message_to_response(row).model_dump(mode="json") if row else None,
        }))
    except llm_providers.LLMProviderError as exc:
        partial = "".join(parts)
        row = add_message(db, session_id, role="assistant", content=partial, status="error") if partial.strip() else None
        _emit(updates, cancel, (EVENT_ERROR, {
            "code": exc.code,
            "message": exc.message,
            "message_id": row.id if row else None,
        }))
    except Exception:
        partial = "".join(parts)
        row = add_message(db, session_id, role="assistant", content=partial, status="error") if partial.strip() else None
        _emit(updates, cancel, (EVENT_ERROR, {
            "code": "LLM_PROVIDER_UNEXPECTED",
            "message": "Chat reply failed unexpectedly",
            "message_id": row.id if row else None,
        }))
    finally:
        db.close()
