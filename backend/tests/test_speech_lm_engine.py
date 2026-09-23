from __future__ import annotations

import pytest

from backend.backends import local_asr
from backend.backends.local_asr import (
    BaseSpeechLMAdapter,
    SpeechLMChunkOutput,
    SpeechLMLanguageRequiredError,
    TransformersSpeechLMBackend,
    _offset_speech_lm_segments,
    _offset_speech_lm_words,
    _plan_speech_lm_chunks,
)
from backend.backends.registry import ASRModelConfig
from backend.models import TranscriptSegment


class _FakeAudio:
    def __init__(self, seconds: float) -> None:
        self._data = [0.0] * int(seconds * 16000)

    def __len__(self) -> int:
        return len(self._data)

    def __getitem__(self, key):
        return self._data[key]


class _FakeChunkedAdapter(BaseSpeechLMAdapter):
    key = "fake_chunked"
    max_chunk_seconds = 30.0

    def load(self, model_dir):
        return object(), object()

    def transcribe_chunk(self, processor, model, chunk_audio, offset, model_config, options, language):
        duration = len(chunk_audio) / 16000
        segment = TranscriptSegment(id=1, start=offset, end=offset + duration, text=f"chunk@{offset:.2f}")
        return SpeechLMChunkOutput(
            text=segment.text,
            language=language,
            segments=[segment],
            words=[{"start": offset, "end": offset + 0.5, "word": "w"}],
        )


def _adapter_config(adapter: str) -> ASRModelConfig:
    return ASRModelConfig(
        model_name=f"test-{adapter}",
        display_name="test",
        engine="transformers_speech_lm",
        adapter=adapter,
        source="test",
        repo_id=None,
        model_size="small",
        size_mb=1,
        supported_devices=[],
    )


def test_plan_chunks_without_limit_keeps_single_chunk() -> None:
    adapter = BaseSpeechLMAdapter()
    audio = _FakeAudio(600)
    assert _plan_speech_lm_chunks(adapter, "audio.wav", audio) == [(audio, 0.0)]


def test_plan_chunks_short_audio_skips_vad(monkeypatch) -> None:
    adapter = _FakeChunkedAdapter()
    audio = _FakeAudio(10)

    def fail(path):
        raise AssertionError("VAD must not run for audio within the limit")

    monkeypatch.setattr(local_asr, "_fsmn_vad_speech_spans", fail)
    assert _plan_speech_lm_chunks(adapter, "audio.wav", audio) == [(audio, 0.0)]


def test_plan_chunks_splits_long_audio_at_vad_spans(monkeypatch) -> None:
    adapter = _FakeChunkedAdapter()
    audio = _FakeAudio(120)
    monkeypatch.setattr(
        local_asr,
        "_fsmn_vad_speech_spans",
        lambda path: [(1.0, 31.0), (40.0, 100.0)],
    )

    chunks = _plan_speech_lm_chunks(adapter, "audio.wav", audio)

    assert [round(offset, 2) for _chunk, offset in chunks] == [1.0, 40.0, 70.0]
    lengths = [len(chunk) / 16000 for chunk, _offset in chunks]
    assert lengths[0] == pytest.approx(30.0)
    assert lengths[1] == pytest.approx(30.0)
    assert lengths[2] == pytest.approx(30.0)
    for (_chunk, offset), length in zip(chunks, lengths, strict=True):
        assert offset + length <= 100.0


def test_plan_chunks_fails_when_vad_unavailable_for_limited_model(monkeypatch) -> None:
    adapter = _FakeChunkedAdapter()
    audio = _FakeAudio(120)
    monkeypatch.setattr(local_asr, "_fsmn_vad_speech_spans", lambda path: None)

    with pytest.raises(RuntimeError, match="fsmn-vad"):
        _plan_speech_lm_chunks(adapter, "audio.wav", audio)


def test_resolve_language_raises_for_models_without_detection() -> None:
    class _ExplicitLanguageAdapter(BaseSpeechLMAdapter):
        key = "explicit"
        requires_explicit_language = True

    adapter = _ExplicitLanguageAdapter()
    with pytest.raises(SpeechLMLanguageRequiredError):
        adapter.resolve_language({"language": "auto"})
    with pytest.raises(SpeechLMLanguageRequiredError):
        adapter.resolve_language({})
    assert adapter.resolve_language({"language": "zh"}) == "zh"


