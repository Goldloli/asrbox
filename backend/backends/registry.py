from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ASRModelConfig:
    model_name: str
    display_name: str
    engine: str
    source: str
    repo_id: str | None
    model_size: str
    size_mb: int
    languages: list[str] = field(default_factory=list)
    runtime: str = "auto"
    supports_timestamps: bool = True
    supports_word_timestamps: bool = False
    supports_diarization: bool = False
    supports_streaming: bool = False


def get_all_model_configs() -> list[ASRModelConfig]:
    return [
        ASRModelConfig(
            model_name="whisper-base",
            display_name="Whisper Base",
            engine="whisper_transformers",
            source="huggingface",
            repo_id="openai/whisper-base",
            model_size="base",
            size_mb=290,
            languages=["auto", "zh", "en", "ja", "ko", "de", "fr", "es"],
            runtime="torch",
            supports_word_timestamps=False,
        ),
        ASRModelConfig(
            model_name="faster-whisper-small",
            display_name="Faster Whisper Small",
            engine="faster_whisper",
            source="huggingface",
            repo_id="Systran/faster-whisper-small",
            model_size="small",
            size_mb=466,
            languages=["auto", "zh", "en", "ja", "ko", "de", "fr", "es"],
            runtime="ctranslate2",
            supports_word_timestamps=True,
        ),
        ASRModelConfig(
            model_name="mlx-whisper-turbo",
            display_name="MLX Whisper Turbo",
            engine="mlx_whisper",
            source="huggingface",
            repo_id="mlx-community/whisper-large-v3-turbo",
            model_size="turbo",
            size_mb=1600,
            languages=["auto", "zh", "en", "ja", "ko", "de", "fr", "es"],
            runtime="mlx",
            supports_word_timestamps=True,
        ),
        ASRModelConfig(
            model_name="sensevoice-small",
            display_name="SenseVoice Small",
            engine="funasr",
            source="modelscope",
            repo_id="iic/SenseVoiceSmall",
            model_size="small",
            size_mb=900,
            languages=["auto", "zh", "en", "ja", "ko", "yue"],
            runtime="funasr",
            supports_word_timestamps=True,
        ),
    ]


def get_model_config(model_name: str) -> ASRModelConfig | None:
    return next((config for config in get_all_model_configs() if config.model_name == model_name), None)

