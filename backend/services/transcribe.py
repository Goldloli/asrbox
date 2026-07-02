from __future__ import annotations

from backend.backends.local_asr import transcribe_local
from backend.backends.registry import get_model_config
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


def transcribe_with_local_model(model_name: str, audio_path: str, options: dict) -> TranscriptionResult:
    model_config = get_model_config(model_name)
    if model_config is None:
        raise RuntimeError(f"Unknown model: {model_name}")
    from backend.services import models as model_service

    if not model_service.is_model_downloaded(model_name):
        raise RuntimeError(f"Model {model_name} is not downloaded")
    return transcribe_local(audio_path, model_config, options)
