from backend.backends.registry import get_all_model_configs, get_model_config


def test_registered_models_declare_devices_matching_engine_paths() -> None:
    engines = {
        "whisper_transformers",
        "faster_whisper",
        "transformers_speech_lm",
        "mlx_whisper",
        "funasr",
    }
    expected_devices_by_model = {
        "whisper-base": ["cpu", "cuda", "mps"],
        "whisper-small": ["cpu", "cuda", "mps"],
        "whisper-medium": ["cpu", "cuda", "mps"],
        "whisper-large-v3": ["cpu", "cuda", "mps"],
        "whisper-large-v3-turbo": ["cpu", "cuda", "mps"],
        "faster-whisper-base": ["cpu", "cuda"],
        "faster-whisper-small": ["cpu", "cuda"],
        "faster-whisper-medium": ["cpu", "cuda"],
        "faster-whisper-large-v3": ["cpu", "cuda"],
        "faster-whisper-large-v3-turbo": ["cpu", "cuda"],
        "qwen3-asr-0.6b": ["cpu", "cuda", "mps"],
        "qwen3-asr-1.7b": ["cpu", "cuda", "mps"],
        "moss-transcribe-diarize": ["cpu", "cuda"],
        "granite-speech-4.1-2b": ["cpu", "cuda"],
        "granite-speech-4.1-2b-plus": ["cpu", "cuda"],
        "cohere-transcribe-2b": ["cpu", "cuda"],
        "ark-asr-0.6b": ["cpu", "cuda"],
        "ark-asr-3b": ["cpu", "cuda"],
        "voxtral-mini-3b": ["cpu", "cuda"],
        "mlx-whisper-turbo": ["mlx"],
        "sensevoice-small": ["cpu", "cuda"],
        "paraformer-zh": ["cpu", "cuda"],
        "fun-asr-nano": ["cpu", "cuda"],
        "faster-whisper-distil-large-v3": ["cpu", "cuda"],
    }

    configs = get_all_model_configs()

    assert {config.engine for config in configs} == engines
    assert {config.model_name: config.supported_devices for config in configs} == expected_devices_by_model


def test_speech_lm_entries_declare_adapters() -> None:
    for name, adapter in (
        ("qwen3-asr-0.6b", "qwen3_asr"),
        ("qwen3-asr-1.7b", "qwen3_asr"),
        ("moss-transcribe-diarize", "moss_transcribe_diarize"),
    ):
        config = get_model_config(name)
        assert config is not None
        assert config.engine == "transformers_speech_lm"
        assert config.adapter == adapter


def test_stage2_granite_entries_match_verified_repo_facts() -> None:
    base = get_model_config("granite-speech-4.1-2b")
    assert base is not None
    assert base.adapter == "granite_speech"
    assert base.languages == ["en", "fr", "de", "es", "pt", "ja"]
    assert base.supports_timestamps is False
    assert base.supports_word_timestamps is False
    assert base.supports_diarization is False
    assert base.repo_id == "ibm-granite/granite-speech-4.1-2b"

    plus = get_model_config("granite-speech-4.1-2b-plus")
    assert plus is not None
    assert plus.adapter == "granite_speech_plus"
    assert plus.languages == ["en", "fr", "de", "es", "pt"]
    assert plus.supports_word_timestamps is True
    assert plus.supports_diarization is True
    assert plus.repo_id == "ibm-granite/granite-speech-4.1-2b-plus"

    for config in (base, plus):
        assert config.source_candidates[0].source == "modelscope"
        assert config.source_candidates[-1].source == "huggingface"


def test_stage2_cohere_entry_requires_explicit_language() -> None:
    config = get_model_config("cohere-transcribe-2b")
    assert config is not None
    assert config.adapter == "cohere_transcribe"
    assert config.languages == ["en", "fr", "de", "it", "es", "pt", "el", "nl", "pl", "zh", "ja", "ko", "vi", "ar"]
    assert "auto" not in config.languages
    assert config.supports_timestamps is False
    assert config.supports_diarization is False
    assert config.repo_id == "CohereLabs/cohere-transcribe-03-2026"
    assert config.source_candidates[0].source == "modelscope"


