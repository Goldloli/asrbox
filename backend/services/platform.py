from __future__ import annotations

import importlib.util
import json
import os
import platform as platform_module
import shutil
import subprocess
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any

from backend.services.ffmpeg_tools import resolve_tools

RUNTIME_PROBE_CHILD_ENV = "ASRBOX_RUNTIME_PROBE_CHILD"
RUNTIME_PROBE_TIMEOUT_SECONDS = 180


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
    return bool(runtime_probe_snapshot()["torchaudio_available"])


def funasr_available() -> bool:
    return bool(runtime_probe_snapshot()["funasr_available"])


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
    return bool(runtime_probe_snapshot()["qwen3_asr_available"])


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
    return bool(runtime_probe_snapshot()["moss_transcribe_diarize_available"])


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


def runtime_mlx_import_error() -> str | None:
    snapshot = runtime_probe_snapshot()
    core_error = snapshot.get("mlx_import_error")
    whisper_error = snapshot.get("mlx_whisper_import_error")
    if core_error:
        return f"mlx.core import failed: {core_error}"
    if whisper_error:
        return f"mlx_whisper import failed: {whisper_error}"
    return None


def detect_runtime_in_process() -> dict[str, Any]:
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


def detect_runtime() -> dict[str, Any]:
    snapshot = runtime_probe_snapshot()
    return {
        **snapshot,
        "warnings": list(snapshot.get("warnings", [])),
    }


@lru_cache(maxsize=1)
def runtime_probe_snapshot() -> dict[str, Any]:
    if os.environ.get(RUNTIME_PROBE_CHILD_ENV) == "1":
        return detect_runtime_in_process()

    command = _runtime_probe_command()
    probe_env = os.environ.copy()
    probe_env[RUNTIME_PROBE_CHILD_ENV] = "1"
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
            timeout=RUNTIME_PROBE_TIMEOUT_SECONDS,
            cwd=Path(__file__).resolve().parents[2],
            env=probe_env,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return _failed_runtime_probe(f"{type(exc).__name__}: {exc}")

    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or f"exit code {completed.returncode}"
        return _failed_runtime_probe(detail)
    try:
        payload = _parse_runtime_probe_output(completed.stdout)
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        return _failed_runtime_probe(f"invalid probe output: {exc}")
    return payload


def _runtime_probe_command() -> list[str]:
    if getattr(sys, "frozen", False):
        return [sys.executable, "--runtime-check", "all"]
    return [sys.executable, "-m", "backend.server", "--runtime-check", "all"]


def _parse_runtime_probe_output(output: str) -> dict[str, Any]:
    last_error: json.JSONDecodeError | None = None
    for line in reversed(output.splitlines()):
        value = line.strip()
        if not value:
            continue
        try:
            payload = json.loads(value)
        except json.JSONDecodeError as exc:
            last_error = exc
            continue
        if not isinstance(payload, dict):
            raise TypeError("runtime probe result is not an object")
        required = {
            "python_version",
            "platform",
            "torch_available",
            "funasr_available",
            "torchaudio_available",
            "qwen3_asr_available",
            "moss_transcribe_diarize_available",
            "warnings",
        }
        missing = sorted(required - payload.keys())
        if missing:
            raise ValueError(f"runtime probe is missing: {', '.join(missing)}")
        return payload
    if last_error is not None:
        raise last_error
    raise ValueError("runtime probe produced no JSON")


def _failed_runtime_probe(error: str) -> dict[str, Any]:
    tools = resolve_tools()
    ffmpeg = tools["ffmpeg"]
    ffprobe = tools["ffprobe"]
    return {
        "python_version": sys.version.split()[0],
        "platform": platform_module.platform(),
        "ffmpeg_available": ffmpeg.available,
        "ffprobe_available": ffprobe.available,
        "ffmpeg_path": ffmpeg.path,
        "ffprobe_path": ffprobe.path,
        "ffmpeg_source": ffmpeg.source,
        "ffprobe_source": ffprobe.source,
        "ffmpeg_version": ffmpeg.version,
        "ffprobe_version": ffprobe.version,
        "ffmpeg_error": ffmpeg.error,
        "ffprobe_error": ffprobe.error,
        "torch_available": False,
        "torch_cuda_available": False,
        "torch_mps_available": False,
        "cuda_device_name": None,
        "cuda_capability": None,
        "ctranslate2_available": False,
        "faster_whisper_available": False,
        "funasr_available": False,
        "torchaudio_available": False,
        "modelscope_available": False,
        "huggingface_hub_available": False,
        "pyannote_available": False,
        "diarization_ready": False,
        "mlx_available": False,
        "mlx_whisper_available": False,
        "mlx_import_error": error,
        "mlx_whisper_import_error": error,
        "qwen3_asr_available": False,
        "transformers_qwen3_asr_available": False,
        "moss_transcribe_diarize_available": False,
        "warnings": [f"Runtime compatibility probe failed: {error}"],
    }
