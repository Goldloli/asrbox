from __future__ import annotations

from pathlib import Path
from typing import Protocol

from backend import config
from backend.backends.registry import ASRModelConfig
from backend.models import TranscriptSegment, TranscriptionResult

try:
    from faster_whisper import WhisperModel
except Exception:  # pragma: no cover - optional runtime dependency
    WhisperModel = None


class LocalASRBackend(Protocol):
    def transcribe(self, audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult: ...
    def is_loaded(self, model_name: str) -> bool: ...
    def unload(self, model_name: str) -> bool: ...


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
            segments.append(TranscriptSegment(id=index, start=_seconds(start), end=_seconds(end), text=text))
    if segments:
        return segments
    return [TranscriptSegment(id=1, start=0.0, end=0.0, text=fallback_text)]


class TransformersWhisperBackend:
    def __init__(self) -> None:
        self._pipelines: dict[str, object] = {}

    def transcribe(self, audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult:
        pipeline = self._pipelines.get(model_config.model_name)
        if pipeline is None:
            from transformers import pipeline as transformers_pipeline

            model_dir = config.get_models_dir() / model_config.model_name
            pipeline = transformers_pipeline(
                "automatic-speech-recognition",
                model=str(model_dir),
                tokenizer=str(model_dir),
                feature_extractor=str(model_dir),
                device=-1,
            )
            self._pipelines[model_config.model_name] = pipeline

        generate_kwargs = {}
        language = options.get("language")
        if language and language != "auto":
            generate_kwargs["language"] = language

        result = pipeline(str(Path(audio_path)), return_timestamps=True, generate_kwargs=generate_kwargs)
        text = str(result.get("text") or "").strip()
        segments = _segments_from_chunks(result.get("chunks") or [], text)
        return TranscriptionResult(
            text=text,
            language=language,
            duration=segments[-1].end if segments else None,
            segments=segments,
            model_name=model_config.model_name,
        )

    def is_loaded(self, model_name: str) -> bool:
        return model_name in self._pipelines

    def unload(self, model_name: str) -> bool:
        return self._pipelines.pop(model_name, None) is not None


def _faster_whisper_device() -> tuple[str, str]:
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda", "float16"
    except Exception:
        pass
    return "cpu", "int8"


class FasterWhisperBackend:
    def __init__(self) -> None:
        self._models: dict[str, object] = {}

    def transcribe(self, audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult:
        if WhisperModel is None:
            raise RuntimeError("faster-whisper is not installed")

        model = self._models.get(model_config.model_name)
        if model is None:
            device, compute_type = _faster_whisper_device()
            model = WhisperModel(str(config.get_models_dir() / model_config.model_name), device=device, compute_type=compute_type)
            self._models[model_config.model_name] = model

        kwargs = {
            "vad_filter": bool(options.get("vad", True)),
            "word_timestamps": bool(options.get("word_timestamps", False)),
        }
        language = options.get("language")
        if language and language != "auto":
            kwargs["language"] = language

        raw_segments, info = model.transcribe(audio_path, **kwargs)
        segments: list[TranscriptSegment] = []
        words: list[dict] = []
        texts: list[str] = []
        for index, item in enumerate(raw_segments, 1):
            text = str(getattr(item, "text", "") or "").strip()
            texts.append(text)
            segments.append(
                TranscriptSegment(
                    id=index,
                    start=float(getattr(item, "start", 0.0) or 0.0),
                    end=float(getattr(item, "end", 0.0) or 0.0),
                    text=text,
                    confidence=getattr(item, "avg_logprob", None),
                )
            )
            for word in getattr(item, "words", None) or []:
                words.append(
                    {
                        "start": float(getattr(word, "start", 0.0) or 0.0),
                        "end": float(getattr(word, "end", 0.0) or 0.0),
                        "word": str(getattr(word, "word", "") or ""),
                        "probability": getattr(word, "probability", None),
                    }
                )

        text = "".join(texts).strip()
        return TranscriptionResult(
            text=text,
            language=getattr(info, "language", language),
            duration=getattr(info, "duration", segments[-1].end if segments else None),
            segments=segments,
            words=words,
            model_name=model_config.model_name,
        )

    def is_loaded(self, model_name: str) -> bool:
        return model_name in self._models

    def unload(self, model_name: str) -> bool:
        return self._models.pop(model_name, None) is not None


_backends: dict[str, LocalASRBackend] = {
    "whisper_transformers": TransformersWhisperBackend(),
    "faster_whisper": FasterWhisperBackend(),
}


def get_backend(engine: str) -> LocalASRBackend:
    backend = _backends.get(engine)
    if backend is None:
        raise RuntimeError(f"Local ASR engine {engine} is not implemented")
    return backend


def transcribe_local(audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult:
    return get_backend(model_config.engine).transcribe(audio_path, model_config, options)


def is_model_loaded(model_name: str, engine: str) -> bool:
    try:
        return get_backend(engine).is_loaded(model_name)
    except RuntimeError:
        return False


def unload_model(model_name: str, engine: str) -> bool:
    try:
        return get_backend(engine).unload(model_name)
    except RuntimeError:
        return False
