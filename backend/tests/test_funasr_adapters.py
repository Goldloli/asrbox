from __future__ import annotations

from backend.backends.local_asr import FunASRBackend, _paraformer_segments
from backend.backends.registry import get_model_config


class FakeAutoModel:
    instances: list["FakeAutoModel"] = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.generate_kwargs: dict | None = None
        FakeAutoModel.instances.append(self)

    def generate(self, **kwargs):
        self.generate_kwargs = kwargs
        return self.result


def _backend_with(monkeypatch, result) -> tuple[FunASRBackend, list[FakeAutoModel]]:
    FakeAutoModel.instances = []

    def factory(**kwargs):
        model = FakeAutoModel(**kwargs)
        model.result = result
        return model

    monkeypatch.setattr("backend.backends.local_asr.AutoModel", factory)
    return FunASRBackend(), FakeAutoModel.instances


def test_paraformer_default_loads_vad_and_aggregates_token_timestamps(monkeypatch) -> None:
    # funasr returns text as space-joined tokens with one timestamp pair per token.
    text = "今 天 天 气 很 好 我 们 走 吧"
    # Per-token ms timestamps: a 1.2s silence gap sits between 好 and 我.
    timestamps = [
        [0, 200],
        [200, 400],
        [400, 600],
        [600, 800],
        [800, 1000],
        [1000, 1200],
        [2400, 2600],
        [2600, 2800],
        [2800, 3000],
        [3000, 3200],
    ]
    backend, instances = _backend_with(monkeypatch, [{"text": text, "timestamp": timestamps}])

    result = backend.transcribe("audio.wav", get_model_config("paraformer-zh"), {})

    assert instances[0].kwargs["vad_model"] == "fsmn-vad"
    assert instances[0].kwargs["vad_kwargs"] == {"max_single_segment_time": 30000}
    # Paraformer does not take a language kwarg; it handles zh/en natively.
    assert "language" not in (instances[0].generate_kwargs or {})
    assert instances[0].generate_kwargs["pred_timestamp"] is True
    assert result.text == "今天天气很好我们走吧"
    assert [segment.text for segment in result.segments] == ["今天天气很好", "我们走吧"]
    assert result.segments[0].start == 0.0
    assert result.segments[0].end == 1.2
    assert result.segments[1].start == 2.4
    assert result.segments[1].end == 3.2
    assert result.duration == 3.2
    assert result.raw_result_summary["vad"] is True


def test_paraformer_falls_back_to_zero_timeline_without_usable_timestamps(monkeypatch) -> None:
    backend, _instances = _backend_with(monkeypatch, [{"text": "没有时间戳的文本"}])

    result = backend.transcribe("audio.wav", get_model_config("paraformer-zh"), {})

    assert result.text == "没有时间戳的文本"
    assert len(result.segments) == 1
    assert result.segments[0].start == 0.0
    assert result.segments[0].end == 0.0
    assert result.segments[0].text == "没有时间戳的文本"


def test_paraformer_timestamp_length_mismatch_keeps_whole_text(monkeypatch) -> None:
    backend, _instances = _backend_with(monkeypatch, [{"text": "文 本 长 度 与 时 间 戳 不 一 致", "timestamp": [[0, 500]]}])

    result = backend.transcribe("audio.wav", get_model_config("paraformer-zh"), {})

    assert result.text == "文本长度与时间戳不一致"
    assert len(result.segments) == 1
    assert result.segments[0].start == 0.0
    assert result.segments[0].end == 0.5


def test_paraformer_vad_can_be_disabled_by_task_option(monkeypatch) -> None:
    backend, instances = _backend_with(monkeypatch, [{"text": "你好"}])

    backend.transcribe("audio.wav", get_model_config("paraformer-zh"), {"vad": False})

    assert "vad_model" not in instances[0].kwargs


