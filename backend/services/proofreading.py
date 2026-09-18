from __future__ import annotations

import json
import logging
import queue
import threading
from dataclasses import dataclass
from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.database import session as db_session
from backend.database.models import (
    ProofreadingRun,
    ProofreadingSuggestion,
    TranscriptSegment as DBSegment,
    TranscriptVersion,
    TranscriptionTask,
)
from backend.models import ProofreadingRunResponse, ProofreadingSuggestionResponse, TranscriptSegment
from backend.services import llm_compatibility, llm_providers
from backend.services.llm_compatibility import json_object
from backend.services import versions as version_service
from backend.services.task_transitions import task_transition_lock
from backend.utils.transcript_text import transcript_text_from_segments

_logger = logging.getLogger(__name__)


ACTIVE_RUN_STATUSES = {"queued", "running"}
MAX_BATCH_SEGMENTS = 500
MAX_BATCH_CHARACTERS = 30_000
LOCAL_MAX_BATCH_SEGMENTS = 64
LOCAL_MAX_BATCH_CHARACTERS = 6_000
REMOTE_REQUEST_TIMEOUT = 90
LOCAL_REQUEST_TIMEOUT = 300
MAX_RESPONSE_BYTES = 1024 * 1024
SPLIT_RETRYABLE = {
    "LLM_PROVIDER_TIMEOUT",
    "LLM_PROVIDER_TRUNCATED",
    "LLM_PROVIDER_CONTEXT_TOO_LONG",
    "LLM_PROVIDER_RESPONSE_TOO_LARGE",
}

_run_queue: queue.Queue[str] = queue.Queue()
_worker_lock = threading.Lock()
_worker_started = False
_worker_count = 0
_worker_target = 1


class ProofreadingError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class ProofreadingBatch:
    targets: list[dict[str, int | str]]
    context: list[dict[str, int | str]]


@dataclass(frozen=True)
class ParsedSuggestion:
    segment_id: int
    original_text: str
    suggested_text: str
    reason: str


class _SuggestionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    segment_id: int
    suggested_text: str = Field(min_length=1)
    reason: str = Field(min_length=1)


class _ProofreadingPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    suggestions: list[_SuggestionPayload]


SYSTEM_PROMPT = """You proofread transcript segments conservatively.
Correct only clear transcription, spelling, punctuation, or contextual text errors.
Preserve meaning, language, tone, names, and numbers unless a correction is clear.
Never merge, split, reorder, retime, or relabel segments.
Return only a JSON object with a suggestions array. Each suggestion is a compact
three-item array: [segment_id, suggested_text, short_reason]. Return suggestions
only for target segments, never for read-only context segments."""

REASON_LANGUAGE_INSTRUCTIONS = {
    "zh": "Write every short_reason in concise Simplified Chinese (简体中文).",
    "en": "Write every short_reason in concise English.",
}


def build_batches(
    segments: list[TranscriptSegment],
    *,
    max_segments: int = MAX_BATCH_SEGMENTS,
    max_characters: int = MAX_BATCH_CHARACTERS,
) -> list[ProofreadingBatch]:
    if max_segments < 1 or max_characters < 1:
        raise ValueError("Proofreading batch limits must be positive")

    groups: list[list[TranscriptSegment]] = []
    current: list[TranscriptSegment] = []
    current_characters = 0
    for segment in segments:
        segment_characters = len(segment.text)
        if current and (
            len(current) >= max_segments
            or current_characters + segment_characters > max_characters
        ):
            groups.append(current)
            current = []
            current_characters = 0
        current.append(segment)
        current_characters += segment_characters
    if current:
        groups.append(current)

    positions = {segment.id: index for index, segment in enumerate(segments)}
    batches: list[ProofreadingBatch] = []
    for group in groups:
        start = positions[group[0].id]
        end = positions[group[-1].id]
        neighbors: list[TranscriptSegment] = []
        if start > 0:
            neighbors.append(segments[start - 1])
        if end + 1 < len(segments):
            neighbors.append(segments[end + 1])
        batches.append(
            ProofreadingBatch(
                targets=[{"id": item.id, "text": item.text} for item in group],
                context=[{"id": item.id, "text": item.text} for item in neighbors],
            )
        )
    return batches