def test_resolve_language_maps_auto_to_none_by_default() -> None:
    adapter = _FakeChunkedAdapter()
    assert adapter.resolve_language({"language": "auto"}) is None
    assert adapter.resolve_language({}) is None
    assert adapter.resolve_language({"language": "zh"}) == "zh"


def test_transcribe_chunked_merges_offsets_and_renumbers(monkeypatch) -> None:
    adapter = _FakeChunkedAdapter()
    audio = _FakeAudio(120)
    monkeypatch.setattr(
        local_asr,
        "_fsmn_vad_speech_spans",
        lambda path: [(0.0, 20.0), (30.0, 70.0)],
    )
    monkeypatch.setattr(BaseSpeechLMAdapter, "load_audio_16k", staticmethod(lambda path: audio))

    result = adapter.transcribe_chunked(object(), object(), "audio.wav", _adapter_config(adapter.key), {"language": "en"})

    assert [segment.id for segment in result.segments] == [1, 2, 3]
    assert result.segments[0].start == pytest.approx(0.0)
    assert result.segments[0].end == pytest.approx(20.0)
    assert result.segments[1].start == pytest.approx(30.0)
    assert result.segments[1].end == pytest.approx(50.0)
    assert result.segments[2].start == pytest.approx(50.0)
    assert result.segments[2].end == pytest.approx(70.0)
    assert result.language == "en"
    assert result.duration == pytest.approx(70.0)
    assert [word["start"] for word in result.words] == [0.0, 30.0, 50.0]
    assert result.raw_result_summary == {
        "engine": "transformers_speech_lm",
        "adapter": "fake_chunked",
        "chunks": 3,
    }


def test_offset_helpers_shift_segments_and_words() -> None:
    segments = [TranscriptSegment(id=1, start=1.0, end=2.0, text="hi", speaker="S01")]
    shifted = _offset_speech_lm_segments(segments, 30.0)
    assert shifted[0].start == 31.0
    assert shifted[0].end == 32.0
    assert shifted[0].speaker == "S01"
    assert segments[0].start == 1.0

    words = _offset_speech_lm_words([{"start": 1.0, "end": 2.0, "word": "hi"}], 30.0)
    assert words[0]["start"] == 31.0
    assert words[0]["end"] == 32.0


def test_backend_rejects_model_without_registered_adapter(monkeypatch) -> None:
    backend = TransformersSpeechLMBackend()
    monkeypatch.setattr(local_asr, "_model_path", lambda name: __import__("pathlib").Path("/tmp/model"))

    with pytest.raises(RuntimeError, match="no speech-LM adapter"):
        backend.transcribe("audio.wav", _adapter_config("missing_adapter"), {})


def test_backend_loads_adapter_once_and_caches(monkeypatch) -> None:
    loads: list[str] = []

    class _CountingAdapter(_FakeChunkedAdapter):
        def load(self, model_dir):
            loads.append(model_dir)
            return object(), object()

        def transcribe(self, processor, model, audio_path, model_config, options):
            return local_asr.TranscriptionResult(text="ok", model_name=model_config.model_name)

    adapter = _CountingAdapter()
    monkeypatch.setitem(local_asr._SPEECH_LM_ADAPTERS, adapter.key, adapter)
    monkeypatch.setattr(local_asr, "_model_path", lambda name: __import__("pathlib").Path("/tmp/model"))
    backend = TransformersSpeechLMBackend()
    config = _adapter_config(adapter.key)

    first = backend.transcribe("audio.wav", config, {})
    second = backend.transcribe("audio.wav", config, {})

    assert first.text == second.text == "ok"
    assert loads == [__import__("pathlib").Path("/tmp/model")]
    assert backend.is_loaded(config.model_name)
    assert backend.unload(config.model_name) is True
    assert not backend.is_loaded(config.model_name)