def test_paraformer_segments_are_monotonic_across_long_audio(monkeypatch) -> None:
    text = " ".join(["字"] * 150)
    timestamps = [[index * 100, index * 100 + 100] for index in range(150)]
    backend, _instances = _backend_with(monkeypatch, [{"text": text, "timestamp": timestamps}])

    result = backend.transcribe("audio.wav", get_model_config("paraformer-zh"), {})

    starts = [segment.start for segment in result.segments]
    assert starts == sorted(starts)
    # The 60-char length cap splits the run instead of one giant segment.
    assert all(len(segment.text) <= 60 for segment in result.segments)
    assert len(result.segments) >= 3


def test_fun_asr_nano_plain_parse_without_fabricated_timeline(monkeypatch) -> None:
    backend, instances = _backend_with(monkeypatch, [{"text": "整段输出没有时间戳"}])

    result = backend.transcribe("audio.wav", get_model_config("fun-asr-nano"), {})

    assert instances[0].kwargs["vad_model"] == "fsmn-vad"
    assert result.text == "整段输出没有时间戳"
    assert len(result.segments) == 1
    assert result.segments[0].start == 0.0
    assert result.segments[0].end == 0.0
    assert result.segments[0].text == "整段输出没有时间戳"


def test_sensevoice_keeps_current_behavior_without_vad(monkeypatch) -> None:
    result_payload = [
        {
            "text": "<|zh|><|NEUTRAL|>你好 世界",
            "sentence_info": [
                {"start": 0, "end": 1200, "text": "<|zh|>你好"},
                {"start": 1200, "end": 2300, "text": "<|HAPPY|>世界"},
            ],
        }
    ]
    backend, instances = _backend_with(monkeypatch, result_payload)

    result = backend.transcribe("audio.wav", get_model_config("sensevoice-small"), {"language": "yue"})

    assert "vad_model" not in instances[0].kwargs
    assert instances[0].generate_kwargs == {"input": "audio.wav", "language": "yue"}
    assert result.text == "你好 世界"
    assert [segment.text for segment in result.segments] == ["你好", "世界"]
    assert result.raw_result_summary["vad"] is False


def test_explicit_vad_option_overrides_sensevoice_default(monkeypatch) -> None:
    backend, instances = _backend_with(monkeypatch, [{"text": "<|zh|>你好"}])

    backend.transcribe("audio.wav", get_model_config("sensevoice-small"), {"vad": True})

    assert instances[0].kwargs["vad_model"] == "fsmn-vad"


def test_unload_releases_all_vad_variants(monkeypatch) -> None:
    backend, _instances = _backend_with(monkeypatch, [{"text": "你好"}])

    config = get_model_config("paraformer-zh")
    backend.transcribe("audio.wav", config, {})
    backend.transcribe("audio.wav", config, {"vad": False})

    assert backend.is_loaded("paraformer-zh") is True
    assert backend.unload("paraformer-zh") is True
    assert backend.is_loaded("paraformer-zh") is False
    assert backend.unload("paraformer-zh") is False


def test_paraformer_segments_helper_groups_by_gap() -> None:
    segments = _paraformer_segments(
        "早 安 晚 安",
        [
            [100, 300],
            [300, 500],
            [2000, 2200],
            [2200, 2400],
        ],
    )

    assert [segment.text for segment in segments] == ["早安", "晚安"]
    assert segments[0].start == 0.1
    assert segments[0].end == 0.5
    assert segments[1].start == 2.0
    assert segments[1].end == 2.4


def test_paraformer_segments_aligns_space_joined_tokens() -> None:
    # funasr returns one token per timestamp pair, space-joined in the text field.
    segments = _paraformer_segments(
        "第 一 段 文 字 第 二 段 开 始",
        [
            [0, 200],
            [200, 400],
            [400, 600],
            [600, 800],
            [1000, 1200],
            [3000, 3200],
            [3200, 3400],
            [3400, 3600],
            [3600, 3800],
            [3800, 4000],
        ],
    )

    assert [segment.text for segment in segments] == ["第一段文字", "第二段开始"]
    assert segments[0].start == 0.0
    assert segments[0].end == 1.2
    assert segments[1].start == 3.0
    assert segments[1].end == 4.0


def test_paraformer_segments_token_count_mismatch_falls_back() -> None:
    assert _paraformer_segments("四 个 字 多 了", [[0, 100], [100, 200], [200, 300]]) == []
