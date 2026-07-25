from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ModelSourceCandidate:
    source: str
    repo_id: str
    priority: int = 100
    verified: bool = True


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
    allow_patterns: list[str] | None = None
    source_candidates: list[ModelSourceCandidate] = field(default_factory=list)


HF_ASR_ALLOW_PATTERNS = [
    "*.json",
    "*.txt",
    "*.model",
    "*.safetensors",
    "*.bin",
    "*.py",
    "chat_template*",
    "generation_config*",
    "tokenizer*",
    "processor*",
    "preprocessor*",
    "vocab*",
    "merges*",
    "normalizer*",
]

COMMON_WHISPER_LANGUAGES = ["auto", "zh", "en", "ja", "ko", "de", "fr", "es"]


def _whisper_config(model_size: str, repo_id: str, size_mb: int, display_suffix: str | None = None) -> ASRModelConfig:
    suffix = display_suffix or model_size.replace("-", " ").title()
    return ASRModelConfig(
        model_name=f"whisper-{model_size}",
        display_name=f"Whisper {suffix}",
        engine="whisper_transformers",
        source="huggingface",
        repo_id=repo_id,
        model_size=model_size,
        size_mb=size_mb,
        languages=COMMON_WHISPER_LANGUAGES,
        runtime="torch",
        supports_word_timestamps=False,
        allow_patterns=HF_ASR_ALLOW_PATTERNS,
        source_candidates=[ModelSourceCandidate("huggingface", repo_id, priority=10, verified=True)],
    )


def _faster_whisper_config(model_size: str, repo_id: str, size_mb: int, display_suffix: str | None = None) -> ASRModelConfig:
    suffix = display_suffix or model_size.replace("-", " ").title()
    return ASRModelConfig(
        model_name=f"faster-whisper-{model_size}",
        display_name=f"Faster Whisper {suffix}",
        engine="faster_whisper",
        source="huggingface",
        repo_id=repo_id,
        model_size=model_size,
        size_mb=size_mb,
        languages=COMMON_WHISPER_LANGUAGES,
        runtime="ctranslate2",
        supports_word_timestamps=True,
        allow_patterns=HF_ASR_ALLOW_PATTERNS,
        source_candidates=[ModelSourceCandidate("huggingface", repo_id, priority=10, verified=True)],
    )


def _qwen3_asr_config(model_size: str, repo_id: str, size_mb: int, display_suffix: str) -> ASRModelConfig:
    return ASRModelConfig(
        model_name=f"qwen3-asr-{model_size}",
        display_name=f"Qwen3-ASR {display_suffix}",
        engine="qwen3_asr",
        source="modelscope",
        repo_id=repo_id,
        model_size=model_size,
        size_mb=size_mb,
        languages=[
            "auto",
            "zh",
            "en",
            "yue",
            "ja",
            "ko",
            "fr",
            "de",
            "es",
            "pt",
            "ru",
            "ar",
            "it",
            "th",
            "vi",
        ],
        runtime="transformers",
        supports_timestamps=False,
        supports_word_timestamps=False,
        allow_patterns=HF_ASR_ALLOW_PATTERNS,
        source_candidates=[
            ModelSourceCandidate("modelscope", repo_id, priority=0, verified=True),
            ModelSourceCandidate("huggingface", repo_id, priority=10, verified=True),
        ],
    )


def get_all_model_configs() -> list[ASRModelConfig]:
    return [
        _whisper_config("base", "openai/whisper-base", 290),
        _whisper_config("small", "openai/whisper-small", 967),
        _whisper_config("medium", "openai/whisper-medium", 3060),
        _whisper_config("large-v3", "openai/whisper-large-v3", 6200, "Large V3"),
        _whisper_config("large-v3-turbo", "openai/whisper-large-v3-turbo", 1600, "Large V3 Turbo"),
        _faster_whisper_config("base", "Systran/faster-whisper-base", 145),
        _faster_whisper_config("small", "Systran/faster-whisper-small", 466),
        _faster_whisper_config("medium", "Systran/faster-whisper-medium", 1500),
        _faster_whisper_config("large-v3", "Systran/faster-whisper-large-v3", 3100, "Large V3"),
        _faster_whisper_config("large-v3-turbo", "mobiuslabsgmbh/faster-whisper-large-v3-turbo", 1600, "Large V3 Turbo"),
        _qwen3_asr_config("0.6b", "Qwen/Qwen3-ASR-0.6B-hf", 1600, "0.6B"),
        _qwen3_asr_config("1.7b", "Qwen/Qwen3-ASR-1.7B-hf", 3900, "1.7B"),
        ASRModelConfig(
            model_name="moss-transcribe-diarize",
            display_name="MOSS Transcribe Diarize 0.9B",
            engine="moss_transcribe_diarize",
            source="modelscope",
            repo_id="OpenMOSS-Team/MOSS-Transcribe-Diarize",
            model_size="0.9b",
            size_mb=1900,
            languages=["auto", "zh", "en", "ja", "ko", "fr", "de", "es", "pt", "it", "ru", "th", "vi", "tl", "ur", "tr"],
            runtime="transformers",
            supports_timestamps=True,
            supports_word_timestamps=False,
            supports_diarization=True,
            allow_patterns=HF_ASR_ALLOW_PATTERNS,
            source_candidates=[
                ModelSourceCandidate("modelscope", "OpenMOSS-Team/MOSS-Transcribe-Diarize", priority=0, verified=True),
                ModelSourceCandidate("huggingface", "OpenMOSS-Team/MOSS-Transcribe-Diarize", priority=10, verified=True),
            ],
        ),
        ASRModelConfig(
            model_name="mlx-whisper-turbo",
            display_name="MLX Whisper Turbo",
            engine="mlx_whisper",
            source="modelscope",
            repo_id="mlx-community/whisper-large-v3-turbo",
            model_size="turbo",
            size_mb=1600,
            languages=COMMON_WHISPER_LANGUAGES,
            runtime="mlx",
            supports_word_timestamps=True,
            allow_patterns=HF_ASR_ALLOW_PATTERNS,
            source_candidates=[
                ModelSourceCandidate("modelscope", "mlx-community/whisper-large-v3-turbo", priority=0, verified=True),
                ModelSourceCandidate("huggingface", "mlx-community/whisper-large-v3-turbo", priority=10, verified=True),
            ],
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
            source_candidates=[ModelSourceCandidate("modelscope", "iic/SenseVoiceSmall", priority=0, verified=True)],
        ),
    ]


def get_model_config(model_name: str) -> ASRModelConfig | None:
    return next((config for config in get_all_model_configs() if config.model_name == model_name), None)