def test_speech_lm_compat_spec_reflects_registered_adapters() -> None:
    from backend.backends.local_asr import speech_lm_compat_spec

    qwen = speech_lm_compat_spec("qwen3_asr")
    assert qwen is not None
    assert qwen["runtime_probe_key"] == "qwen3_asr_available"
    assert qwen["requires_remote_code_files"] is False

    moss = speech_lm_compat_spec("moss_transcribe_diarize")
    assert moss is not None
    assert moss["runtime_probe_key"] == "moss_transcribe_diarize_available"
    assert moss["requires_remote_code_files"] is True

    voxtral = speech_lm_compat_spec("voxtral_mini")
    assert voxtral is not None
    assert "tekken.json" in voxtral["tokenizer_files"]

    qwen_spec = speech_lm_compat_spec("qwen3_asr")
    assert qwen_spec is not None
    assert "tekken.json" not in qwen_spec["tokenizer_files"]

    assert speech_lm_compat_spec("missing") is None
    assert speech_lm_compat_spec(None) is None


def test_backend_dispatches_native_adapters_through_chunked_path(monkeypatch) -> None:
    from backend.backends.local_asr import TransformersSpeechLMBackend
    from backend.backends.registry import get_model_config

    class FakeShape:
        shape = (1, 3)

    class FakeTokenizer:
        def apply_chat_template(self, chat, tokenize, add_generation_prompt):
            return "PROMPT"

        def decode(self, tokens, add_special_tokens, skip_special_tokens):
            return "chunked text"

    class FakeProcessor:
        tokenizer = FakeTokenizer()

        def __call__(self, prompt, audio, return_tensors):
            return _NativeInputs({"input_ids": FakeShape()})

    class _FakeOutput(list):
        def __getitem__(self, key):
            if isinstance(key, tuple):
                return self
            return super().__getitem__(key)

    class FakeModel:
        def generate(self, **kwargs):
            return _FakeOutput([0, 0, 0, 0])

    audio = [0.0] * (10 * 16000)
    monkeypatch.setattr(BaseSpeechLMAdapter, "load_audio_16k", staticmethod(lambda path: audio))

    backend = TransformersSpeechLMBackend()
    config = get_model_config("granite-speech-4.1-2b")
    assert config is not None
    backend._processors[config.model_name] = FakeProcessor()
    backend._models[config.model_name] = FakeModel()

    result = backend.transcribe("audio.wav", config, {"language": "en"})

    assert result.text == "chunked text"
    assert result.segments[0].start == 0.0
    assert result.segments[0].end == 10.0
    assert result.language == "en"
    assert result.raw_result_summary == {
        "engine": "transformers_speech_lm",
        "adapter": "granite_speech",
        "chunks": 1,
    }


def test_granite_plus_timestamps_unwrap_rollover_and_silence() -> None:
    from backend.backends.local_asr import _parse_granite_plus_timestamps

    words, segments = _parse_granite_plus_timestamps(
        "hello [T:45] world [T:82] _ [T:995] again [T:005] tail [T:012]", offset=0.0
    )

    assert [(word["word"], round(word["start"], 2), round(word["end"], 2)) for word in words] == [
        ("hello", 0.0, 0.45),
        ("world", 0.45, 0.82),
        ("again", 9.95, 10.05),
        ("tail", 10.05, 10.12),
    ]
    assert [segment.text for segment in segments] == ["hello world", "again tail"]
    assert segments[0].start == 0.0
    assert segments[0].end == 0.82
    assert segments[1].start == 9.95
    assert segments[1].end == 10.12


def test_granite_plus_timestamps_offset_shifts_timeline() -> None:
    from backend.backends.local_asr import _parse_granite_plus_timestamps

    words, segments = _parse_granite_plus_timestamps("hi [T:20]", offset=30.0)
    assert words[0]["start"] == 30.0
    assert words[0]["end"] == 30.2
    assert segments[0].start == 30.0


def test_granite_plus_speaker_turns_parse_to_segments() -> None:
    from backend.backends.local_asr import _parse_granite_plus_speakers

    segments = _parse_granite_plus_speakers(
        "[Speaker 1]: hello there [Speaker 2]: bye now [Speaker 1]: back again"
    )

    assert [segment.speaker for segment in segments] == ["S01", "S02", "S01"]
    assert [segment.text for segment in segments] == ["hello there", "bye now", "back again"]
    assert all(segment.start == 0.0 and segment.end == 0.0 for segment in segments)