def parse_suggestions(
    content: str,
    targets: list[dict[str, int | str]],
) -> list[ParsedSuggestion]:
    try:
        raw = json_object(content)
        if not isinstance(raw, dict) or set(raw) != {"suggestions"} or not isinstance(raw["suggestions"], list):
            raise ValueError("suggestions must be an array")
        normalized: list[dict[str, object]] = []
        for item in raw["suggestions"]:
            if isinstance(item, list) and len(item) == 3:
                normalized.append({
                    "segment_id": item[0],
                    "suggested_text": item[1],
                    "reason": item[2],
                })
            elif isinstance(item, dict):
                normalized.append(item)
            else:
                raise ValueError("suggestion must be a compact tuple or legacy object")
        payload = _ProofreadingPayload.model_validate({"suggestions": normalized}, strict=True)
    except (json.JSONDecodeError, ValidationError, TypeError, ValueError, RecursionError) as exc:
        raise ProofreadingError(
            "LLM_INVALID_RESPONSE",
            "LLM provider returned invalid structured suggestions",
        ) from exc

    target_text = {int(item["id"]): str(item["text"]) for item in targets}
    seen: set[int] = set()
    result: list[ParsedSuggestion] = []
    for suggestion in payload.suggestions:
        suggested_text = suggestion.suggested_text.strip()
        reason = suggestion.reason.strip()
        if (
            suggestion.segment_id not in target_text
            or suggestion.segment_id in seen
            or not suggested_text
            or not reason
        ):
            raise ProofreadingError(
                "LLM_INVALID_RESPONSE",
                "LLM provider returned invalid structured suggestions",
            )
        seen.add(suggestion.segment_id)
        original_text = target_text[suggestion.segment_id]
        if suggested_text == original_text:
            continue
        result.append(
            ParsedSuggestion(
                segment_id=suggestion.segment_id,
                original_text=original_text,
                suggested_text=suggested_text,
                reason=reason,
            )
        )
    return result


def source_segments(db: Session, run: ProofreadingRun) -> list[TranscriptSegment]:
    version = version_service.get_version(db, run.task_id, run.source_version_id)
    if version is None:
        raise ProofreadingError("PROOFREADING_SOURCE_MISSING", "Proofreading source version is missing")
    return version.segments


def create_run(
    db: Session,
    task_id: str,
    provider_id: str,
    *,
    reason_language: str = "en",
) -> ProofreadingRun:
    if reason_language not in REASON_LANGUAGE_INSTRUCTIONS:
        raise ProofreadingError("PROOFREADING_LANGUAGE_INVALID", "Unsupported proofreading reason language")
    task = db.query(TranscriptionTask).filter(TranscriptionTask.id == task_id).first()
    if task is None:
        raise ProofreadingError("TASK_NOT_FOUND", "Task not found")
    if task.status != "completed":
        raise ProofreadingError("PROOFREADING_TASK_NOT_COMPLETED", "Proofreading requires a completed task")
    provider = llm_providers.get_provider_row(db, provider_id)
    if provider is None:
        raise ProofreadingError("LLM_PROVIDER_NOT_FOUND", "LLM provider not found")
    try:
        llm_providers.validate_usable(provider)
    except (llm_providers.LLMProviderError, ValueError) as exc:
        raise ProofreadingError(getattr(exc, "code", "LLM_PROVIDER_INVALID"), str(exc)) from exc
    active = (
        db.query(ProofreadingRun)
        .filter(
            ProofreadingRun.task_id == task_id,
            ProofreadingRun.status.in_(ACTIVE_RUN_STATUSES),
        )
        .first()
    )
    if active is not None:
        raise ProofreadingError("PROOFREADING_RUN_ACTIVE", "Task already has an active proofreading run")
    source_version_id = version_service.latest_version_id(db, task_id)
    if source_version_id is None:
        raise ProofreadingError("PROOFREADING_SOURCE_MISSING", "Completed task has no transcript version")

    run = ProofreadingRun(
        task_id=task.id,
        source_version_id=source_version_id,
        llm_provider_id=provider.id,
        provider_name=provider.name,
        provider_preset=provider.preset,
        model_name=provider.default_model,
        reason_language=reason_language,
        status="queued",
    )
    db.add(run)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProofreadingError(
            "PROOFREADING_RUN_ACTIVE",
            "Task already has an active proofreading run",
        ) from exc
    db.refresh(run)
    enqueue_run(run.id)
    return run


def mark_interrupted_runs(db: Session) -> int:
    rows = db.query(ProofreadingRun).filter(ProofreadingRun.status.in_(ACTIVE_RUN_STATUSES)).all()
    now = datetime.now(UTC)
    for row in rows:
        row.status = "interrupted"
        row.error_code = "PROOFREADING_INTERRUPTED"
        row.error = "Proofreading was interrupted before the server restarted"
        row.updated_at = now
        row.completed_at = now
    if rows:
        db.commit()
    return len(rows)


