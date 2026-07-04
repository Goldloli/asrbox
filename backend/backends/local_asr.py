from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Protocol

from backend import config
from backend.backends.registry import ASRModelConfig
from backend.models import TranscriptSegment, TranscriptionResult
from backend.utils.hf_offline_patch import local_hf_files_only

try:
    from faster_whisper import WhisperModel
except Exception:  # pragma: no cover - optional runtime dependency
    WhisperModel = None

try:
    from funasr import AutoModel
    FUNASR_IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover - optional runtime dependency
    AutoModel = None
    FUNASR_IMPORT_ERROR = f"{type(exc).__name__}: {exc}"

try:
    import mlx_whisper
except Exception:  # pragma: no cover - optional runtime dependency
    mlx_whisper = None


class LocalASRBackend(Protocol):
    def transcribe(self, audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult: ...
    def is_loaded(self, model_name: str) -> bool: ...
    def unload(self, model_name: str) -> bool: ...


def _seconds(value) -> float:
    if value is None:
        return 0.0
    return float(value)


def _model_path(model_name: str) -> Path:
    model_dir = config.get_models_dir() / model_name
    marker = model_dir / "model.json"
    if marker.exists():
        try:
            snapshot_path = json.loads(marker.read_text(encoding="utf-8")).get("snapshot_path")
            if snapshot_path and Path(snapshot_path).exists():
                return Path(snapshot_path)
        except (json.JSONDecodeError, OSError):
            pass
    return model_dir


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


SENSEVOICE_TAG_RE = re.compile(r"<\|[^|]+?\|>")


def _clean_sensevoice_text(text: str) -> str:
    cleaned = SENSEVOICE_TAG_RE.sub("", text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def _funasr_time(value, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    if number > 1000:
        return number / 1000
    return number


def _funasr_segments(raw_items: list[dict], fallback_text: str) -> list[TranscriptSegment]:
    segments: list[TranscriptSegment] = []
    for item in raw_items:
        sentences = item.get("sentence_info") or item.get("sentences") or []
        for sentence in sentences:
            text = _clean_sensevoice_text(str(sentence.get("text") or ""))
            if not text:
                continue
            start = _funasr_time(sentence.get("start"), 0.0)
            end = _funasr_time(sentence.get("end"), start)
            segments.append(TranscriptSegment(id=len(segments) + 1, start=start, end=end, text=text))
        if not segments:
            timestamp = item.get("timestamp") or item.get("timestamps")
            text = _clean_sensevoice_text(str(item.get("text") or ""))
            if text:
                start = _funasr_time(timestamp[0], 0.0) if isinstance(timestamp, (list, tuple)) and timestamp else 0.0
                end = _funasr_time(timestamp[-1], start) if isinstance(timestamp, (list, tuple)) and timestamp else start
                segments.append(TranscriptSegment(id=len(segments) + 1, start=start, end=end, text=text))
    if segments:
        return segments
    return [TranscriptSegment(id=1, start=0.0, end=0.0, text=fallback_text)] if fallback_text else []


class TransformersWhisperBackend:
    def __init__(self) -> None:
        self._pipelines: dict[str, object] = {}

    def transcribe(self, audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult:
        pipeline = self._pipelines.get(model_config.model_name)
        if pipeline is None:
            from transformers import pipeline as transformers_pipeline

            model_dir = _model_path(model_config.model_name)
            with local_hf_files_only():
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
            model = WhisperModel(str(_model_path(model_config.model_name)), device=device, compute_type=compute_type)
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


class FunASRBackend:
    def __init__(self) -> None:
        self._models: dict[str, object] = {}

    def transcribe(self, audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult:
        if AutoModel is None:
            detail = FUNASR_IMPORT_ERROR or "funasr is not installed"
            raise RuntimeError(f"funasr runtime unavailable: {detail}")

        model = self._models.get(model_config.model_name)
        if model is None:
            model_dir = _model_path(model_config.model_name)
            try:
                model = AutoModel(model=str(model_dir), trust_remote_code=True, disable_update=True)
            except Exception as exc:
                raise RuntimeError(f"failed to load FunASR model: {exc}") from exc
            self._models[model_config.model_name] = model

        language = options.get("language") or "auto"
        generate_kwargs = {}
        if language != "auto":
            generate_kwargs["language"] = language
        raw = model.generate(input=audio_path, **generate_kwargs)
        raw_items = raw if isinstance(raw, list) else [raw]
        raw_items = [item for item in raw_items if isinstance(item, dict)]
        raw_text = " ".join(str(item.get("text") or "") for item in raw_items).strip()
        text = _clean_sensevoice_text(raw_text)
        segments = _funasr_segments(raw_items, text)
        duration = segments[-1].end if segments else None
        return TranscriptionResult(
            text=text or "\n".join(segment.text for segment in segments),
            language=language,
            duration=duration,
            segments=segments,
            model_name=model_config.model_name,
            raw_result_summary={
                "items": len(raw_items),
                "keys": sorted({key for item in raw_items for key in item.keys()}),
            },
        )

    def is_loaded(self, model_name: str) -> bool:
        return model_name in self._models

    def unload(self, model_name: str) -> bool:
        return self._models.pop(model_name, None) is not None


class MLXWhisperBackend:
    def __init__(self) -> None:
        self._loaded: set[str] = set()

    def transcribe(self, audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult:
        if mlx_whisper is None:
            raise RuntimeError("mlx_whisper is not installed")
        language = options.get("language")
        kwargs = {}
        if language and language != "auto":
            kwargs["language"] = language
        result = mlx_whisper.transcribe(audio_path, path_or_hf_repo=str(_model_path(model_config.model_name)), **kwargs)
        self._loaded.add(model_config.model_name)
        text = str(result.get("text") or "").strip()
        raw_segments = result.get("segments") or []
        segments = []
        for index, item in enumerate(raw_segments, 1):
            segments.append(
                TranscriptSegment(
                    id=index,
                    start=float(item.get("start") or 0.0),
                    end=float(item.get("end") or 0.0),
                    text=str(item.get("text") or "").strip(),
                )
            )
        if text and not segments:
            segments = [TranscriptSegment(id=1, start=0.0, end=0.0, text=text)]
        return TranscriptionResult(
            text=text or "\n".join(segment.text for segment in segments),
            language=language,
            duration=segments[-1].end if segments else None,
            segments=segments,
            model_name=model_config.model_name,
        )

    def is_loaded(self, model_name: str) -> bool:
        return model_name in self._loaded

    def unload(self, model_name: str) -> bool:
        if model_name not in self._loaded:
            return False
        self._loaded.remove(model_name)
        return True


def _qwen_language(language: str | None) -> str | None:
    if not language or language == "auto":
        return None
    return language


class Qwen3ASRBackend:
    def __init__(self) -> None:
        self._models: dict[str, object] = {}
        self._processors: dict[str, object] = {}

    def transcribe(self, audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult:
        processor = self._processors.get(model_config.model_name)
        model = self._models.get(model_config.model_name)
        if processor is None or model is None:
            try:
                from transformers import AutoModelForMultimodalLM, AutoProcessor
            except Exception as exc:
                raise RuntimeError("transformers with Qwen3-ASR support is required") from exc

            model_dir = _model_path(model_config.model_name)
            with local_hf_files_only():
                try:
                    processor = AutoProcessor.from_pretrained(str(model_dir))
                except Exception as exc:
                    raise RuntimeError(f"failed to load Qwen3-ASR processor: {exc}") from exc
                try:
                    model = AutoModelForMultimodalLM.from_pretrained(
                        str(model_dir),
                        torch_dtype="auto",
                        device_map="auto",
                    )
                except TypeError:
                    model = AutoModelForMultimodalLM.from_pretrained(str(model_dir))
                except Exception as exc:
                    raise RuntimeError(f"transformers with Qwen3-ASR support is required: {exc}") from exc
            self._processors[model_config.model_name] = processor
            self._models[model_config.model_name] = model

        language = _qwen_language(options.get("language"))
        request_kwargs = {"audio": str(Path(audio_path))}
        if language:
            request_kwargs["language"] = language
        inputs = processor.apply_transcription_request(**request_kwargs)
        device = getattr(model, "device", None)
        dtype = getattr(model, "dtype", None)
        if hasattr(inputs, "to") and device is not None:
            inputs = inputs.to(device, dtype) if dtype is not None else inputs.to(device)
        output_ids = model.generate(**inputs, max_new_tokens=int(options.get("max_new_tokens", 512)))
        input_ids = inputs.get("input_ids") if isinstance(inputs, dict) else getattr(inputs, "input_ids", None)
        generated_ids = output_ids
        try:
            if input_ids is not None:
                generated_ids = output_ids[:, input_ids.shape[1]:]
        except Exception:
            generated_ids = output_ids
        parsed_language = language
        text = ""
        try:
            parsed = processor.decode(generated_ids, return_format="parsed")[0]
            if isinstance(parsed, dict):
                text = str(parsed.get("transcription") or "").strip()
                parsed_language = parsed.get("language") or parsed_language
        except Exception:
            parsed = None
        if not text:
            try:
                text = str(processor.decode(generated_ids, return_format="transcription_only")[0]).strip()
            except Exception:
                decoded = processor.decode(generated_ids)
                text = str(decoded[0] if isinstance(decoded, list) else decoded).strip()
        segments = [TranscriptSegment(id=1, start=0.0, end=0.0, text=text)] if text else []
        return TranscriptionResult(
            text=text,
            language=parsed_language,
            duration=None,
            segments=segments,
            model_name=model_config.model_name,
            raw_result_summary={"engine": "qwen3_asr", "parsed": bool(parsed)},
        )

    def is_loaded(self, model_name: str) -> bool:
        return model_name in self._models

    def unload(self, model_name: str) -> bool:
        removed = self._models.pop(model_name, None) is not None
        self._processors.pop(model_name, None)
        return removed


_backends: dict[str, LocalASRBackend] = {
    "whisper_transformers": TransformersWhisperBackend(),
    "faster_whisper": FasterWhisperBackend(),
    "funasr": FunASRBackend(),
    "mlx_whisper": MLXWhisperBackend(),
    "qwen3_asr": Qwen3ASRBackend(),
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
