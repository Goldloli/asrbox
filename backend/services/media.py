from __future__ import annotations

import json
import subprocess
from pathlib import Path

SUPPORTED_MEDIA_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".mp3", ".wav", ".m4a", ".flac", ".ogg"}


def probe_media(path: Path) -> dict:
    command = [
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    try:
        completed = subprocess.run(command, capture_output=True, check=True, encoding="utf-8", errors="replace")
    except FileNotFoundError as exc:
        raise RuntimeError("ffprobe is required to inspect media files") from exc
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() or exc.stdout.strip() or str(exc)
        raise RuntimeError(f"Failed to inspect media with ffprobe: {detail}") from exc

    raw = json.loads(completed.stdout or "{}")
    fmt = raw.get("format") or {}
    audio_stream = next((stream for stream in raw.get("streams", []) if stream.get("codec_type") == "audio"), {})
    duration = fmt.get("duration") or audio_stream.get("duration")
    return {
        "duration_ms": int(float(duration) * 1000) if duration else None,
        "format": fmt.get("format_name"),
        "audio_codec": audio_stream.get("codec_name"),
        "sample_rate": int(audio_stream["sample_rate"]) if audio_stream.get("sample_rate") else None,
        "channels": audio_stream.get("channels"),
    }


def prepare_media_for_asr(path: Path) -> tuple[Path, dict]:
    if path.suffix.lower() not in SUPPORTED_MEDIA_EXTENSIONS:
        raise RuntimeError(f"Unsupported media format: {path.suffix or 'unknown'}")

    metadata = probe_media(path)
    if path.suffix.lower() == ".wav":
        return path, metadata

    target = path.with_suffix(".wav")
    command = [
        "ffmpeg",
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
    try:
        subprocess.run(command, capture_output=True, check=True, encoding="utf-8", errors="replace")
    except FileNotFoundError as exc:
        raise RuntimeError("ffmpeg is required to extract audio from media files") from exc
    except subprocess.CalledProcessError as exc:
        target.unlink(missing_ok=True)
        detail = exc.stderr.strip() or exc.stdout.strip() or str(exc)
        raise RuntimeError(f"Failed to normalize media with ffmpeg: {detail}") from exc
    return target, metadata