def is_stale(db: Session, run: ProofreadingRun) -> bool:
    task = db.query(TranscriptionTask).filter(TranscriptionTask.id == run.task_id).first()
    return (
        task is None
        or task.status != "completed"
        or version_service.latest_version_id(db, run.task_id) != run.source_version_id
    )


def to_response(db: Session, run: ProofreadingRun) -> ProofreadingRunResponse:
    return ProofreadingRunResponse(
        id=run.id,
        task_id=run.task_id,
        source_version_id=run.source_version_id,
        llm_provider_id=run.llm_provider_id,
        provider_name=run.provider_name,
        provider_preset=run.provider_preset,
        model_name=run.model_name,
        reason_language=run.reason_language,
        status=run.status,
        total_batches=run.total_batches,
        completed_batches=run.completed_batches,
        error_code=run.error_code,
        error=run.error,
        stale=is_stale(db, run),
        suggestions=[
            ProofreadingSuggestionResponse(
                id=item.id,
                segment_id=item.segment_id,
                original_text=item.original_text,
                suggested_text=item.suggested_text,
                reason=item.reason,
                resolution=item.resolution,
            )
            for item in run.suggestions
        ],
        created_at=run.created_at,
        updated_at=run.updated_at,
        completed_at=run.completed_at,
        applied_at=run.applied_at,
    )


def list_runs(db: Session, task_id: str) -> list[ProofreadingRunResponse]:
    rows = (
        db.query(ProofreadingRun)
        .filter(ProofreadingRun.task_id == task_id)
        .order_by(ProofreadingRun.created_at.desc(), ProofreadingRun.id.desc())
        .all()
    )
    return [to_response(db, row) for row in rows]


def get_run(db: Session, task_id: str, run_id: str) -> ProofreadingRun | None:
    return (
        db.query(ProofreadingRun)
        .filter(ProofreadingRun.id == run_id, ProofreadingRun.task_id == task_id)
        .first()
    )


def _apply_suggestions_unlocked(
    db: Session,
    run_id: str,
    suggestion_ids: list[int],
) -> TranscriptVersion:
    try:
        run = db.query(ProofreadingRun).filter(ProofreadingRun.id == run_id).first()
        if run is None:
            raise ProofreadingError("PROOFREADING_RUN_NOT_FOUND", "Proofreading run not found")
        if run.status == "applied":
            raise ProofreadingError(
                "PROOFREADING_ALREADY_APPLIED",
                "Proofreading suggestions have already been applied",
            )
        if run.status != "completed":
            raise ProofreadingError(
                "PROOFREADING_NOT_APPLICABLE",
                "Proofreading run is not ready to apply",
            )
        selected_ids = set(suggestion_ids)
        if not selected_ids or len(selected_ids) != len(suggestion_ids):
            raise ProofreadingError(
                "PROOFREADING_INVALID_SELECTION",
                "Select one or more unique proofreading suggestions",
            )
        if is_stale(db, run):
            raise ProofreadingError(
                "PROOFREADING_STALE",
                "Proofreading source is no longer current; run proofreading again",
            )

        suggestions = (
            db.query(ProofreadingSuggestion)
            .filter(ProofreadingSuggestion.run_id == run.id)
            .order_by(ProofreadingSuggestion.id.asc())
            .all()
        )
        selected = [item for item in suggestions if item.id in selected_ids]
        if len(selected) != len(selected_ids) or any(item.resolution != "pending" for item in suggestions):
            raise ProofreadingError(
                "PROOFREADING_INVALID_SELECTION",
                "Proofreading suggestion selection is invalid",
            )

        claimed = (
            db.query(ProofreadingRun)
            .filter(ProofreadingRun.id == run.id, ProofreadingRun.status == "completed")
            .update({ProofreadingRun.status: "applying"}, synchronize_session="fetch")
        )
        if claimed != 1:
            raise ProofreadingError(
                "PROOFREADING_ALREADY_APPLIED",
                "Proofreading suggestions have already been applied",
            )

        task = db.query(TranscriptionTask).filter(TranscriptionTask.id == run.task_id).one()
        segment_rows = (
            db.query(DBSegment)
            .filter(DBSegment.task_id == task.id)
            .order_by(DBSegment.idx.asc())
            .all()
        )
        by_id = {row.idx: row for row in segment_rows}
        for suggestion in selected:
            segment = by_id.get(suggestion.segment_id)
            if segment is None or segment.text != suggestion.original_text:
                raise ProofreadingError(
                    "PROOFREADING_STALE",
                    "Proofreading source is no longer current; run proofreading again",
                )
            segment.text = suggestion.suggested_text

        task.text = transcript_text_from_segments(
            [
                TranscriptSegment(
                    id=row.idx,
                    start=row.start_ms / 1000,
                    end=row.end_ms / 1000,
                    text=row.text,
                    speaker=row.speaker,
                    confidence=row.confidence,
                )
                for row in segment_rows
            ]
        )
        task.updated_at = datetime.now(UTC)
        for suggestion in suggestions:
            suggestion.resolution = "applied" if suggestion.id in selected_ids else "skipped"
        run.status = "applied"
        run.applied_at = task.updated_at
        run.updated_at = task.updated_at
        version = version_service.create_version(db, task, "proofread", commit=False)
        db.commit()
        db.refresh(version)
        return version
    except Exception:
        db.rollback()
        raise


