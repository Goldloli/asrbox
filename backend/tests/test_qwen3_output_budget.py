from __future__ import annotations

import sys
import types

from backend.backends.registry import ASRModelConfig


def _model_config() -> ASRModelConfig:
    return ASRModelConfig(
        model_name="test-qwen3",
        display_name="test",
        engine="qwen3_asr",
        source="test",
        repo_id=None,
        model_size="small",
        size_mb=1,
        supported_devices=[],
    )


class _FakeAudio:
    def __init__(self, samples: int) -> None:
        self._samples = samples

    def __len__(self) -> int:
        return self._samples


class _FakeInputs(dict):
    def to(self, *args, **kwargs):
        return self


def _run_backend(monkeypatch, audio_seconds: float, options: dict) -> dict:
    from backend.backends.local_asr import Qwen3ASRBackend

    captured: list[dict] = []

    class FakeProcessor:
        def apply_transcription_request(self, **kwargs):
            return _FakeInputs({"input_ids": [[1, 2, 3]]})

        def decode(self, ids, return_format=None):
            if return_format == "parsed":
                return [{"transcription": "hello", "language": "en"}]
            return ["hello"]

    class FakeModel:
        device = None
        dtype = None

        def generate(self, **kwargs):
            captured.append(kwargs)
            return [[1, 2, 3, 4, 5]]

    fake_audio_utils = types.ModuleType("transformers.audio_utils")
    fake_audio_utils.load_audio = lambda *args, **kwargs: _FakeAudio(int(audio_seconds * 16000))
    monkeypatch.setitem(sys.modules, "transformers.audio_utils", fake_audio_utils)

    backend = Qwen3ASRBackend()
    backend._processors["test-qwen3"] = FakeProcessor()
    backend._models["test-qwen3"] = FakeModel()
    result = backend.transcribe("audio.wav", _model_config(), options)

    assert result.text == "hello"
    return captured[0]


def test_qwen3_max_new_tokens_floor_for_short_audio(monkeypatch) -> None:
    kwargs = _run_backend(monkeypatch, audio_seconds=1, options={})
    assert kwargs["max_new_tokens"] == 1024


def test_qwen3_max_new_tokens_scales_with_duration(monkeypatch) -> None:
    kwargs = _run_backend(monkeypatch, audio_seconds=600, options={})
    assert kwargs["max_new_tokens"] == 3200


def test_qwen3_max_new_tokens_capped_for_very_long_audio(monkeypatch) -> None:
    kwargs = _run_backend(monkeypatch, audio_seconds=6000, options={})
    assert kwargs["max_new_tokens"] == 8192


def test_qwen3_max_new_tokens_explicit_override_wins(monkeypatch) -> None:
    kwargs = _run_backend(monkeypatch, audio_seconds=600, options={"max_new_tokens": 512})
    assert kwargs["max_new_tokens"] == 512
