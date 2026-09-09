from backend.backends.registry import get_all_model_configs


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