def test_stage2_ark_and_voxtral_entries_match_verified_repo_facts() -> None:
    ark_small = get_model_config("ark-asr-0.6b")
    ark_large = get_model_config("ark-asr-3b")
    for config in (ark_small, ark_large):
        assert config is not None
        assert config.adapter == "ark_asr"
        assert "auto" in config.languages and "zh" in config.languages and "en" in config.languages
        assert config.supports_timestamps is False
        assert len(config.source_candidates) == 2
        assert config.source_candidates[0].source == "modelscope"
        assert config.source_candidates[-1].source == "huggingface"
    assert ark_small is not None and ark_large is not None
    assert ark_small.repo_id == "Edge0/ARK-ASR-0.6B"
    assert ark_large.repo_id == "Edge0/ARK-ASR-3B"

    voxtral = get_model_config("voxtral-mini-3b")
    assert voxtral is not None
    assert voxtral.adapter == "voxtral_mini"
    assert "auto" in voxtral.languages
    assert "zh" not in voxtral.languages
    assert voxtral.supports_timestamps is False
    assert voxtral.repo_id == "mistralai/Voxtral-Mini-3B-2507"
    assert voxtral.source_candidates[0].source == "modelscope"


def test_all_speech_lm_entries_have_registered_adapters() -> None:
    from backend.backends.local_asr import _SPEECH_LM_ADAPTERS, speech_lm_compat_spec

    seen_adapters = set()
    for config in get_all_model_configs():
        if config.engine != "transformers_speech_lm":
            continue
        assert config.adapter in _SPEECH_LM_ADAPTERS, config.model_name
        assert speech_lm_compat_spec(config.adapter) is not None, config.model_name
        seen_adapters.add(config.adapter)
    assert {"qwen3_asr", "moss_transcribe_diarize", "granite_speech", "granite_speech_plus", "cohere_transcribe", "ark_asr", "voxtral_mini"} <= seen_adapters


def test_every_registered_model_declares_a_license() -> None:
    stage2_names = {
        "granite-speech-4.1-2b",
        "granite-speech-4.1-2b-plus",
        "cohere-transcribe-2b",
        "ark-asr-0.6b",
        "ark-asr-3b",
        "voxtral-mini-3b",
    }
    for config in get_all_model_configs():
        assert config.license, config.model_name
        assert config.attribution is None
    for name in stage2_names:
        config = get_model_config(name)
        assert config is not None
        assert config.license == "Apache-2.0"


def test_paraformer_zh_entry_matches_verified_repo_facts() -> None:
    config = get_model_config("paraformer-zh")
    assert config is not None
    assert config.engine == "funasr"
    assert config.languages == ["zh", "en"]
    assert config.supports_timestamps is True
    assert config.supports_word_timestamps is False
    assert config.supports_diarization is False
    assert config.source_candidates[0].source == "modelscope"
    assert config.source_candidates[0].repo_id == "iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch"
    assert config.source_candidates[-1].source == "huggingface"
    assert config.source_candidates[-1].repo_id == "funasr/paraformer-zh"
    # Paraformer keeps the default funasr required files (config.yaml/model.pt/am.mvn).
    assert config.required_files is None


def test_fun_asr_nano_entry_matches_verified_repo_facts() -> None:
    config = get_model_config("fun-asr-nano")
    assert config is not None
    assert config.engine == "funasr"
    assert "zh" in config.languages
    assert config.supports_timestamps is False
    assert config.supports_word_timestamps is False
    assert len(config.source_candidates) == 1
    assert config.source_candidates[0].source == "modelscope"
    assert config.source_candidates[0].repo_id == "FunAudioLLM/Fun-ASR-Nano-2512"
    # The Fun-ASR-Nano repo has no am.mvn (cmvn_file: null) and carries the Qwen3
    # tokenizer subdirectory instead, so its required files must be model-specific.
    assert config.required_files == ["config.yaml", "model.pt", "multilingual.tiktoken", "Qwen3-0.6B/tokenizer.json"]


def test_faster_whisper_distil_entry_declares_english_only() -> None:
    config = get_model_config("faster-whisper-distil-large-v3")
    assert config is not None
    assert config.engine == "faster_whisper"
    assert config.languages == ["en"]
    assert config.supports_timestamps is True
    assert config.supports_word_timestamps is True
    assert config.repo_id == "Systran/faster-distil-whisper-large-v3"
    assert all(candidate.source == "huggingface" for candidate in config.source_candidates)
