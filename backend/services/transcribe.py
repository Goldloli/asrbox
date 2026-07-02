from __future__ import annotations

from backend.models import TranscriptSegment, TranscriptionResult


_local_pipelines: dict[str, object] = {}


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


def _seconds(value) -> float:
    if value is None:
        return 0.0
    return float(value)


def _segments_from_chunks(chunks: list[dict], fallback_text: str) -> list[TranscriptSegment]:
    segments: list[TranscriptSegment] = []
    for index, chunk in enumerate(chunks, 1):
        timestamp = chunk.get("timestamp") or (0.0, 0.0)
        start, end = timestamp if isinstance(timestamp, (list, tuple)) and len(timestamp) == 2 else (0.0, 0.0)
        text = str(chunk.get("text") or "").strip()
        if text:
            segments.append(
                TranscriptSegment(
                    id=index,
                    start=_seconds(start),
                    end=_seconds(end),
                    text=text,
                )
            )
    if segments:
        return segments
    return [TranscriptSegment(id=1, start=0.0, end=0.0, text=fallback_text)]


def transcribe_with_local_model(model_name: str, audio_path: str, options: dict) -> TranscriptionResult:
    from pathlib import Path

    from backend import config
    from backend.services import models as model_service

    if not model_service.is_model_downloaded(model_name):
        raise RuntimeError(f"Model {model_name} is not downloaded")

    model_dir = config.get_models_dir() / model_name
    if not model_dir.exists():
        raise RuntimeError(f"Model directory not found: {model_dir}")

    pipeline = _local_pipelines.get(model_name)
    if pipeline is None:
        from transformers import pipeline as transformers_pipeline

        pipeline = transformers_pipeline(
            "automatic-speech-recognition",
            model=str(model_dir),
            tokenizer=str(model_dir),
            feature_extractor=str(model_dir),
            device=-1,
        )
        _local_pipelines[model_name] = pipeline

    language = options.get("language")
    generate_kwargs = {}
    if language and language != "auto":
        generate_kwargs["language"] = language

    result = pipeline(
        str(Path(audio_path)),
        return_timestamps=True,
        generate_kwargs=generate_kwargs,
    )
    text = str(result.get("text") or "").strip()
    chunks = result.get("chunks") or []
    segments = _segments_from_chunks(chunks, text)
    duration = segments[-1].end if segments else None
    return TranscriptionResult(
        text=text,
        language=language,
        duration=duration,
        segments=segments,
        model_name=model_name,
    )
