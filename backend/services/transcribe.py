from __future__ import annotations

from backend.models import TranscriptSegment, TranscriptionResult


def transcribe_placeholder(
    filename: str,
    model_name: str | None,
    provider_id: str | None,
    language: str | None,
) -> TranscriptionResult:
    label = model_name or provider_id or "asrbox"
    text = f"Transcribed {filename} with {label}"
    if language and language != "auto":
        text += f" ({language})"
    segments = [
        TranscriptSegment(id=1, start=0.0, end=1.8, text=text),
    ]
    return TranscriptionResult(
        text=text,
        language=language,
        duration=1.8,
        segments=segments,
        model_name=model_name,
        provider_id=provider_id,
    )

