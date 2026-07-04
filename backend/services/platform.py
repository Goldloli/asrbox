from __future__ import annotations

import importlib.util
import os
import platform as platform_module
import shutil
import sys
from typing import Any


def module_available(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except ModuleNotFoundError:
        return False


def module_import_error(name: str) -> str | None:
    try:
        __import__(name)
        return None
    except Exception as exc:
        return f"{type(exc).__name__}: {exc}"


def torchaudio_available() -> bool:
    return module_import_error("torchaudio") is None


def funasr_available() -> bool:
    return module_import_error("funasr") is None


def qwen3_asr_available() -> bool:
    try:
        import transformers
        from transformers import AutoModelForMultimodalLM, AutoProcessor

        has_auto_classes = AutoModelForMultimodalLM is not None and AutoProcessor is not None
        has_qwen_class = hasattr(transformers, "Qwen3ASRForConditionalGeneration")
        try:
            from transformers.models.auto.configuration_auto import CONFIG_MAPPING_NAMES

            has_qwen_config = "qwen3_asr" in CONFIG_MAPPING_NAMES
        except Exception:
            has_qwen_config = False
        return has_auto_classes and (has_qwen_class or has_qwen_config)
    except Exception:
        return False


def detect_runtime() -> dict[str, Any]:
    warnings: list[str] = []
    torch_available = module_available("torch")
    torch_cuda_available = False
    torch_mps_available = False
    cuda_device_name = None
    cuda_capability = None
    if torch_available:
        try:
            import torch

            torch_cuda_available = bool(torch.cuda.is_available())
            if torch_cuda_available:
                cuda_device_name = torch.cuda.get_device_name(0)
                major, minor = torch.cuda.get_device_capability(0)
                cuda_capability = f"{major}.{minor}"
            torch_mps_available = bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available())
        except Exception as exc:
            warnings.append(f"torch inspection failed: {exc}")

    ffmpeg_available = shutil.which("ffmpeg") is not None
    ffprobe_available = shutil.which("ffprobe") is not None
    if not ffmpeg_available:
        warnings.append("ffmpeg is not available")
    if not ffprobe_available:
        warnings.append("ffprobe is not available")

    pyannote_available = module_available("pyannote.audio")
    diarization_ready = pyannote_available and bool(os.environ.get("HF_TOKEN"))
    if pyannote_available and not diarization_ready:
        warnings.append("pyannote.audio is installed but HF_TOKEN is not configured")

    funasr_import_error = module_import_error("funasr") if module_available("funasr") else "funasr is not installed"
    torchaudio_import_error = module_import_error("torchaudio") if module_available("torchaudio") else "torchaudio is not installed"
    funasr_runtime_available = funasr_import_error is None
    torchaudio_runtime_available = torchaudio_import_error is None
    if module_available("funasr") and funasr_import_error is not None:
        warnings.append(f"funasr import failed: {funasr_import_error}")
    if module_available("torchaudio") and torchaudio_import_error is not None:
        warnings.append(f"torchaudio import failed: {torchaudio_import_error}")
    if module_available("funasr") and not torchaudio_runtime_available:
        warnings.append("funasr requires torchaudio, but torchaudio is unavailable")
    if module_available("transformers") and not qwen3_asr_available():
        warnings.append("transformers is installed but Qwen3-ASR architecture support is unavailable")

    return {
        "python_version": sys.version.split()[0],
        "platform": platform_module.platform(),
        "ffmpeg_available": ffmpeg_available,
        "ffprobe_available": ffprobe_available,
        "torch_available": torch_available,
        "torch_cuda_available": torch_cuda_available,
        "torch_mps_available": torch_mps_available,
        "cuda_device_name": cuda_device_name,
        "cuda_capability": cuda_capability,
        "ctranslate2_available": module_available("ctranslate2"),
        "faster_whisper_available": module_available("faster_whisper"),
        "funasr_available": funasr_runtime_available,
        "torchaudio_available": torchaudio_runtime_available,
        "modelscope_available": module_available("modelscope"),
        "huggingface_hub_available": module_available("huggingface_hub"),
        "pyannote_available": pyannote_available,
        "diarization_ready": diarization_ready,
        "mlx_available": module_available("mlx"),
        "mlx_whisper_available": module_available("mlx_whisper"),
        "qwen3_asr_available": qwen3_asr_available(),
        "transformers_qwen3_asr_available": qwen3_asr_available(),
        "warnings": warnings,
    }
