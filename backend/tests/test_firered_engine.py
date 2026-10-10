from __future__ import annotations

import numpy as np
import torch

from backend.backends.registry import ASRModelConfig


def _model_config() -> ASRModelConfig:
    return ASRModelConfig(
        model_name="test-firered",
        display_name="test",
        engine="firered_asr",
        source="test",
        repo_id=None,
        model_size="1.1b",
        size_mb=1,
        supported_devices=["cpu", "cuda"],
    )


class _FakeFireRedAsr2:
    calls: list[list[int]] = []
    configs: list[object] = []

    def __init__(self, asr_type, feat_extractor, model, tokenizer, config):
        self.config = config

    @classmethod
    def from_pretrained(cls, asr_type, model_dir, config):
        cls.configs.append(config)
        return cls(asr_type, None, None, None, config)

    def transcribe(self, uttids, wavs):
        _FakeFireRedAsr2.calls.append([len(wav[1]) for wav in wavs])
        results = []
        for uttid, (_rate, samples) in zip(uttids, wavs):
            duration = len(samples) / 16000.0
            tokens = [
                ["你好", 0.1, 0.4],
                ["世界", 0.4, 0.8],
                ["hello", max(1.9, duration / 2), min(duration, duration / 2 + 0.4)],
            ]
            results.append({"uttid": uttid, "text": "你好世界 hello", "confidence": 0.9, "dur_s": round(duration, 3), "timestamp": tokens})
        return results


def _install(monkeypatch, audio_seconds: float, vad_spans=None) -> None:
    from backend.backends import local_asr

    _FakeFireRedAsr2.calls = []
    _FakeFireRedAsr2.configs = []
    monkeypatch.setattr("backend.vendor.fireredasr2.FireRedAsr2", _FakeFireRedAsr2)
    monkeypatch.setattr(local_asr.BaseSpeechLMAdapter, "load_audio_16k", staticmethod(lambda path: torch.zeros(int(audio_seconds * 16000))))
    if vad_spans is not None:
        monkeypatch.setattr(local_asr, "_fsmn_vad_speech_spans", lambda path: vad_spans)
    monkeypatch.setattr(local_asr, "_model_path", lambda name: __import__("pathlib").Path("/tmp/model"))


def test_firered_short_audio_single_pass(monkeypatch) -> None:
    from backend.backends.local_asr import FireRedASRBackend

    _install(monkeypatch, audio_seconds=30.0)
    result = FireRedASRBackend().transcribe("audio.wav", _model_config(), {})

    assert _FakeFireRedAsr2.calls == [[30 * 16000]]
    assert _FakeFireRedAsr2.configs[0].use_gpu == torch.cuda.is_available()
    assert _FakeFireRedAsr2.configs[0].return_timestamp is True
    assert result.raw_result_summary == {"engine": "firered_asr", "chunks": 1}
    # The 14-second token gap closes the first cue; segmentation follows speech gaps.
    assert [segment.text for segment in result.segments] == ["你好世界", "hello"]
    assert result.words[0] == {"text": "你好", "start": 0.1, "end": 0.4}
    assert result.segments[0].start == 0.1
    assert result.segments[1].start == 15.0
    assert result.segments[-1].end > 15.0


def test_firered_long_audio_chunks_via_vad_and_offsets_timestamps(monkeypatch) -> None:
    from backend.backends.local_asr import FireRedASRBackend

    _install(monkeypatch, audio_seconds=130.0, vad_spans=[(5.0, 64.0), (64.0, 120.0)])
    result = FireRedASRBackend().transcribe("audio.wav", _model_config(), {})

    # Two VAD spans of 59s fit the 59s per-pass cap without further splitting.
    assert len(_FakeFireRedAsr2.calls[0]) == 1
    chunk_samples = [call[0] for call in _FakeFireRedAsr2.calls]
    assert all(samples <= 59 * 16000 for samples in chunk_samples)
    assert result.raw_result_summary["chunks"] == len(chunk_samples)
    # Every segment lands inside global time and offsets keep the timeline monotonic.
    starts = [segment.start for segment in result.segments]
    assert starts == sorted(starts)
    assert all(5.0 - 0.001 <= segment.start for segment in result.segments[:2])
    assert result.duration <= 120.0


def test_firered_segments_group_on_gap_and_length() -> None:
    from backend.backends.local_asr import _firered_segments_from_tokens

    tokens = [
        ["你", 0.0, 0.2], ["好", 0.2, 0.4],
        ["世", 3.0, 3.2], ["界", 3.2, 3.4],
    ]
    segments, words = _firered_segments_from_tokens(tokens, offset=10.0)
    assert [(segment.text, round(segment.start, 2), round(segment.end, 2)) for segment in segments] == [
        ("你好", 10.0, 10.4),
        ("世界", 13.0, 13.4),
    ]
    assert len(words) == 4 and words[2] == {"text": "世", "start": 13.0, "end": 13.2}


def test_firered_empty_tokens_produce_no_segments() -> None:
    from backend.backends.local_asr import _firered_segments_from_tokens

    segments, words = _firered_segments_from_tokens([], offset=3.0)
    assert segments == []
    assert words == []


def test_firered_runtime_probe_reports_availability() -> None:
    from backend.services.platform import firered_asr_import_error

    assert firered_asr_import_error() is None
