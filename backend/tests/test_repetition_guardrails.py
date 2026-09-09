from __future__ import annotations

from pathlib import Path

from backend.backends.registry import ASRModelConfig
from backend.models import TranscriptSegment
from backend.services import postprocess, quality


def _model_config(engine: str) -> ASRModelConfig:
    return ASRModelConfig(
        model_name=f"test-{engine}",
        display_name="test",
        engine=engine,
        source="test",
        repo_id=None,
        model_size="small",
        size_mb=1,
        supported_devices=[],
    )


def test_faster_whisper_defaults_guard_against_repetition(tmp_path: Path, monkeypatch) -> None:
    from backend.backends.local_asr import FasterWhisperBackend

    captured: list[dict] = []

    class FakeWhisperModel:
        def __init__(self, *args, **kwargs):
            pass

        def transcribe(self, audio_path, **kwargs):
            captured.append(kwargs)
            return [], type("Info", (), {"language": "en", "duration": 1.0})()

    monkeypatch.setattr("backend.backends.local_asr.WhisperModel", FakeWhisperModel)
    monkeypatch.setattr("backend.backends.local_asr._faster_whisper_device", lambda: ("cpu", "int8"))
    monkeypatch.setattr("backend.backends.local_asr._model_path", lambda name: tmp_path)

    FasterWhisperBackend().transcribe("audio.wav", _model_config("faster_whisper"), {})

    kwargs = captured[0]
    assert kwargs["condition_on_previous_text"] is False
    assert kwargs["no_repeat_ngram_size"] == 3
    assert kwargs["repetition_penalty"] == 1.1
    assert kwargs["hallucination_silence_threshold"] == 2.0


def test_faster_whisper_options_override_guard_defaults(tmp_path: Path, monkeypatch) -> None:
    from backend.backends.local_asr import FasterWhisperBackend

    captured: list[dict] = []

    class FakeWhisperModel:
        def __init__(self, *args, **kwargs):
            pass

        def transcribe(self, audio_path, **kwargs):
            captured.append(kwargs)
            return [], type("Info", (), {"language": "en", "duration": 1.0})()

    monkeypatch.setattr("backend.backends.local_asr.WhisperModel", FakeWhisperModel)
    monkeypatch.setattr("backend.backends.local_asr._faster_whisper_device", lambda: ("cpu", "int8"))
    monkeypatch.setattr("backend.backends.local_asr._model_path", lambda name: tmp_path)

    FasterWhisperBackend().transcribe(
        "audio.wav",
        _model_config("faster_whisper"),
        {"condition_on_previous_text": True, "no_repeat_ngram_size": 0, "repetition_penalty": 1.0},
    )

    kwargs = captured[0]
    assert kwargs["condition_on_previous_text"] is True
    assert kwargs["no_repeat_ngram_size"] == 0
    assert kwargs["repetition_penalty"] == 1.0


def test_mlx_whisper_disables_condition_on_previous_text(tmp_path: Path, monkeypatch) -> None:
    from backend.backends.local_asr import MLXWhisperBackend

    captured: list[dict] = []

    def fake_transcribe(audio_path, **kwargs):
        captured.append(kwargs)
        return {"text": "hello", "segments": [{"start": 0.0, "end": 1.0, "text": "hello"}]}

    monkeypatch.setattr(
        "backend.backends.local_asr.mlx_whisper",
        type("FakeMlxWhisper", (), {"transcribe": staticmethod(fake_transcribe)})(),
    )
    monkeypatch.setattr("backend.backends.local_asr._model_path", lambda name: tmp_path)

    MLXWhisperBackend().transcribe("audio.wav", _model_config("mlx_whisper"), {})

    assert captured[0]["condition_on_previous_text"] is False


def test_transformers_whisper_generate_kwargs_suppress_repetition(monkeypatch) -> None:
    from backend.backends.local_asr import TransformersWhisperBackend

    captured: list[dict] = []

    def fake_pipeline(audio, **kwargs):
        captured.append(kwargs)
        return {"text": "你好", "chunks": [{"text": "你好", "timestamp": (0.0, 1.0)}]}

    monkeypatch.setattr("transformers.audio_utils.load_audio", lambda *args, **kwargs: b"audio")
    backend = TransformersWhisperBackend()
    backend._pipelines["test-whisper_transformers"] = fake_pipeline

    backend.transcribe("audio.wav", _model_config("whisper_transformers"), {})
    backend.transcribe("audio.wav", _model_config("whisper_transformers"), {"no_repeat_ngram_size": 5})

    assert captured[0]["generate_kwargs"]["no_repeat_ngram_size"] == 3
    assert captured[1]["generate_kwargs"]["no_repeat_ngram_size"] == 5


def test_process_segments_collapses_word_repetition_runs() -> None:
    text = "start " + "par " * 200 + "end"
    segments = [TranscriptSegment(id=1, start=0.0, end=10.0, text=text)]

    processed = postprocess.process_segments(segments, merge_short_segments=False)

    assert len(processed) == 1
    assert processed[0].text == "start par par end"
    assert processed[0].start == 0.0
    assert processed[0].end == 10.0


def test_process_segments_collapses_char_repetition_runs() -> None:
    segments = [TranscriptSegment(id=1, start=0.0, end=10.0, text="好的的的的的的的的的吧")]

    processed = postprocess.process_segments(segments, merge_short_segments=False)

    assert processed[0].text == "好的的吧"


def test_process_segments_keeps_short_repetitions() -> None:
    segments = [TranscriptSegment(id=1, start=0.0, end=10.0, text="it is very very good, ha ha ha")]

    processed = postprocess.process_segments(segments, merge_short_segments=False)

    assert processed[0].text == "it is very very good, ha ha ha"


def test_process_segments_collapses_runs_across_merge_boundary() -> None:
    segments = [
        TranscriptSegment(id=1, start=0.0, end=0.4, text="par par par"),
        TranscriptSegment(id=2, start=0.5, end=0.9, text="par par par"),
    ]

    processed = postprocess.process_segments(segments, merge_short_segments=True, min_duration_ms=800)

    assert len(processed) == 1
    assert processed[0].text == "par par"


def test_quality_word_level_repetition_warns_for_english() -> None:
    task = type("Task", (), {"text": "par " * 100, "duration_ms": 600_000})()

    report = quality.analyze(task, [])

    assert "REPETITIVE_TRANSCRIPT" in report["warnings"]


def test_quality_word_level_repetition_skips_chinese() -> None:
    text = "这是一段正常的中文字幕文本，用来确认词级检测不会把整段当成一个词而误报重复。"
    task = type("Task", (), {"text": text, "duration_ms": 600_000})()

    report = quality.analyze(task, [])

    assert "REPETITIVE_TRANSCRIPT" not in report["warnings"]
