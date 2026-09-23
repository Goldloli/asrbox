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


class SpeechLMLanguageRequiredError(RuntimeError):
    """A model without language detection was run without an explicit language."""


class SpeechLMChunkOutput:
    """One chunk's parsed output; segment/word times are absolute already."""

    def __init__(
        self,
        text: str = "",
        language: str | None = None,
        segments: list[TranscriptSegment] | None = None,
        words: list[dict] | None = None,
    ) -> None:
        self.text = text
        self.language = language
        self.segments = segments or []
        self.words = words or []


_FSMN_VAD_CHUNK_MODEL = None


def _fsmn_vad_speech_spans(audio_path: str) -> list[tuple[float, float]] | None:
    global _FSMN_VAD_CHUNK_MODEL
    try:
        _ensure_funasr_auto_model()
        if AutoModel is None:
            return None
        if _FSMN_VAD_CHUNK_MODEL is None:
            _FSMN_VAD_CHUNK_MODEL = AutoModel(model="fsmn-vad", disable_update=True)
        raw = _FSMN_VAD_CHUNK_MODEL.generate(input=audio_path)
    except Exception:
        return None
    spans: list[tuple[float, float]] = []
    for item in raw if isinstance(raw, list) else [raw]:
        if not isinstance(item, dict):
            continue
        for span in item.get("value") or []:
            if isinstance(span, (list, tuple)) and len(span) == 2:
                spans.append((_seconds(span[0]) / 1000.0, _seconds(span[1]) / 1000.0))
    return spans


def _plan_speech_lm_chunks(
    adapter: "BaseSpeechLMAdapter",
    audio_path: str,
    audio,
) -> list[tuple[object, float]]:
    max_seconds = adapter.max_chunk_seconds
    if max_seconds is None:
        return [(audio, 0.0)]
    duration = len(audio) / 16000.0
    if duration <= max_seconds:
        return [(audio, 0.0)]
    spans = _fsmn_vad_speech_spans(audio_path)
    if not spans:
        raise RuntimeError(
            "this model accepts at most "
            f"{int(max_seconds)}s of audio per pass and fsmn-vad chunking is unavailable"
        )
    chunks: list[tuple[object, float]] = []
    for start, end in spans:
        span_len = max(end - start, 0.0)
        pieces = max(1, math.ceil(span_len / max_seconds))
        for index in range(pieces):
            piece_start = start + span_len * index / pieces
            piece_end = start + span_len * (index + 1) / pieces
            chunk = audio[int(piece_start * 16000) : int(piece_end * 16000)]
            if len(chunk) > 0:
                chunks.append((chunk, piece_start))
    return chunks or [(audio, 0.0)]


def _offset_speech_lm_segments(segments: list[TranscriptSegment], offset: float) -> list[TranscriptSegment]:
    return [
        TranscriptSegment(
            id=segment.id,
            start=segment.start + offset,
            end=segment.end + offset,
            text=segment.text,
            speaker=segment.speaker,
        )
        for segment in segments
    ]


def _offset_speech_lm_words(words: list[dict], offset: float) -> list[dict]:
    return [
        {
            **word,
            "start": float(word.get("start") or 0.0) + offset,
            "end": float(word.get("end") or 0.0) + offset,
        }
        for word in words
    ]


