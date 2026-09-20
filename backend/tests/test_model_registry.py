from backend.backends.registry import get_all_model_configs, get_model_config


def test_registered_models_declare_devices_matching_engine_paths() -> None:
    expected_by_engine = {
        "whisper_transformers": ["cpu", "cuda", "mps"],
        "faster_whisper": ["cpu", "cuda"],
        "qwen3_asr": ["cpu", "cuda", "mps"],
        "moss_transcribe_diarize": ["cpu", "cuda"],
        "mlx_whisper": ["mlx"],
        "funasr": ["cpu", "cuda"],
    }

    configs = get_all_model_configs()

    assert {config.engine for config in configs} == expected_by_engine.keys()
    for config in configs:
        assert config.supported_devices == expected_by_engine[config.engine]


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
