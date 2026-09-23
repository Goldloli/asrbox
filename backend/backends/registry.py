from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

InferenceDevice = Literal["cpu", "cuda", "mps", "mlx"]


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
    supported_devices: list[InferenceDevice]
    languages: list[str] = field(default_factory=list)
    runtime: str = "auto"
    supports_timestamps: bool = True
    supports_word_timestamps: bool = False
    supports_diarization: bool = False
    supports_streaming: bool = False
    allow_patterns: list[str] | None = None
    source_candidates: list[ModelSourceCandidate] = field(default_factory=list)
    required_files: list[str] | None = None
    adapter: str | None = None
    license: str = ""
    attribution: str | None = None


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
        supported_devices=["cpu", "cuda", "mps"],
        languages=COMMON_WHISPER_LANGUAGES,
        runtime="torch",
        supports_word_timestamps=False,
        allow_patterns=HF_ASR_ALLOW_PATTERNS,
        license="Apache-2.0",
        source_candidates=[ModelSourceCandidate("huggingface", repo_id, priority=10, verified=True)],
    )


def _faster_whisper_config(model_size: str, repo_id: str, size_mb: int, display_suffix: str | None = None, languages: list[str] | None = None) -> ASRModelConfig:
    suffix = display_suffix or model_size.replace("-", " ").title()
    return ASRModelConfig(
        model_name=f"faster-whisper-{model_size}",
        display_name=f"Faster Whisper {suffix}",
        engine="faster_whisper",
        source="huggingface",
        repo_id=repo_id,
        model_size=model_size,
        size_mb=size_mb,
        supported_devices=["cpu", "cuda"],
        languages=languages or COMMON_WHISPER_LANGUAGES,
        runtime="ctranslate2",
        supports_word_timestamps=True,
        allow_patterns=HF_ASR_ALLOW_PATTERNS,
        license="MIT",
        source_candidates=[ModelSourceCandidate("huggingface", repo_id, priority=10, verified=True)],
    )


def _qwen3_asr_config(model_size: str, repo_id: str, size_mb: int, display_suffix: str) -> ASRModelConfig:
    return ASRModelConfig(
        model_name=f"qwen3-asr-{model_size}",
        display_name=f"Qwen3-ASR {display_suffix}",
        engine="transformers_speech_lm",
        adapter="qwen3_asr",
        source="modelscope",
        repo_id=repo_id,
        model_size=model_size,
        size_mb=size_mb,
        supported_devices=["cpu", "cuda", "mps"],
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
        license="Apache-2.0",
        source_candidates=[
            ModelSourceCandidate("modelscope", repo_id, priority=0, verified=True),
            ModelSourceCandidate("huggingface", repo_id, priority=10, verified=True),
        ],
    )