def apply_suggestions(
    db: Session,
    run_id: str,
    suggestion_ids: list[int],
) -> TranscriptVersion:
    with task_transition_lock:
        db.expire_all()
        return _apply_suggestions_unlocked(db, run_id, suggestion_ids)


def _messages_for_batch(batch: ProofreadingBatch, reason_language: str = "en") -> list[dict[str, str]]:
    language_instruction = REASON_LANGUAGE_INSTRUCTIONS.get(
        reason_language,
        REASON_LANGUAGE_INSTRUCTIONS["en"],
    )
    return [
        {"role": "system", "content": f"{SYSTEM_PROMPT}\n{language_instruction}"},
        {
            "role": "user",
            "content": json.dumps(
                {"targets": batch.targets, "context": batch.context},
                ensure_ascii=False,
            ),
        },
    ]


def response_schema(target_ids):
    return {"type": "object", "additionalProperties": False, "required": ["suggestions"],
        "properties": {"suggestions": {"type": "array", "maxItems": len(target_ids),
            "items": {"type": "array", "minItems": 3, "maxItems": 3,
                "prefixItems": [
                    {"type": "integer", "enum": target_ids},
                    {"type": "string", "minLength": 1},
                    {"type": "string", "minLength": 1},
                ]}}}}


def _sub_batch(batch: ProofreadingBatch, start: int, stop: int) -> ProofreadingBatch:
    targets = batch.targets[start:stop]
    target_ids = {int(item["id"]) for item in targets}
    candidates = [
        *(batch.targets[start - 1:start] if start > 0 else []),
        *(batch.targets[stop:stop + 1] if stop < len(batch.targets) else []),
        *batch.context,
    ]
    context: list[dict[str, int | str]] = []
    seen: set[int] = set()
    for item in candidates:
        segment_id = int(item["id"])
        if segment_id in target_ids or segment_id in seen:
            continue
        context.append(item)
        seen.add(segment_id)
        if len(context) == 2:
            break
    return ProofreadingBatch(targets=targets, context=context)


def _proofread_batch(
    provider,
    batch: ProofreadingBatch,
    *,
    timeout: int,
    reason_language: str = "en",
) -> list[ParsedSuggestion]:
    target_ids = [int(item["id"]) for item in batch.targets]

    def split_and_retry() -> list[ParsedSuggestion]:
        half = len(batch.targets) // 2
        return (
            _proofread_batch(
                provider,
                _sub_batch(batch, 0, half),
                timeout=timeout,
                reason_language=reason_language,
            )
            + _proofread_batch(
                provider,
                _sub_batch(batch, half, len(batch.targets)),
                timeout=timeout,
                reason_language=reason_language,
            )
        )

    try:
        content = llm_providers.chat_completion(
            provider,
            _messages_for_batch(batch, reason_language),
            timeout=timeout,
            max_response_bytes=MAX_RESPONSE_BYTES,
            response_schema=response_schema(target_ids),
        )
    except llm_providers.LLMProviderError as exc:
        if exc.code in SPLIT_RETRYABLE and len(batch.targets) > 1:
            return split_and_retry()
        raise
    try:
        return parse_suggestions(content, batch.targets)
    except ProofreadingError as exc:
        if exc.code == "LLM_INVALID_RESPONSE" and len(batch.targets) > 1:
            return split_and_retry()
        raise


