from __future__ import annotations

import importlib.util
import os
import platform as platform_module
import shutil
import sys
from typing import Any

from backend.services.ffmpeg_tools import resolve_tools


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


def qwen3_asr_import_error() -> str | None:
    try:
        from transformers.models.auto.modeling_auto import AutoModelForMultimodalLM
        from transformers.models.auto.processing_auto import AutoProcessor
        from transformers.models.qwen3_asr.modeling_qwen3_asr import Qwen3ASRForConditionalGeneration

        if all((AutoModelForMultimodalLM, AutoProcessor, Qwen3ASRForConditionalGeneration)):
            return None
        return "required transformers classes are unavailable"
    except Exception as exc:
        return f"{type(exc).__name__}: {exc}"


def qwen3_asr_available() -> bool:
    return qwen3_asr_import_error() is None


def moss_transcribe_diarize_import_error() -> str | None:
    if not module_available("moss_transcribe_diarize"):
        return "moss_transcribe_diarize is not installed"
    try:
        from moss_transcribe_diarize import parse_transcript
        from moss_transcribe_diarize.inference_utils import (
            build_transcription_messages,
            generate_transcription,
            resolve_device,
        )

        if all((parse_transcript, build_transcription_messages, generate_transcription, resolve_device)):
            return None
        return "required moss_transcribe_diarize helpers are unavailable"
    except Exception as exc:
        return f"{type(exc).__name__}: {exc}"


def moss_transcribe_diarize_available() -> bool:
    return moss_transcribe_diarize_import_error() is None


def mlx_runtime_import_errors() -> tuple[str | None, str | None]:
    core_error = module_import_error("mlx.core") if module_available("mlx.core") else "mlx.core is not installed"
    whisper_error = module_import_error("mlx_whisper") if module_available("mlx_whisper") else "mlx_whisper is not installed"
    return core_error, whisper_error


def mlx_runtime_import_error() -> str | None:
    core_error, whisper_error = mlx_runtime_import_errors()
    if core_error:
        return f"mlx.core import failed: {core_error}"
    if whisper_error:
        return f"mlx_whisper import failed: {whisper_error}"
    return None


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

    tools = resolve_tools()
    ffmpeg = tools["ffmpeg"]
    ffprobe = tools["ffprobe"]
    ffmpeg_available = ffmpeg.available
    ffprobe_available = ffprobe.available
    if not ffmpeg_available:
        warnings.append(f"ffmpeg is not available: {ffmpeg.error or 'missing'}")
    if not ffprobe_available:
        warnings.append(f"ffprobe is not available: {ffprobe.error or 'missing'}")

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
    qwen3_asr_error = qwen3_asr_import_error() if module_available("transformers") else "transformers is not installed"
    qwen3_asr_runtime_available = qwen3_asr_error is None
    if module_available("transformers") and qwen3_asr_error is not None:
        warnings.append(f"Qwen3-ASR import failed: {qwen3_asr_error}")
    moss_error = moss_transcribe_diarize_import_error()
    moss_runtime_available = moss_error is None
    if module_available("moss_transcribe_diarize") and moss_error is not None:
        warnings.append(f"MOSS-Transcribe-Diarize import failed: {moss_error}")
    mlx_import_error, mlx_whisper_import_error = mlx_runtime_import_errors()
    if mlx_import_error:
        warnings.append(f"MLX import failed: {mlx_import_error}")
    if mlx_whisper_import_error:
        warnings.append(f"MLX Whisper import failed: {mlx_whisper_import_error}")

    return {
        "python_version": sys.version.split()[0],
        "platform": platform_module.platform(),
        "ffmpeg_available": ffmpeg_available,
        "ffprobe_available": ffprobe_available,
        "ffmpeg_path": ffmpeg.path,
        "ffprobe_path": ffprobe.path,
        "ffmpeg_source": ffmpeg.source,
        "ffprobe_source": ffprobe.source,
        "ffmpeg_version": ffmpeg.version,
        "ffprobe_version": ffprobe.version,
        "ffmpeg_error": ffmpeg.error,
        "ffprobe_error": ffprobe.error,
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
        "mlx_available": mlx_import_error is None,
        "mlx_whisper_available": mlx_import_error is None and mlx_whisper_import_error is None,
        "mlx_import_error": mlx_import_error,
        "mlx_whisper_import_error": mlx_whisper_import_error,
        "qwen3_asr_available": qwen3_asr_runtime_available,
        "transformers_qwen3_asr_available": qwen3_asr_runtime_available,
        "moss_transcribe_diarize_available": moss_runtime_available,
        "warnings": warnings,
    }