def _speech_lm_config(
    model_name: str,
    display_name: str,
    adapter: str,
    repo_id: str,
    size_mb: int,
    model_size: str,
    languages: list[str],
    *,
    supports_timestamps: bool = False,
    supports_word_timestamps: bool = False,
    supports_diarization: bool = False,
    hf_only: bool = False,
    license: str = "Apache-2.0",
) -> ASRModelConfig:
    source_candidates = (
        [ModelSourceCandidate("huggingface", repo_id, priority=10, verified=True)]
        if hf_only
        else [
            ModelSourceCandidate("modelscope", repo_id, priority=0, verified=True),
            ModelSourceCandidate("huggingface", repo_id, priority=10, verified=True),
        ]
    )
    return ASRModelConfig(
        model_name=model_name,
        display_name=display_name,
        engine="transformers_speech_lm",
        adapter=adapter,
        source=source_candidates[0].source,
        repo_id=repo_id,
        model_size=model_size,
        size_mb=size_mb,
        supported_devices=["cpu", "cuda"],
        languages=languages,
        runtime="transformers",
        supports_timestamps=supports_timestamps,
        supports_word_timestamps=supports_word_timestamps,
        supports_diarization=supports_diarization,
        license=license,
        allow_patterns=HF_ASR_ALLOW_PATTERNS,
        source_candidates=source_candidates,
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
            engine="transformers_speech_lm",
            adapter="moss_transcribe_diarize",
            source="modelscope",
            repo_id="OpenMOSS-Team/MOSS-Transcribe-Diarize",
            model_size="0.9b",
            size_mb=1900,
            supported_devices=["cpu", "cuda"],
            languages=["auto", "zh", "en", "ja", "ko", "fr", "de", "es", "pt", "it", "ru", "th", "vi", "tl", "ur", "tr"],
            runtime="transformers",
            supports_timestamps=True,
            supports_word_timestamps=False,
            supports_diarization=True,
            license="Apache-2.0",
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
            supported_devices=["mlx"],
            languages=COMMON_WHISPER_LANGUAGES,
            runtime="mlx",
            supports_word_timestamps=True,
            license="Apache-2.0",
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
            supported_devices=["cpu", "cuda"],
            languages=["auto", "zh", "en", "ja", "ko", "yue"],
            runtime="funasr",
            supports_timestamps=False,
            supports_word_timestamps=False,
            license="ModelScope Model License",
            source_candidates=[ModelSourceCandidate("modelscope", "iic/SenseVoiceSmall", priority=0, verified=True)],
        ),
        ASRModelConfig(
            model_name="paraformer-zh",
            display_name="Paraformer Large 中文",
            engine="funasr",
            source="modelscope",
            repo_id="iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
            model_size="large",
            size_mb=850,
            supported_devices=["cpu", "cuda"],
            languages=["zh", "en"],
            runtime="funasr",
            supports_timestamps=True,
            supports_word_timestamps=False,
            license="ModelScope Model License",
            # The HF mirror is downloaded with allow_patterns (ModelScope ignores
            # them), so the list must name this repo's actual files explicitly:
            # the shared HF_ASR_ALLOW_PATTERNS would skip model.pt/config.yaml.
            allow_patterns=["config.yaml", "model.pt", "am.mvn", "seg_dict", "tokens.json", "configuration.json"],
            source_candidates=[
                ModelSourceCandidate("modelscope", "iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch", priority=0, verified=True),
                ModelSourceCandidate("huggingface", "funasr/paraformer-zh", priority=10, verified=True),
            ],
        ),
        ASRModelConfig(
            model_name="fun-asr-nano",
            display_name="Fun-ASR-Nano",
            engine="funasr",
            source="modelscope",
            repo_id="FunAudioLLM/Fun-ASR-Nano-2512",
            model_size="nano",
            size_mb=2050,
            supported_devices=["cpu", "cuda"],
            languages=["zh", "en", "ja", "ko", "yue"],
            runtime="funasr",
            supports_timestamps=False,
            supports_word_timestamps=False,
            license="Apache-2.0",
            source_candidates=[ModelSourceCandidate("modelscope", "FunAudioLLM/Fun-ASR-Nano-2512", priority=0, verified=True)],
            required_files=["config.yaml", "model.pt", "multilingual.tiktoken", "Qwen3-0.6B/tokenizer.json"],
        ),
        _faster_whisper_config(
            "distil-large-v3",
            "Systran/faster-distil-whisper-large-v3",
            1450,
            "Distil Large V3",
            languages=["en"],
        ),
        _speech_lm_config(
            "granite-speech-4.1-2b",
            "Granite Speech 4.1 2B",
            "granite_speech",
            "ibm-granite/granite-speech-4.1-2b",
            4945,
            "2b",
            ["en", "fr", "de", "es", "pt", "ja"],
        ),
        _speech_lm_config(
            "granite-speech-4.1-2b-plus",
            "Granite Speech 4.1 2B Plus",
            "granite_speech_plus",
            "ibm-granite/granite-speech-4.1-2b-plus",
            4225,
            "2b-plus",
            ["en", "fr", "de", "es", "pt"],
            supports_word_timestamps=True,
            supports_diarization=True,
        ),
        _speech_lm_config(
            "cohere-transcribe-2b",
            "Cohere Transcribe 2B",
            "cohere_transcribe",
            "CohereLabs/cohere-transcribe-03-2026",
            4130,
            "2b",
            ["en", "fr", "de", "it", "es", "pt", "el", "nl", "pl", "zh", "ja", "ko", "vi", "ar"],
        ),
        _speech_lm_config(
            "ark-asr-0.6b",
            "ARK-ASR 0.6B",
            "ark_asr",
            "Edge0/ARK-ASR-0.6B",
            2600,
            "0.6b",
            ["auto", "zh", "en", "de", "ja", "fr", "ko", "es", "pl", "it", "ro", "hu", "cs", "nl", "fi", "hr", "sk", "sl", "et", "lt"],
        ),
        _speech_lm_config(
            "ark-asr-3b",
            "ARK-ASR 3B",
            "ark_asr",
            "Edge0/ARK-ASR-3B",
            8130,
            "3b",
            ["auto", "zh", "en", "de", "ja", "fr", "ko", "es", "pl", "it", "ro", "hu", "cs", "nl", "fi", "hr", "sk", "sl", "et", "lt"],
        ),
        _speech_lm_config(
            "voxtral-mini-3b",
            "Voxtral Mini 3B",
            "voxtral_mini",
            "mistralai/Voxtral-Mini-3B-2507",
            9360,
            "3b",
            ["auto", "en", "fr", "de", "es", "it", "pt", "nl", "hi"],
        ),
    ]


def get_model_config(model_name: str) -> ASRModelConfig | None:
    return next((config for config in get_all_model_configs() if config.model_name == model_name), None)