def execute_run(db: Session, run_id: str) -> None:
    run = db.query(ProofreadingRun).filter(ProofreadingRun.id == run_id).first()
    if run is None or run.status not in ACTIVE_RUN_STATUSES:
        return
    try:
        provider = llm_providers.get_provider_row(db, run.llm_provider_id or "")
        if provider is None:
            raise ProofreadingError("LLM_PROVIDER_NOT_FOUND", "LLM provider no longer exists")
        segments = source_segments(db, run)
        local = llm_compatibility.resolved(provider).protocol == "ollama"
        batches = build_batches(
            segments,
            max_segments=LOCAL_MAX_BATCH_SEGMENTS if local else MAX_BATCH_SEGMENTS,
            max_characters=LOCAL_MAX_BATCH_CHARACTERS if local else MAX_BATCH_CHARACTERS,
        )
        timeout = LOCAL_REQUEST_TIMEOUT if local else REMOTE_REQUEST_TIMEOUT
        run.status = "running"
        run.total_batches = len(batches)
        run.completed_batches = 0
        run.error_code = None
        run.error = None
        db.commit()

        collected: list[ParsedSuggestion] = []
        for index, batch in enumerate(batches, 1):
            collected.extend(
                _proofread_batch(
                    provider,
                    batch,
                    timeout=timeout,
                    reason_language=run.reason_language,
                )
            )
            run.completed_batches = index
            run.updated_at = datetime.now(UTC)
            db.commit()

        for suggestion in collected:
            db.add(
                ProofreadingSuggestion(
                    run_id=run.id,
                    segment_id=suggestion.segment_id,
                    original_text=suggestion.original_text,
                    suggested_text=suggestion.suggested_text,
                    reason=suggestion.reason,
                )
            )
        run.status = "completed"
        run.completed_at = datetime.now(UTC)
        run.updated_at = run.completed_at
        db.commit()
    except Exception as exc:
        db.rollback()
        failed = db.query(ProofreadingRun).filter(ProofreadingRun.id == run_id).first()
        if failed is None:
            return
        db.query(ProofreadingSuggestion).filter(ProofreadingSuggestion.run_id == run_id).delete()
        failed.status = "failed"
        failed.error_code = getattr(exc, "code", "PROOFREADING_FAILED")
        if isinstance(exc, (ProofreadingError, llm_providers.LLMProviderError)):
            failed.error = str(exc)
        else:
            failed.error = "Proofreading failed"
        failed.completed_at = datetime.now(UTC)
        failed.updated_at = failed.completed_at
        db.commit()


def _ensure_worker_capacity_locked() -> None:
    global _worker_count, _worker_started
    while _worker_count < _worker_target:
        _worker_count += 1
        try:
            threading.Thread(target=_run_worker, daemon=True).start()
        except BaseException:
            _worker_count -= 1
            _worker_started = _worker_count > 0
            raise
    _worker_started = _worker_count > 0


def enqueue_run(run_id: str) -> None:
    db_session.init_db()
    _run_queue.put(run_id)
    with _worker_lock:
        _ensure_worker_capacity_locked()


def _run_worker() -> None:
    global _worker_count, _worker_started
    try:
        while True:
            run_id = _run_queue.get()
            try:
                db = db_session.SessionLocal()
                try:
                    execute_run(db, run_id)
                finally:
                    db.close()
            except Exception:
                # A normal exception is contained so this worker can continue.
                _logger.exception("Proofreading worker escaped an unexpected error for run %s", run_id)
                _fail_run_after_escape(run_id)
            except BaseException:
                # Thread-level exits must release the worker slot and trigger a replacement.
                _logger.exception("Proofreading worker exited while processing run %s", run_id)
                _fail_run_after_escape(run_id)
                return
            finally:
                _run_queue.task_done()
    finally:
        with _worker_lock:
            _worker_count = max(0, _worker_count - 1)
            _worker_started = _worker_count > 0
            _ensure_worker_capacity_locked()


def _fail_run_after_escape(run_id: str) -> None:
    """Best-effort failure persistence after execute_run itself raised."""
    try:
        db = db_session.SessionLocal()
        try:
            db.rollback()
            failed = db.query(ProofreadingRun).filter(ProofreadingRun.id == run_id).first()
            if failed is None or failed.status not in {"queued", "running"}:
                return
            failed.status = "failed"
            failed.error_code = "PROOFREADING_FAILED"
            failed.error = "Proofreading failed"
            failed.completed_at = datetime.now(UTC)
            failed.updated_at = failed.completed_at
            db.commit()
        finally:
            db.close()
    except Exception:
        _logger.exception("Failed to persist escaped proofreading failure for run %s", run_id)
