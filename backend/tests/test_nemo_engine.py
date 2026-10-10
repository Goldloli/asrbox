from __future__ import annotations

import types

import pytest

from backend.backends.registry import ASRModelConfig


def _model_config(name: str = "parakeet-tdt-0.6b-v3") -> ASRModelConfig:
    return ASRModelConfig(
        model_name=name,
        display_name="test",
        engine="nemo",
        source="test",
        repo_id=None,
        model_size="0.6b",
        size_mb=1,
        supported_devices=["cuda"],
    )


class _FakeASRModel:
    instances: list["_FakeASRModel"] = []

    def __init__(self):
        self.device = None
        self.calls: list[tuple] = []
        _FakeASRModel.instances.append(self)

    @classmethod
    def restore_from(cls, path):
        return cls()

    def to(self, device):
        self.device = device

    def transcribe(self, paths, **kwargs):
        self.calls.append((list(paths), kwargs))
        return [{
            "text": "hello world",
            "timestamps": {"word": [[0.1, 0.4, "hello"], [0.4, 0.9, "world"]]},
        } for _ in paths]


@pytest.fixture()
def _nemo_installed(monkeypatch, tmp_path):
    import numpy as np

    _FakeASRModel.instances = []
    weights = tmp_path / "nemo-weights"
    weights.mkdir()
    (weights / "model.nemo").write_bytes(b"fake")
    nemo_module = types.ModuleType("nemo")
    import importlib.machinery

    nemo_module.__spec__ = importlib.machinery.ModuleSpec("nemo", None)
    collections = types.ModuleType("nemo.collections")
    asr = types.ModuleType("nemo.collections.asr")
    models = types.ModuleType("nemo.collections.asr.models")
    models.ASRModel = _FakeASRModel
    nemo_module.collections = collections
    collections.asr = asr
    asr.models = models
    monkeypatch.setitem(__import__("sys").modules, "nemo", nemo_module)
    monkeypatch.setitem(__import__("sys").modules, "nemo.collections", collections)
    monkeypatch.setitem(__import__("sys").modules, "nemo.collections.asr", asr)
    monkeypatch.setitem(__import__("sys").modules, "nemo.collections.asr.models", models)

    import torch

    monkeypatch.setattr(torch.cuda, "is_available", lambda: True)
    from backend.backends import local_asr

    monkeypatch.setattr(local_asr, "_model_path", lambda name: weights)
    monkeypatch.setattr(local_asr.BaseSpeechLMAdapter, "load_audio_16k", staticmethod(lambda path: np.zeros(16000 * 20, dtype="float32")))
    return local_asr


def test_nemo_restores_local_weights_and_maps_output(_nemo_installed) -> None:
    from backend.backends.local_asr import NemoASRBackend

    result = NemoASRBackend().transcribe("audio.wav", _model_config(), {"language": "en"})

    model = _FakeASRModel.instances[0]
    assert model.device == "cuda"
    # Parakeet v3 transcribes the original file in one pass with language kwargs.
    assert model.calls == [(["audio.wav"], {"source_lang": "en", "target_lang": "en"})]
    assert result.raw_result_summary == {"engine": "nemo", "chunks": 1}
    assert result.text == "hello world"
    assert [segment.text for segment in result.segments] == ["hello world"]
    assert result.words == [
        {"text": "hello", "start": 0.1, "end": 0.4},
        {"text": "world", "start": 0.4, "end": 0.9},
    ]
    assert result.language == "en"


def test_nemo_canary_chunks_long_audio_and_offsets_timestamps(_nemo_installed, monkeypatch, tmp_path) -> None:
    import numpy as np

    local_asr = _nemo_installed
    monkeypatch.setattr(local_asr.BaseSpeechLMAdapter, "load_audio_16k", staticmethod(lambda path: np.zeros(16000 * 700, dtype="float32")))
    monkeypatch.setattr(local_asr, "_fsmn_vad_speech_spans", lambda path: [(0.0, 700.0)])

    result = local_asr.NemoASRBackend().transcribe("audio.wav", _model_config("canary-1b-flash"), {})

    model = _FakeASRModel.instances[0]
    # 700s at the ~595s cap splits into two chunk files, never the original path.
    assert len(model.calls) == 2
    assert all(call[0][0] != "audio.wav" for call in model.calls)
    assert result.raw_result_summary["chunks"] == 2
    # The second chunk's words are offset by its start time.
    second_chunk_words = [word for word in result.words if word["start"] > 300]
    assert second_chunk_words


def test_nemo_requires_cuda(_nemo_installed, monkeypatch) -> None:
    import torch

    from backend.backends.local_asr import NemoASRBackend

    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)
    with pytest.raises(RuntimeError, match="CUDA"):
        NemoASRBackend().transcribe("audio.wav", _model_config(), {})


def test_nemo_import_error_message_when_toolkit_missing(monkeypatch) -> None:
    import sys

    from backend.services.platform import nemo_import_error

    monkeypatch.setitem(sys.modules, "nemo", None)
    assert "nemo_toolkit is not installed" in nemo_import_error()


def test_nemo_normalizes_bare_string_outputs(_nemo_installed, monkeypatch) -> None:
    from backend.backends.local_asr import NemoASRBackend

    class StringModel(_FakeASRModel):
        def transcribe(self, paths, **kwargs):
            self.calls.append((list(paths), kwargs))
            return ["plain text"] * len(paths)

    import sys

    monkeypatch.setattr(sys.modules["nemo.collections.asr.models"], "ASRModel", StringModel)
    _FakeASRModel.instances = []

    result = NemoASRBackend().transcribe("audio.wav", _model_config(), {})
    assert result.text == "plain text"
    assert result.words == []
    assert result.segments[0].text == "plain text"
