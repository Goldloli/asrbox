from __future__ import annotations

import json
import math
import os
import re
import subprocess
from pathlib import Path

from backend.services.errors import ASRboxError
from backend.services.ffmpeg_tools import resolve_tools

SUPPORTED_MEDIA_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".mp3", ".wav", ".m4a", ".flac", ".ogg"}
DEFAULT_PROBE_TIMEOUT_SECONDS = 30
DEFAULT_UNKNOWN_MEDIA_TIMEOUT_SECONDS = 6 * 60 * 60


def _configured_timeout(default: int) -> int:
    try:
        return max(1, int(os.environ.get("ASRBOX_MEDIA_PROCESS_TIMEOUT_SECONDS", default)))
    except ValueError:
        return default


def _media_timeout(duration_ms: int | None = None) -> int:
    configured = os.environ.get("ASRBOX_MEDIA_PROCESS_TIMEOUT_SECONDS")
    if configured:
        return _configured_timeout(DEFAULT_UNKNOWN_MEDIA_TIMEOUT_SECONDS)
    if duration_ms and duration_ms > 0:
        return max(300, math.ceil(duration_ms / 1000 * 4 + 60))
    return DEFAULT_UNKNOWN_MEDIA_TIMEOUT_SECONDS


def _optional_nonnegative_float(value: object) -> float | None:
    try:
        parsed = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) and parsed >= 0 else None


def _optional_positive_int(value: object) -> int | None:
    parsed = _optional_nonnegative_float(value)
    return int(parsed) if parsed is not None and parsed > 0 else None