class BaseSpeechLMAdapter:
    key: str = ""
    max_chunk_seconds: float | None = None
    requires_explicit_language: bool = False
    runtime_probe_key: str | None = None
    runtime_missing_label: str | None = None
    requires_remote_code_files: bool = False
    tokenizer_files: tuple[str, ...] = ("tokenizer.json", "tokenizer_config.json", "vocab.json", "merges.txt")

    def load(self, model_dir: Path) -> tuple[object, object]:
        raise NotImplementedError

    def transcribe(self, processor: object, model: object, audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult:
        return self.transcribe_chunked(processor, model, audio_path, model_config, options)

    def transcribe_chunk(self, processor: object, model: object, chunk_audio, offset: float, model_config: ASRModelConfig, options: dict, language: str | None) -> SpeechLMChunkOutput:
        raise NotImplementedError

    def resolve_language(self, options: dict) -> str | None:
        language = options.get("language")
        if self.requires_explicit_language and (not language or language == "auto"):
            raise SpeechLMLanguageRequiredError("this model requires an explicit language selection")
        if not language or language == "auto":
            return None
        return language

    @staticmethod
    def load_audio_16k(audio_path: str):
        from transformers.audio_utils import load_audio

        return load_audio(str(Path(audio_path)), sampling_rate=16000, backend="librosa")

    @staticmethod
    def _scaled_max_new_tokens(audio_seconds: float, options: dict, *, per_minute: int, floor: int, cap: int) -> int:
        override = options.get("max_new_tokens")
        if override:
            return int(override)
        return min(cap, max(floor, math.ceil(audio_seconds / 60.0 * per_minute)))

    def transcribe_chunked(self, processor: object, model: object, audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult:
        language = self.resolve_language(options)
        audio = self.load_audio_16k(audio_path)
        planned = _plan_speech_lm_chunks(self, audio_path, audio)
        outputs = [
            self.transcribe_chunk(processor, model, chunk, offset, model_config, options, language)
            for chunk, offset in planned
        ]
        segments: list[TranscriptSegment] = []
        words: list[dict] = []
        for output in outputs:
            for segment in output.segments:
                segments.append(
                    TranscriptSegment(
                        id=len(segments) + 1,
                        start=segment.start,
                        end=segment.end,
                        text=segment.text,
                        speaker=segment.speaker,
                    )
                )
            words.extend(output.words)
        parsed_language = next((output.language for output in outputs if output.language), language)
        text = transcript_text_from_segments(segments)
        return TranscriptionResult(
            text=text,
            language=parsed_language,
            duration=segments[-1].end if segments else None,
            segments=segments,
            words=words,
            model_name=model_config.model_name,
            raw_result_summary={
                "engine": "transformers_speech_lm",
                "adapter": self.key,
                "chunks": len(planned),
            },
        )


class Qwen3SpeechLMAdapter(BaseSpeechLMAdapter):
    key = "qwen3_asr"
    runtime_probe_key = "qwen3_asr_available"
    runtime_missing_label = "transformers Qwen3-ASR support"

    def load(self, model_dir: Path) -> tuple[object, object]:
        try:
            from transformers import AutoModelForMultimodalLM, AutoProcessor
        except Exception as exc:
            raise RuntimeError("transformers with Qwen3-ASR support is required") from exc

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
        return processor, model

    def transcribe(self, processor: object, model: object, audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult:
        language = _qwen_language(options.get("language"))
        audio = self.load_audio_16k(audio_path)
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
            raw_result_summary={
                "engine": "transformers_speech_lm",
                "adapter": self.key,
                "parsed": bool(parsed),
            },
        )


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


class MossTranscribeDiarizeSpeechLMAdapter(BaseSpeechLMAdapter):
    key = "moss_transcribe_diarize"
    runtime_probe_key = "moss_transcribe_diarize_available"
    runtime_missing_label = "moss-transcribe-diarize runtime"
    requires_remote_code_files = True

    def load(self, model_dir: Path) -> tuple[object, object]:
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoProcessor
            from moss_transcribe_diarize.inference_utils import resolve_device
        except Exception as exc:
            raise RuntimeError("transformers >= 5 and the moss-transcribe-diarize package are required") from exc

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
        return processor, model

    def transcribe(self, processor: object, model: object, audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult:
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
            raw_result_summary={
                "engine": "transformers_speech_lm",
                "adapter": self.key,
                "parsed_segments": len(segments),
            },
        )


def _speech_lm_device_map() -> str:
    # The unified engine's catalog declares cpu/cuda only: keep MPS out of
    # device_map="auto" resolution (granite_speech_plus is broken on MPS and
    # the MPS path is unverified for the other adapters).
    import torch

    if torch.cuda.is_available():
        return "auto"
    return "cpu"


def _load_native_speech_lm(
    model_dir: Path,
    *,
    model_attr: str,
    load_kwargs: dict,
    processor_error_label: str,
    model_error_label: str,
    trust_remote_code: bool = False,
) -> tuple[object, object]:
    import transformers
    from transformers import AutoProcessor

    model_cls = getattr(transformers, model_attr)
    processor_kwargs = {"trust_remote_code": True} if trust_remote_code else {}
    if load_kwargs.get("device_map") == "auto":
        load_kwargs = {**load_kwargs, "device_map": _speech_lm_device_map()}
    with local_hf_files_only():
        try:
            processor = AutoProcessor.from_pretrained(str(model_dir), **processor_kwargs)
        except Exception as exc:
            raise RuntimeError(f"{processor_error_label}: {exc}") from exc
        try:
            model = model_cls.from_pretrained(str(model_dir), **load_kwargs)
        except TypeError:
            fallback = dict(load_kwargs)
            if "dtype" not in fallback:
                raise
            fallback["torch_dtype"] = fallback.pop("dtype")
            model = model_cls.from_pretrained(str(model_dir), **fallback)
        except Exception as exc:
            raise RuntimeError(f"{model_error_label}: {exc}") from exc
    return processor, model


class GraniteSpeechAdapter(BaseSpeechLMAdapter):
    key = "granite_speech"
    max_chunk_seconds = 180.0
    runtime_probe_key = "granite_speech_available"
    runtime_missing_label = "transformers Granite Speech support"

    def load(self, model_dir: Path) -> tuple[object, object]:
        return _load_native_speech_lm(
            model_dir,
            model_attr="AutoModelForSpeechSeq2Seq",
            load_kwargs={"dtype": "auto", "device_map": "auto"},
            processor_error_label="failed to load Granite Speech processor",
            model_error_label="failed to load Granite Speech model",
        )

    def transcribe_chunk(self, processor, model, chunk_audio, offset: float, model_config: ASRModelConfig, options: dict, language: str | None) -> SpeechLMChunkOutput:
        tokenizer = processor.tokenizer
        chat = [{"role": "user", "content": "<|audio|>transcribe the speech with proper punctuation and capitalization."}]
        prompt = tokenizer.apply_chat_template(chat, tokenize=False, add_generation_prompt=True)
        device = getattr(model, "device", None)
        inputs = processor(prompt, chunk_audio, return_tensors="pt")
        if device is not None and hasattr(inputs, "to"):
            inputs = inputs.to(device)
        max_new_tokens = self._scaled_max_new_tokens(len(chunk_audio) / 16000, options, per_minute=320, floor=1024, cap=8192)
        outputs = model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False, num_beams=1)
        new_tokens = outputs[0, inputs["input_ids"].shape[-1]:]
        text = tokenizer.decode(new_tokens, add_special_tokens=False, skip_special_tokens=True).strip()
        segments = (
            [TranscriptSegment(id=1, start=offset, end=offset + len(chunk_audio) / 16000, text=text)]
            if text
            else []
        )
        return SpeechLMChunkOutput(text=text, language=language, segments=segments)


_GRANITE_PLUS_SYSTEM_PROMPT = (
    "Knowledge Cutoff Date: April 2024.\nToday's Date: December 19, 2024.\n"
    "You are Granite, developed by IBM. You are a helpful AI assistant"
)
_GRANITE_PLUS_SAA_PROMPT = (
    "<|audio|> Speaker attribution: Transcribe and denote who is speaking by "
    "adding [Speaker 1]: and [Speaker 2]: tags before speaker turns."
)
_GRANITE_PLUS_TS_PROMPT = (
    "<|audio|> Timestamps: Transcribe the speech. After each word, add a "
    "timestamp tag showing the end time in centiseconds, e.g. hello [T:45] world [T:82]"
)
_GRANITE_PLUS_SPEAKER_RE = re.compile(r"\[Speaker (\d+)\]:")
_GRANITE_PLUS_TAG_RE = re.compile(r"(\[Speaker \d+\]:)")


def _parse_granite_plus_timestamps(text: str, offset: float) -> tuple[list[dict], list[TranscriptSegment]]:
    """Granite plus emits `[T:N]` end-of-word tags in centiseconds, truncated to
    three digits, so the counter wraps every 10 seconds and must be unwrapped."""
    parts = re.split(r"\[T:(\d+)\]", text)
    words: list[dict] = []
    segments: list[TranscriptSegment] = []
    cue_words: list[tuple[str, float, float]] = []
    wrap = 0.0
    last_end = offset
    prev_end = offset

    def flush() -> None:
        nonlocal cue_words
        if not cue_words:
            return
        segments.append(
            TranscriptSegment(
                id=len(segments) + 1,
                start=cue_words[0][1],
                end=cue_words[-1][2],
                text=" ".join(word for word, _start, _end in cue_words),
            )
        )
        cue_words = []

    for word_text, tag in zip(parts[::2], parts[1::2]):
        end = int(tag) / 100.0
        while end + wrap < last_end:
            wrap += 10.0
        end += wrap
        last_end = end
        clean = word_text.strip()
        if not clean or clean == "_":
            flush()
            prev_end = end
            continue
        words.append({"start": prev_end, "end": end, "word": clean})
        cue_words.append((clean, prev_end, end))
        if sum(len(word) for word, _start, _end in cue_words) >= 60:
            flush()
        prev_end = end
    flush()
    return words, segments


def _parse_granite_plus_speakers(text: str) -> list[TranscriptSegment]:
    segments: list[TranscriptSegment] = []
    speaker: str | None = None
    for part in _GRANITE_PLUS_TAG_RE.split(text):
        clean = part.strip()
        if not clean:
            continue
        match = _GRANITE_PLUS_SPEAKER_RE.fullmatch(clean)
        if match:
            speaker = f"S{int(match.group(1)):02d}"
            continue
        segments.append(
            TranscriptSegment(
                id=len(segments) + 1,
                start=0.0,
                end=0.0,
                text=clean,
                speaker=speaker,
            )
        )
    return segments


class GraniteSpeechPlusAdapter(BaseSpeechLMAdapter):
    key = "granite_speech_plus"
    max_chunk_seconds = 200.0
    runtime_probe_key = "granite_speech_plus_available"
    runtime_missing_label = "transformers Granite Speech plus support"

    def load(self, model_dir: Path) -> tuple[object, object]:
        return _load_native_speech_lm(
            model_dir,
            model_attr="AutoModelForSpeechSeq2Seq",
            load_kwargs={"dtype": "auto", "device_map": "auto"},
            processor_error_label="failed to load Granite Speech plus processor",
            model_error_label="failed to load Granite Speech plus model",
        )

    def transcribe_chunk(self, processor, model, chunk_audio, offset: float, model_config: ASRModelConfig, options: dict, language: str | None) -> SpeechLMChunkOutput:
        tokenizer = processor.tokenizer
        timestamps_mode = bool(options.get("word_timestamps"))
        prompt_text = _GRANITE_PLUS_TS_PROMPT if timestamps_mode else _GRANITE_PLUS_SAA_PROMPT
        chat = [
            {"role": "system", "content": _GRANITE_PLUS_SYSTEM_PROMPT},
            {"role": "user", "content": prompt_text},
        ]
        prompt = tokenizer.apply_chat_template(chat, tokenize=False, add_generation_prompt=True)
        device = getattr(model, "device", None)
        inputs = processor(prompt, chunk_audio, return_tensors="pt")
        if device is not None and hasattr(inputs, "to"):
            inputs = inputs.to(device)
        audio_seconds = len(chunk_audio) / 16000
        if timestamps_mode:
            max_new_tokens = self._scaled_max_new_tokens(audio_seconds, options, per_minute=10000, floor=2048, cap=65536)
        else:
            max_new_tokens = self._scaled_max_new_tokens(audio_seconds, options, per_minute=800, floor=1024, cap=8192)
        outputs = model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False, num_beams=1)
        new_tokens = outputs[0, inputs["input_ids"].shape[-1]:]
        text = tokenizer.decode(new_tokens, add_special_tokens=False, skip_special_tokens=True).strip()
        if not text:
            return SpeechLMChunkOutput(text="", language=language)
        if timestamps_mode:
            words, segments = _parse_granite_plus_timestamps(text, offset)
            if not segments:
                segments = [TranscriptSegment(id=1, start=offset, end=offset + audio_seconds, text=text)]
            return SpeechLMChunkOutput(text=transcript_text_from_segments(segments), language=language, segments=segments, words=words)
        parsed = _parse_granite_plus_speakers(text)
        segments = parsed or [TranscriptSegment(id=1, start=0.0, end=0.0, text=text)]
        return SpeechLMChunkOutput(text=text, language=language, segments=segments)


