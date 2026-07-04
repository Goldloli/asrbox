from __future__ import annotations

from collections import Counter
from typing import Any

from sqlalchemy.orm import Session

from backend.database.models import TranscriptionTask
from backend.models import TaskQualityResponse, TranscriptSegment
from backend.services import diagnostics


def analyze(task: TranscriptionTask, segments: list[TranscriptSegment], audio_quality: dict[str, Any] | None = None) -> dict[str, Any]:
    warnings: list[str] = []
    text = task.text or ""
    stripped = text.strip()
    if not stripped:
        warnings.append("EMPTY_TRANSCRIPT")
    words = list(stripped)
    if len(words) >= 20:
        counts = Counter(words)
        _char, count = counts.most_common(1)[0]
        if count / len(words) > 0.45:
            warnings.append("REPETITIVE_TRANSCRIPT")
    overlaps = 0
    invalid_times = 0
    last_end = -1.0
    for segment in segments:
        if segment.end < segment.start:
            invalid_times += 1
        if segment.start < last_end:
            overlaps += 1
        last_end = max(last_end, segment.end)
    if overlaps:
        warnings.append("TIMELINE_OVERLAP")
    if invalid_times:
        warnings.append("INVALID_SEGMENT_TIME")
    duration_ms = task.duration_ms or 0
    if duration_ms > 60_000 and len(stripped) < 10:
        warnings.append("TEXT_TOO_SHORT_FOR_DURATION")
    if audio_quality and audio_quality.get("near_silence") and len(stripped) > 100:
        warnings.append("SILENCE_WITH_LONG_TRANSCRIPT")
    return {
        "warnings": warnings,
        "metrics": {
            "text_length": len(stripped),
            "segment_count": len(segments),
            "overlap_count": overlaps,
            "invalid_time_count": invalid_times,
            "duration_ms": duration_ms,
        },
    }


def store_quality_report(db: Session, task: TranscriptionTask, segments: list[TranscriptSegment], options: dict[str, Any]) -> dict[str, Any]:
    report = analyze(task, segments, options.get("audio_quality"))
    options["quality_report"] = report
    if report["warnings"]:
        diagnostics.record_task_diagnostic(
            db,
            task_id=task.id,
            stage="quality",
            error_code=None,
            message=f"Quality warnings: {', '.join(report['warnings'])}",
            model_name=task.model_name,
            provider_id=task.provider_id,
            audio_metadata=options.get("audio_metadata"),
        )
    return report


def get_quality_report(task_id: str, options: dict[str, Any]) -> TaskQualityResponse:
    report = options.get("quality_report") or {"warnings": [], "metrics": {}}
    return TaskQualityResponse(task_id=task_id, warnings=list(report.get("warnings") or []), metrics=dict(report.get("metrics") or {}))