def probe_media(path: Path) -> dict:
    ffprobe = resolve_tools(check_version=False)["ffprobe"]
    command = [
        ffprobe.path or "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    if not ffprobe.available:
        raise ASRboxError("FFPROBE_FAILED", f"ffprobe is required to inspect media files: {ffprobe.error or 'not found'}", stage="preprocessing", command=" ".join(command))
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            check=True,
            encoding="utf-8",
            errors="replace",
            timeout=_configured_timeout(DEFAULT_PROBE_TIMEOUT_SECONDS),
        )
    except FileNotFoundError as exc:
        raise ASRboxError("FFPROBE_FAILED", "ffprobe is required to inspect media files", stage="preprocessing", command=" ".join(command)) from exc
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() or exc.stdout.strip() or str(exc)
        raise ASRboxError(
            "FFPROBE_FAILED",
            f"Failed to inspect media with ffprobe: {detail}",
            stage="preprocessing",
            command=" ".join(command),
            stderr_excerpt=detail,
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise ASRboxError(
            "FFPROBE_FAILED",
            "ffprobe timed out while inspecting media",
            stage="preprocessing",
            command=" ".join(command),
        ) from exc

    try:
        raw = json.loads(completed.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise ASRboxError(
            "FFPROBE_FAILED",
            "ffprobe returned invalid JSON",
            stage="preprocessing",
            command=" ".join(command),
        ) from exc
    fmt = raw.get("format") or {}
    audio_streams = [stream for stream in raw.get("streams", []) if stream.get("codec_type") == "audio"]
    audio_stream = audio_streams[0] if audio_streams else {}
    duration = _optional_nonnegative_float(fmt.get("duration"))
    if duration is None:
        duration = _optional_nonnegative_float(audio_stream.get("duration"))
    return {
        "duration_ms": int(duration * 1000) if duration is not None else None,
        "format": fmt.get("format_name"),
        "audio_codec": audio_stream.get("codec_name"),
        "sample_rate": _optional_positive_int(audio_stream.get("sample_rate")),
        "channels": audio_stream.get("channels"),
        "has_audio_stream": bool(audio_streams),
        "audio_stream_count": len(audio_streams),
    }


def prepare_media_for_asr(path: Path, *, output_dir: Path | None = None, output_name: str | None = None) -> tuple[Path, dict]:
    if path.suffix.lower() not in SUPPORTED_MEDIA_EXTENSIONS:
        raise ASRboxError("UNSUPPORTED_MEDIA_FORMAT", f"Unsupported media format: {path.suffix or 'unknown'}", stage="preprocessing")

    metadata = probe_media(path)
    if metadata.get("has_audio_stream") is False:
        raise ASRboxError("NO_AUDIO_STREAM", "Media file does not contain an audio stream", stage="preprocessing", audio_metadata=metadata)
    if path.suffix.lower() == ".wav":
        return path, metadata

    if output_dir is not None:
        output_dir.mkdir(parents=True, exist_ok=True)
        target = output_dir / (output_name or f"{path.stem}.wav")
    else:
        target = path.with_suffix(".wav")
    ffmpeg = resolve_tools(check_version=False)["ffmpeg"]
    command = [
        ffmpeg.path or "ffmpeg",
        "-i",
        str(path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        "-y",
        str(target),
    ]
    if not ffmpeg.available:
        raise ASRboxError("FFMPEG_FAILED", f"ffmpeg is required to extract audio from media files: {ffmpeg.error or 'not found'}", stage="preprocessing", command=" ".join(command))
    try:
        subprocess.run(
            command,
            capture_output=True,
            check=True,
            encoding="utf-8",
            errors="replace",
            timeout=_media_timeout(metadata.get("duration_ms")),
        )
    except FileNotFoundError as exc:
        raise ASRboxError("FFMPEG_FAILED", "ffmpeg is required to extract audio from media files", stage="preprocessing", command=" ".join(command)) from exc
    except subprocess.CalledProcessError as exc:
        target.unlink(missing_ok=True)
        detail = exc.stderr.strip() or exc.stdout.strip() or str(exc)
        raise ASRboxError(
            "FFMPEG_FAILED",
            f"Failed to normalize media with ffmpeg: {detail}",
            stage="preprocessing",
            command=" ".join(command),
            stderr_excerpt=detail,
        ) from exc
    except subprocess.TimeoutExpired as exc:
        target.unlink(missing_ok=True)
        raise ASRboxError(
            "FFMPEG_FAILED",
            "ffmpeg timed out while normalizing media",
            stage="preprocessing",
            command=" ".join(command),
        ) from exc
    return target, metadata


def analyze_audio_quality(path: Path) -> dict:
    ffmpeg = resolve_tools(check_version=False)["ffmpeg"]
    if not ffmpeg.available:
        return {"warnings": [f"ffmpeg is not available for volume analysis: {ffmpeg.error or 'not found'}"]}
    command = [ffmpeg.path or "ffmpeg", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"]
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            check=False,
            encoding="utf-8",
            errors="replace",
            timeout=_media_timeout(),
        )
    except FileNotFoundError:
        return {"warnings": ["ffmpeg is not available for volume analysis"]}
    except subprocess.TimeoutExpired:
        return {"warnings": ["ffmpeg timed out during volume analysis"]}
    output = "\n".join([completed.stdout or "", completed.stderr or ""])
    mean_match = re.search(r"mean_volume:\s*(-?\d+(?:\.\d+)?) dB", output)
    max_match = re.search(r"max_volume:\s*(-?\d+(?:\.\d+)?) dB", output)
    mean_volume = float(mean_match.group(1)) if mean_match else None
    peak_volume = float(max_match.group(1)) if max_match else None
    near_silence = bool((peak_volume is not None and peak_volume < -45) or (mean_volume is not None and mean_volume < -55))
    warnings = ["Audio appears close to silence"] if near_silence else []
    return {
        "mean_volume_db": mean_volume,
        "peak_volume_db": peak_volume,
        "near_silence": near_silence,
        "warnings": warnings,
    }


def preflight_media(path: Path, *, long_audio_threshold_ms: int = 30 * 60 * 1000, chunk_window_ms: int = 10 * 60 * 1000, chunk_overlap_ms: int = 5 * 1000) -> dict:
    supported = path.suffix.lower() in SUPPORTED_MEDIA_EXTENSIONS
    if not supported:
        return {
            "supported_format": False,
            "has_audio_stream": False,
            "needs_normalization": True,
            "will_chunk": False,
            "chunk_count": 0,
            "warnings": [f"Unsupported media format: {path.suffix or 'unknown'}"],
        }
    metadata = probe_media(path)
    quality = analyze_audio_quality(path) if metadata.get("has_audio_stream") else {"warnings": []}
    duration_ms = metadata.get("duration_ms")
    will_chunk = bool(duration_ms and duration_ms > long_audio_threshold_ms)
    step_ms = max(1, chunk_window_ms - chunk_overlap_ms)
    chunk_count = math.ceil(max(duration_ms or 0, 0) / step_ms) if will_chunk else 1
    return {
        **metadata,
        **quality,
        "supported_format": True,
        "has_audio_stream": bool(metadata.get("has_audio_stream")),
        "needs_normalization": path.suffix.lower() != ".wav",
        "will_chunk": will_chunk,
        "chunk_count": chunk_count,
        "warnings": quality.get("warnings", []),
    }


def split_audio_chunks(
    audio_path: Path,
    output_dir: Path,
    duration_ms: int,
    *,
    window_ms: int = 10 * 60 * 1000,
    overlap_ms: int = 5 * 1000,
) -> list[tuple[Path, int, int]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    chunks: list[tuple[Path, int, int]] = []
    attempted_paths: list[Path] = []
    ffmpeg = resolve_tools(check_version=False)["ffmpeg"]
    start_ms = 0
    index = 1
    step_ms = max(1, window_ms - overlap_ms)
    try:
        while start_ms < duration_ms:
            end_ms = min(duration_ms, start_ms + window_ms)
            target = output_dir / f"chunk-{index:04}.wav"
            attempted_paths.append(target)
            command = [
                ffmpeg.path or "ffmpeg",
                "-ss",
                f"{start_ms / 1000:.3f}",
                "-t",
                f"{(end_ms - start_ms) / 1000:.3f}",
                "-i",
                str(audio_path),
                "-ac",
                "1",
                "-ar",
                "16000",
                "-f",
                "wav",
                "-y",
                str(target),
            ]
            if not ffmpeg.available:
                raise ASRboxError("FFMPEG_FAILED", f"ffmpeg is required to split long media files: {ffmpeg.error or 'not found'}", stage="chunking", command=" ".join(command))
            try:
                subprocess.run(
                    command,
                    capture_output=True,
                    check=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=_media_timeout(end_ms - start_ms),
                )
            except FileNotFoundError as exc:
                raise ASRboxError("FFMPEG_FAILED", "ffmpeg is required to split long media files", stage="chunking", command=" ".join(command)) from exc
            except subprocess.CalledProcessError as exc:
                detail = exc.stderr.strip() or exc.stdout.strip() or str(exc)
                raise ASRboxError(
                    "CHUNK_FAILED",
                    f"Failed to split media chunk {index}: {detail}",
                    stage="chunking",
                    command=" ".join(command),
                    stderr_excerpt=detail,
                ) from exc
            except subprocess.TimeoutExpired as exc:
                raise ASRboxError(
                    "CHUNK_FAILED",
                    f"ffmpeg timed out while splitting media chunk {index}",
                    stage="chunking",
                    command=" ".join(command),
                ) from exc
            chunks.append((target, start_ms, end_ms))
            if end_ms >= duration_ms:
                break
            start_ms += step_ms
            index += 1
        return chunks
    except BaseException:
        for path in attempted_paths:
            path.unlink(missing_ok=True)
        try:
            output_dir.rmdir()
        except OSError:
            pass
        raise