class CohereTranscribeAdapter(BaseSpeechLMAdapter):
    key = "cohere_transcribe"
    requires_explicit_language = True
    runtime_probe_key = "cohere_asr_available"
    runtime_missing_label = "transformers Cohere Transcribe support"

    def load(self, model_dir: Path) -> tuple[object, object]:
        return _load_native_speech_lm(
            model_dir,
            model_attr="CohereAsrForConditionalGeneration",
            load_kwargs={"dtype": "auto", "device_map": "auto"},
            processor_error_label="failed to load Cohere Transcribe processor",
            model_error_label="failed to load Cohere Transcribe model",
        )

    def transcribe(self, processor, model, audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult:
        language = self.resolve_language(options)
        audio = self.load_audio_16k(audio_path)
        inputs = processor(audio, sampling_rate=16000, return_tensors="pt", language=language)
        device = getattr(model, "device", None)
        dtype = getattr(model, "dtype", None)
        if hasattr(inputs, "to") and device is not None:
            inputs = inputs.to(device, dtype) if dtype is not None else inputs.to(device)
        max_new_tokens = self._scaled_max_new_tokens(len(audio) / 16000, options, per_minute=320, floor=1024, cap=8192)
        outputs = model.generate(**inputs, max_new_tokens=max_new_tokens)
        chunk_index = inputs.get("audio_chunk_index") if hasattr(inputs, "get") else None
        try:
            decoded = processor.decode(
                outputs,
                skip_special_tokens=True,
                audio_chunk_index=chunk_index,
                language=language,
            )
        except TypeError:
            decoded = processor.decode(outputs, skip_special_tokens=True)
        text = str(decoded[0]).strip() if isinstance(decoded, list) else str(decoded).strip()
        segments = [TranscriptSegment(id=1, start=0.0, end=0.0, text=text)] if text else []
        return TranscriptionResult(
            text=text,
            language=language,
            duration=None,
            segments=segments,
            model_name=model_config.model_name,
            raw_result_summary={
                "engine": "transformers_speech_lm",
                "adapter": self.key,
                "auto_chunked": chunk_index is not None,
            },
        )


class ArkASRAdapter(BaseSpeechLMAdapter):
    key = "ark_asr"
    max_chunk_seconds = 30.0
    requires_remote_code_files = True
    runtime_missing_label = "transformers ARK-ASR support"

    def __init__(self) -> None:
        self._tokenizers: dict[int, object] = {}
        self._bad_words: dict[int, list] = {}

    def _tokenizer_for(self, processor: object) -> object:
        tokenizer = self._tokenizers.get(id(processor))
        if tokenizer is None:
            tokenizer = getattr(processor, "tokenizer", None)
        if tokenizer is None:
            raise RuntimeError("ARK-ASR tokenizer is unavailable")
        return tokenizer

    def load(self, model_dir: Path) -> tuple[object, object]:
        import torch
        from transformers import AutoModelForCausalLM, AutoProcessor, AutoTokenizer

        device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
        dtype = torch.bfloat16 if device.type == "cuda" else torch.float32
        with local_hf_files_only():
            try:
                processor = AutoProcessor.from_pretrained(str(model_dir), trust_remote_code=True)
            except Exception as exc:
                raise RuntimeError(f"failed to load ARK-ASR processor: {exc}") from exc
            try:
                tokenizer = AutoTokenizer.from_pretrained(str(model_dir), trust_remote_code=True)
            except Exception as exc:
                raise RuntimeError(f"failed to load ARK-ASR tokenizer: {exc}") from exc
            load_kwargs = {"trust_remote_code": True, "dtype": "auto", "attn_implementation": "sdpa"}
            try:
                model = AutoModelForCausalLM.from_pretrained(str(model_dir), **load_kwargs)
            except TypeError:
                fallback = dict(load_kwargs)
                fallback["torch_dtype"] = fallback.pop("dtype")
                model = AutoModelForCausalLM.from_pretrained(str(model_dir), **fallback)
            except Exception as exc:
                raise RuntimeError(f"failed to load ARK-ASR model: {exc}") from exc
        model = model.to(dtype=dtype).to(device).eval()
        self._tokenizers[id(processor)] = tokenizer
        self._bad_words[id(processor)] = _ark_bad_words_ids(tokenizer)
        return processor, model

    def transcribe_chunk(self, processor, model, chunk_audio, offset: float, model_config: ASRModelConfig, options: dict, language: str | None) -> SpeechLMChunkOutput:
        import tempfile

        import soundfile

        tokenizer = self._tokenizer_for(processor)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            temp_path = tmp.name
        soundfile.write(temp_path, chunk_audio, 16000)
        try:
            conversation = [
                {
                    "role": "user",
                    "content": [
                        {"type": "audio", "path": temp_path},
                        {"type": "text", "text": "Please transcribe this audio."},
                    ],
                }
            ]
            inputs = processor.apply_chat_template(
                conversation,
                add_generation_prompt=True,
                return_tensors="pt",
                sampling_rate=16000,
                audio_padding="longest",
                text_kwargs={"padding": "longest"},
                audio_max_length=30 * 16000,
            )
            device = getattr(model, "device", None)
            dtype = getattr(model, "dtype", None)
            if device is not None and hasattr(inputs, "to"):
                inputs = inputs.to(device)
                if "audios" in inputs and dtype is not None:
                    inputs["audios"] = inputs["audios"].to(dtype=dtype)
            import torch

            with torch.inference_mode():
                outputs = model.generate(
                    **inputs,
                    do_sample=False,
                    max_new_tokens=int(options.get("max_new_tokens") or 512),
                    pad_token_id=tokenizer.pad_token_id,
                    eos_token_id=tokenizer.eos_token_id,
                    bad_words_ids=self._bad_words.get(id(processor)),
                )
            decoded = tokenizer.batch_decode(outputs[:, inputs.input_ids.shape[1]:], skip_special_tokens=True)
            text = str(decoded[0]).strip() if decoded else ""
        finally:
            try:
                import os

                os.unlink(temp_path)
            except OSError:
                pass
        segments = (
            [TranscriptSegment(id=1, start=offset, end=offset + len(chunk_audio) / 16000, text=text)]
            if text
            else []
        )
        return SpeechLMChunkOutput(text=text, language=language, segments=segments)


def _ark_bad_words_ids(tokenizer: object) -> list:
    eos_ids = tokenizer.eos_token_id
    keep_ids = {eos_ids} if isinstance(eos_ids, int) else set(eos_ids or [])
    bad_ids = set(tokenizer.all_special_ids) - keep_ids
    bad_ids.update(
        token_id
        for token, token_id in tokenizer.get_added_vocab().items()
        if token.startswith("<") and token.endswith(">") and token_id not in keep_ids
    )
    return [[token_id] for token_id in sorted(bad_ids)]


class VoxtralMiniAdapter(BaseSpeechLMAdapter):
    key = "voxtral_mini"
    max_chunk_seconds = 1800.0
    runtime_probe_key = "voxtral_available"
    runtime_missing_label = "transformers Voxtral support"
    # Mistral ships its Tekken tokenizer instead of the classic tokenizer files.
    tokenizer_files = ("tokenizer.json", "tekken.json")

    def load(self, model_dir: Path) -> tuple[object, object]:
        return _load_native_speech_lm(
            model_dir,
            model_attr="VoxtralForConditionalGeneration",
            load_kwargs={"dtype": "auto", "device_map": "auto"},
            processor_error_label="failed to load Voxtral processor",
            model_error_label="failed to load Voxtral model",
        )

    def transcribe_chunk(self, processor, model, chunk_audio, offset: float, model_config: ASRModelConfig, options: dict, language: str | None) -> SpeechLMChunkOutput:
        request_kwargs = {"audio": chunk_audio, "model_id": model_config.repo_id, "sampling_rate": 16000}
        if language:
            request_kwargs["language"] = language
        try:
            inputs = processor.apply_transcription_request(**request_kwargs)
        except Exception:
            import tempfile

            import soundfile

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                temp_path = tmp.name
            soundfile.write(temp_path, chunk_audio, 16000)
            try:
                inputs = processor.apply_transcription_request(audio=temp_path, model_id=model_config.repo_id, **({"language": language} if language else {}))
            finally:
                import os

                try:
                    os.unlink(temp_path)
                except OSError:
                    pass
        device = getattr(model, "device", None)
        dtype = getattr(model, "dtype", None)
        if hasattr(inputs, "to") and device is not None:
            inputs = inputs.to(device, dtype) if dtype is not None else inputs.to(device)
        max_new_tokens = self._scaled_max_new_tokens(len(chunk_audio) / 16000, options, per_minute=320, floor=1024, cap=16384)
        outputs = model.generate(**inputs, max_new_tokens=max_new_tokens)
        decoded = processor.batch_decode(outputs[:, inputs.input_ids.shape[1]:], skip_special_tokens=True)
        text = str(decoded[0]).strip() if decoded else ""
        segments = (
            [TranscriptSegment(id=1, start=offset, end=offset + len(chunk_audio) / 16000, text=text)]
            if text
            else []
        )
        return SpeechLMChunkOutput(text=text, language=language, segments=segments)


_SPEECH_LM_ADAPTERS: dict[str, BaseSpeechLMAdapter] = {
    Qwen3SpeechLMAdapter.key: Qwen3SpeechLMAdapter(),
    MossTranscribeDiarizeSpeechLMAdapter.key: MossTranscribeDiarizeSpeechLMAdapter(),
    GraniteSpeechAdapter.key: GraniteSpeechAdapter(),
    GraniteSpeechPlusAdapter.key: GraniteSpeechPlusAdapter(),
    CohereTranscribeAdapter.key: CohereTranscribeAdapter(),
    ArkASRAdapter.key: ArkASRAdapter(),
    VoxtralMiniAdapter.key: VoxtralMiniAdapter(),
}


def speech_lm_compat_spec(adapter_key: str | None) -> dict | None:
    adapter = _SPEECH_LM_ADAPTERS.get(adapter_key or "")
    if adapter is None:
        return None
    return {
        "runtime_probe_key": adapter.runtime_probe_key,
        "runtime_missing_label": adapter.runtime_missing_label,
        "requires_remote_code_files": adapter.requires_remote_code_files,
        "tokenizer_files": list(adapter.tokenizer_files),
    }


class TransformersSpeechLMBackend:
    def __init__(self) -> None:
        self._models: dict[str, object] = {}
        self._processors: dict[str, object] = {}

    def transcribe(self, audio_path: str, model_config: ASRModelConfig, options: dict) -> TranscriptionResult:
        adapter = _SPEECH_LM_ADAPTERS.get(model_config.adapter or "")
        if adapter is None:
            raise RuntimeError(f"no speech-LM adapter registered for {model_config.model_name}")
        processor = self._processors.get(model_config.model_name)
        model = self._models.get(model_config.model_name)
        if processor is None or model is None:
            processor, model = adapter.load(_model_path(model_config.model_name))
            self._processors[model_config.model_name] = processor
            self._models[model_config.model_name] = model
        return adapter.transcribe(processor, model, audio_path, model_config, options)

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
    "transformers_speech_lm": TransformersSpeechLMBackend(),
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
