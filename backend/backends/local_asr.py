from __future__ import annotations

import builtins
import json
import math
from pathlib import Path
import re
from typing import Protocol

from backend import config
from backend.backends.registry import ASRModelConfig
from backend.models import TranscriptSegment, TranscriptionResult
from backend.utils.hf_offline_patch import local_hf_files_only
from backend.utils.transcript_text import _needs_space, normalize_transcript_text, transcript_text_from_segments

try:
    from faster_whisper import WhisperModel
except Exception:  # pragma: no cover - optional runtime dependency
    WhisperModel = None

AutoModel = None
FUNASR_IMPORT_ERROR = None
_FUNASR_IMPORT_ATTEMPTED = False

try:
    import mlx_whisper
    MLX_WHISPER_IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover - optional runtime dependency
    mlx_whisper = None
    MLX_WHISPER_IMPORT_ERROR = f"{type(exc).__name__}: {exc}"


class LocalASRBackend(Protocol):
    def transcribe(self, audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult: ...
    def is_loaded(self, model_name: str) -> bool: ...
    def unload(self, model_name: str) -> bool: ...


def _ensure_funasr_auto_model() -> None:
    """Load FunASR and its frozen registry on first use, not app startup."""
    global AutoModel, FUNASR_IMPORT_ERROR, _FUNASR_IMPORT_ATTEMPTED
    if AutoModel is not None or _FUNASR_IMPORT_ATTEMPTED:
        return
    _FUNASR_IMPORT_ATTEMPTED = True
    try:
        preload = getattr(builtins, "_asrbox_preload_funasr_submodules", None)
        if callable(preload):
            preload()
        if AutoModel is None:
            from funasr import AutoModel as FunASRAutoModel

            AutoModel = FunASRAutoModel
        FUNASR_IMPORT_ERROR = None
    except Exception as exc:  # pragma: no cover - optional runtime dependency
        AutoModel = None
        FUNASR_IMPORT_ERROR = f"{type(exc).__name__}: {exc}"


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
        except (json.JSONDecodeError, OSError):
            snapshot_path = None
        if snapshot_path:
            recorded = Path(snapshot_path)
            if recorded.exists():
                return recorded
            # The marker stores an absolute snapshot path from the storage root that
            # was active at download time. After a model-storage relocation that path
            # is stale, so re-anchor the portion below the model directory under the
            # current storage root before giving up on the snapshot layout.
            if model_name in recorded.parts:
                suffix = recorded.parts[recorded.parts.index(model_name) + 1 :]
                if suffix:
                    reanchored = model_dir.joinpath(*suffix)
                    if reanchored.exists():
                        return reanchored
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


_FUNASR_VAD_MAX_SEGMENT_MS = 30000
_PARAFORMER_SEGMENT_GAP_SECONDS = 0.8
_PARAFORMER_MAX_SEGMENT_CHARS = 60


def _funasr_model_spec(model_name: str) -> dict:
    specs = {
        "paraformer-zh": {"vad": True, "parse": "paraformer"},
        "fun-asr-nano": {"vad": True, "parse": "plain"},
    }
    return specs.get(model_name, {"vad": False, "parse": "sensevoice"})


def _parse_funasr_sensevoice(raw_items: list[dict]) -> tuple[str, list[TranscriptSegment]]:
    raw_text = " ".join(str(item.get("text") or "") for item in raw_items).strip()
    text = _clean_sensevoice_text(raw_text)
    segments = _funasr_segments(raw_items, text)
    return text, segments


def _paraformer_ms(value) -> float | None:
    try:
        return float(value) / 1000.0
    except (TypeError, ValueError):
        return None


def _join_paraformer_tokens(tokens: list[str]) -> str:
    if not tokens:
        return ""
    joined = tokens[0]
    for token in tokens[1:]:
        joined = joined + (" " if _needs_space(joined, token) else "") + token
    return joined


def _paraformer_segments(text: str, timestamp) -> list[TranscriptSegment]:
    """Aggregate Paraformer's per-token millisecond timestamps into segments.

    funasr returns ``text`` as space-joined tokens and ``timestamp`` as one
    ``[start_ms, end_ms]`` pair per token, so alignment is token-wise. Tokens
    are grouped until a silence gap or the length cap, keeping the output
    timeline monotonic and grounded in the model's own timestamps.
    """

    spans = [_paraformer_ms(span[0]) if isinstance(span, (list, tuple)) and len(span) == 2 else None for span in timestamp]
    ends = [_paraformer_ms(span[1]) if isinstance(span, (list, tuple)) and len(span) == 2 else None for span in timestamp]
    tokens = text.split(" ") if text else []
    if not spans or len(spans) != len(tokens) or not any(span is not None for span in spans):
        return []

    segments: list[TranscriptSegment] = []
    current: list[tuple[str, float, float]] = []

    def flush() -> None:
        nonlocal current
        if not current:
            return
        segment_text = _join_paraformer_tokens([entry[0] for entry in current]).strip()
        if segment_text:
            segments.append(
                TranscriptSegment(
                    id=len(segments) + 1,
                    start=current[0][1],
                    end=current[-1][2],
                    text=segment_text,
                )
            )
        current = []

    previous_end: float | None = None
    for index, token in enumerate(tokens):
        start = spans[index]
        end = ends[index] if ends[index] is not None else start
        if start is None:
            start = previous_end if previous_end is not None else (current[-1][2] if current else 0.0)
        if end is None or end < start:
            end = start
        gap_break = previous_end is not None and (start - previous_end) > _PARAFORMER_SEGMENT_GAP_SECONDS
        length_break = sum(len(entry[0]) for entry in current) >= _PARAFORMER_MAX_SEGMENT_CHARS
        if gap_break or length_break:
            flush()
        current.append((token, start, end))
        previous_end = end
    flush()
    return segments


def _parse_funasr_paraformer(raw_items: list[dict]) -> tuple[str, list[TranscriptSegment]]:
    segments: list[TranscriptSegment] = []
    rebuilt_items: list[str] = []
    for item in raw_items:
        item_text = str(item.get("text") or "")
        if not item_text:
            continue
        rebuilt_items.append(_join_paraformer_tokens(item_text.split(" ")))
        timestamp = item.get("timestamp") or item.get("timestamps") or []
        aggregated = _paraformer_segments(item_text, timestamp)
        if aggregated:
            segments.extend(aggregated)
        else:
            # Missing or length-mismatched timestamps: keep the real text with a
            # zero timeline instead of fabricating cue times.
            start = _paraformer_ms(timestamp[0][0]) if isinstance(timestamp, (list, tuple)) and timestamp and isinstance(timestamp[0], (list, tuple)) and len(timestamp[0]) == 2 else None
            end = _paraformer_ms(timestamp[-1][1]) if isinstance(timestamp, (list, tuple)) and timestamp and isinstance(timestamp[-1], (list, tuple)) and len(timestamp[-1]) == 2 else None
            if start is None or end is None:
                segments.append(TranscriptSegment(id=len(segments) + 1, start=0.0, end=0.0, text=rebuilt_items[-1]))
            else:
                segments.append(TranscriptSegment(id=len(segments) + 1, start=start, end=end, text=rebuilt_items[-1]))
    text = " ".join(rebuilt_items).strip()
    return text, segments


def _parse_funasr_plain(raw_items: list[dict]) -> tuple[str, list[TranscriptSegment]]:
    text = " ".join(str(item.get("text") or "") for item in raw_items).strip()
    segments = [TranscriptSegment(id=1, start=0.0, end=0.0, text=text)] if text else []
    return text, segments


_FUNASR_PARSERS = {
    "sensevoice": _parse_funasr_sensevoice,
    "paraformer": _parse_funasr_paraformer,
    "plain": _parse_funasr_plain,
}


class TransformersWhisperBackend:
    def __init__(self) -> None:
        self._pipelines: dict[str, object] = {}

    def transcribe(self, audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult:
        pipeline = self._pipelines.get(model_config.model_name)
        if pipeline is None:
            import torch
            from transformers import pipeline as transformers_pipeline

            model_dir = _model_path(model_config.model_name)
            device, dtype = _transformers_device(torch)
            pipeline_options = {"device": device}
            if dtype is not None:
                pipeline_options["torch_dtype"] = dtype
            with local_hf_files_only():
                pipeline = transformers_pipeline(
                    "automatic-speech-recognition",
                    model=str(model_dir),
                    tokenizer=str(model_dir),
                    feature_extractor=str(model_dir),
                    **pipeline_options,
                )
            self._pipelines[model_config.model_name] = pipeline

        generate_kwargs = {"no_repeat_ngram_size": int(options.get("no_repeat_ngram_size", 3))}
        language = options.get("language")
        if language and language != "auto":
            generate_kwargs["language"] = language

        from transformers.audio_utils import load_audio

        audio = load_audio(str(Path(audio_path)), sampling_rate=16000, backend="librosa")
        result = pipeline(audio, return_timestamps=True, generate_kwargs=generate_kwargs)
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


def _transformers_device(torch_module) -> tuple[object, object | None]:
    if torch_module.cuda.is_available():
        return 0, torch_module.float16
    mps = getattr(torch_module.backends, "mps", None)
    if mps is not None and mps.is_available():
        return "mps", torch_module.float16
    return -1, None


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
            "condition_on_previous_text": bool(options.get("condition_on_previous_text", False)),
            "no_repeat_ngram_size": int(options.get("no_repeat_ngram_size", 3)),
            "repetition_penalty": float(options.get("repetition_penalty", 1.1)),
            "hallucination_silence_threshold": float(options.get("hallucination_silence_threshold", 2.0)),
        }
        language = options.get("language")
        if language and language != "auto":
            kwargs["language"] = language

        raw_segments, info = model.transcribe(audio_path, **kwargs)
        segments: list[TranscriptSegment] = []
        words: list[dict] = []
        texts: list[str] = []
        for index, item in enumerate(raw_segments, 1):
            raw_text = str(getattr(item, "text", "") or "")
            text = raw_text.strip()
            texts.append(raw_text)
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

        text = normalize_transcript_text("".join(texts)) or transcript_text_from_segments(segments)
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
        self._models: dict[tuple[str, bool], object] = {}

    def transcribe(self, audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult:
        _ensure_funasr_auto_model()
        if AutoModel is None:
            detail = FUNASR_IMPORT_ERROR or "funasr is not installed"
            raise RuntimeError(f"funasr runtime unavailable: {detail}")

        spec = _funasr_model_spec(model_config.model_name)
        vad_option = options.get("vad")
        use_vad = bool(spec["vad"]) if vad_option is None else bool(vad_option)

        model = self._models.get((model_config.model_name, use_vad))
        if model is None:
            model_dir = _model_path(model_config.model_name)
            load_kwargs: dict = {"trust_remote_code": True, "disable_update": True}
            if use_vad:
                load_kwargs["vad_model"] = "fsmn-vad"
                load_kwargs["vad_kwargs"] = {"max_single_segment_time": _FUNASR_VAD_MAX_SEGMENT_MS}
            try:
                model = AutoModel(model=str(model_dir), **load_kwargs)
            except Exception as exc:
                if use_vad:
                    raise RuntimeError(
                        f"failed to load FunASR model with VAD (can be disabled via the task option vad=false): {exc}"
                    ) from exc
                raise RuntimeError(f"failed to load FunASR model: {exc}") from exc
            self._models[(model_config.model_name, use_vad)] = model

        language = options.get("language") or "auto"
        generate_kwargs = {}
        if spec["parse"] == "sensevoice" and language != "auto":
            generate_kwargs["language"] = language
        if spec["parse"] == "paraformer":
            # Paraformer emits its per-char timestamps only when the predictor is
            # enabled at generate time; without this the output is text-only.
            generate_kwargs["pred_timestamp"] = True
        raw = model.generate(input=audio_path, **generate_kwargs)
        raw_items = raw if isinstance(raw, list) else [raw]
        raw_items = [item for item in raw_items if isinstance(item, dict)]
        text, segments = _FUNASR_PARSERS[spec["parse"]](raw_items)
        duration = segments[-1].end if segments else None
        return TranscriptionResult(
            text=text or transcript_text_from_segments(segments),
            language=language,
            duration=duration,
            segments=segments,
            model_name=model_config.model_name,
            raw_result_summary={
                "items": len(raw_items),
                "keys": sorted({key for item in raw_items for key in item.keys()}),
                "vad": use_vad,
            },
        )

    def is_loaded(self, model_name: str) -> bool:
        return any(loaded_name == model_name for loaded_name, _use_vad in self._models)

    def unload(self, model_name: str) -> bool:
        keys = [(loaded_name, use_vad) for loaded_name, use_vad in self._models if loaded_name == model_name]
        for key in keys:
            self._models.pop(key, None)
        return bool(keys)


class MLXWhisperBackend:
    def __init__(self) -> None:
        self._loaded: set[str] = set()

    def transcribe(self, audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult:
        if mlx_whisper is None:
            detail = MLX_WHISPER_IMPORT_ERROR or "mlx_whisper is not installed"
            raise RuntimeError(f"mlx_whisper runtime is unavailable: {detail}")
        language = options.get("language")
        kwargs = {
            "condition_on_previous_text": bool(options.get("condition_on_previous_text", False)),
        }
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
            text=text or transcript_text_from_segments(segments),
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
        from transformers.audio_utils import load_audio

        audio = load_audio(str(Path(audio_path)), sampling_rate=16000, backend="librosa")
        request_kwargs = {"audio": audio}
        if language:
            request_kwargs["language"] = language
        inputs = processor.apply_transcription_request(**request_kwargs)
        device = getattr(model, "device", None)
        dtype = getattr(model, "dtype", None)
        if hasattr(inputs, "to") and device is not None:
            inputs = inputs.to(device, dtype) if dtype is not None else inputs.to(device)
        max_new_tokens = options.get("max_new_tokens")
        if not max_new_tokens:
            duration_minutes = len(audio) / 16000 / 60
            max_new_tokens = min(8192, max(1024, math.ceil(duration_minutes * 320)))
        output_ids = model.generate(**inputs, max_new_tokens=int(max_new_tokens))
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


def _moss_max_new_tokens(audio_path: str, options: dict) -> int:
    override = options.get("max_new_tokens")
    if override:
        return int(override)
    try:
        import soundfile

        duration_minutes = soundfile.info(audio_path).duration / 60
    except Exception:
        return 8192
    # Long-form diarized output needs generous token headroom; the upstream
    # serving guide recommends up to 65536 for ~90 minute recordings.
    return min(65536, max(4096, math.ceil(duration_minutes * 800)))


class MossTranscribeDiarizeBackend:
    """End-to-end transcription + diarization via MOSS-Transcribe-Diarize."""

    def __init__(self) -> None:
        self._models: dict[str, object] = {}
        self._processors: dict[str, object] = {}

    def transcribe(self, audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult:
        processor = self._processors.get(model_config.model_name)
        model = self._models.get(model_config.model_name)
        if processor is None or model is None:
            try:
                import torch
                from transformers import AutoModelForCausalLM, AutoProcessor
                from moss_transcribe_diarize.inference_utils import resolve_device
            except Exception as exc:
                raise RuntimeError("transformers >= 5 and the moss-transcribe-diarize package are required") from exc

            model_dir = _model_path(model_config.model_name)
            device = resolve_device("auto")
            dtype = torch.bfloat16 if device.type == "cuda" else torch.float32
            with local_hf_files_only():
                try:
                    processor = AutoProcessor.from_pretrained(str(model_dir), trust_remote_code=True)
                except Exception as exc:
                    raise RuntimeError(f"failed to load MOSS-Transcribe-Diarize processor: {exc}") from exc
                load_kwargs = {"trust_remote_code": True, "dtype": "auto"}
                try:
                    model = AutoModelForCausalLM.from_pretrained(str(model_dir), **load_kwargs)
                except TypeError:
                    load_kwargs["torch_dtype"] = load_kwargs.pop("dtype")
                    model = AutoModelForCausalLM.from_pretrained(str(model_dir), **load_kwargs)
                except Exception as exc:
                    raise RuntimeError(f"failed to load MOSS-Transcribe-Diarize model: {exc}") from exc
            model = model.to(dtype=dtype).to(device).eval()
            self._processors[model_config.model_name] = processor
            self._models[model_config.model_name] = model

        from moss_transcribe_diarize import parse_transcript
        from moss_transcribe_diarize.inference_utils import build_transcription_messages, generate_transcription

        messages = build_transcription_messages(audio_path)
        result = generate_transcription(
            model,
            processor,
            messages,
            max_new_tokens=_moss_max_new_tokens(audio_path, options),
            do_sample=False,
        )
        text = str(result.get("text") or "").strip()
        segments: list[TranscriptSegment] = []
        if text:
            try:
                for parsed in parse_transcript(text):
                    segment_text = str(parsed.text or "").strip()
                    if not segment_text:
                        continue
                    segments.append(
                        TranscriptSegment(
                            id=len(segments) + 1,
                            start=_seconds(parsed.start),
                            end=_seconds(parsed.end),
                            text=segment_text,
                            speaker=str(parsed.speaker) if parsed.speaker else None,
                        )
                    )
            except Exception:
                segments = []
        if not segments and text:
            segments = [TranscriptSegment(id=1, start=0.0, end=0.0, text=text)]
        return TranscriptionResult(
            text=text or transcript_text_from_segments(segments),
            language=options.get("language") or None,
            duration=None,
            segments=segments,
            model_name=model_config.model_name,
            raw_result_summary={"engine": "moss_transcribe_diarize", "parsed_segments": len(segments)},
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
    "moss_transcribe_diarize": MossTranscribeDiarizeBackend(),
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