class _NativeInputs(dict):
    def to(self, *args, **kwargs):
        return self


class _CohereInputs(dict):
    def to(self, *args, **kwargs):
        return self


def test_granite_base_adapter_builds_prompt_and_parses_text(monkeypatch) -> None:
    from backend.backends.local_asr import GraniteSpeechAdapter

    adapter = GraniteSpeechAdapter()
    calls: list[dict] = []

    class FakeShape:
        shape = (1, 3)

    class FakeTokenizer:
        def apply_chat_template(self, chat, tokenize, add_generation_prompt):
            calls.append({"chat": chat, "prompt": chat[0]["content"]})
            return "PROMPT"

        def decode(self, tokens, add_special_tokens, skip_special_tokens):
            return "  Hello there.  "

    class FakeProcessor:
        tokenizer = FakeTokenizer()

        def __call__(self, prompt, audio, return_tensors):
            calls.append({"processor_prompt": prompt, "audio_len": len(audio)})
            return _NativeInputs({"input_ids": FakeShape()})

    class _FakeOutput(list):
        def __getitem__(self, key):
            if isinstance(key, tuple):
                return self
            return super().__getitem__(key)

    class FakeModel:
        def generate(self, **kwargs):
            calls.append({"max_new_tokens": kwargs["max_new_tokens"], "num_beams": kwargs["num_beams"]})
            return _FakeOutput([0, 0, 0, 0])

    audio = [0.0] * (20 * 16000)
    output = adapter.transcribe_chunk(FakeProcessor(), FakeModel(), audio, 30.0, _adapter_config("granite_speech"), {}, "en")

    assert output.text == "Hello there."
    assert output.segments[0].start == 30.0
    assert output.segments[0].end == 50.0
    assert calls[0]["prompt"].startswith("<|audio|>")
    assert calls[1]["processor_prompt"] == "PROMPT"
    assert calls[1]["audio_len"] == len(audio)
    assert calls[2]["max_new_tokens"] == 1024
    assert calls[2]["num_beams"] == 1


def test_cohere_adapter_requires_and_passes_explicit_language(monkeypatch) -> None:
    from backend.backends.local_asr import CohereTranscribeAdapter

    adapter = CohereTranscribeAdapter()
    calls: list[dict] = []

    class FakeProcessor:
        def __call__(self, audio, sampling_rate, return_tensors, language):
            calls.append({"audio": audio, "sampling_rate": sampling_rate, "language": language})
            return _CohereInputs({"audio_chunk_index": 3})

        def decode(self, outputs, skip_special_tokens, audio_chunk_index=None):
            calls.append({"decode_index": audio_chunk_index})
            return ["转写文本"]

    class FakeModel:
        device = None
        dtype = None

        def generate(self, **kwargs):
            return [[1, 2, 3]]

    monkeypatch.setattr(
        BaseSpeechLMAdapter,
        "load_audio_16k",
        staticmethod(lambda path: [0.0] * 16000),
    )
    config = _adapter_config("cohere_transcribe")

    with pytest.raises(SpeechLMLanguageRequiredError):
        adapter.transcribe(FakeProcessor(), FakeModel(), "audio.wav", config, {"language": "auto"})

    result = adapter.transcribe(FakeProcessor(), FakeModel(), "audio.wav", config, {"language": "zh"})
    assert result.text == "转写文本"
    assert result.language == "zh"
    assert result.segments[0].text == "转写文本"
    assert calls[0]["language"] == "zh"
    assert result.raw_result_summary["auto_chunked"] is True


def test_ark_bad_words_ids_keep_eos_and_mask_control_tokens() -> None:
    from backend.backends.local_asr import _ark_bad_words_ids

    class FakeTokenizer:
        eos_token_id = 2
        all_special_ids = [0, 1, 2]
        pad_token_id = 0

        def get_added_vocab(self):
            return {"<pad>": 0, "<im_start>": 5, "normal": 7}

    assert _ark_bad_words_ids(FakeTokenizer()) == [[0], [1], [5]]
