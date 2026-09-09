from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from backend.database.models import ChatMessage, ChatSession

TITLE_MAX_LENGTH = 30
ROLES = {"user", "assistant"}
STATUSES = {"complete", "partial", "error"}


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
