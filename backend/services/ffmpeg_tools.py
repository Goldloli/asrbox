from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

ToolSource = Literal["manual", "bundled", "system", "missing"]


@dataclass(frozen=True)
class ToolStatus:
    available: bool
    path: str | None
    source: ToolSource
    version: str | None = None
    error: str | None = None


def _version(path: str) -> tuple[str | None, str | None]:
    try:
        completed = subprocess.run([path, "-version"], capture_output=True, check=True, encoding="utf-8", errors="replace", timeout=8)
    except Exception as exc:
        return None, f"{type(exc).__name__}: {exc}"
    line = (completed.stdout or completed.stderr or "").splitlines()
    return (line[0] if line else None), None


def _candidate(path: str | None, source: ToolSource, *, check_version: bool) -> ToolStatus | None:
    if not path:
        return None
    resolved = Path(path).expanduser()
    if not resolved.is_file():
        return ToolStatus(False, str(resolved), source, error="file does not exist")
    if not os.access(resolved, os.X_OK):
        return ToolStatus(False, str(resolved), source, error="file is not executable")
    version = None
    if check_version:
        version, error = _version(str(resolved))
        if error:
            return ToolStatus(False, str(resolved), source, error=error)
    return ToolStatus(True, str(resolved), source, version=version)


def _manual_paths() -> tuple[str | None, str | None]:
    try:
        from backend.database.session import SessionLocal, init_db
        from backend.services import settings as settings_service

        init_db()
        db = SessionLocal()
        try:
            settings = settings_service.get_settings(db)
            return settings.ffmpeg_path, settings.ffprobe_path
        finally:
            db.close()
    except Exception:
        return None, None


def resolve_tool(name: Literal["ffmpeg", "ffprobe"], manual_path: str | None = None, *, check_version: bool = True) -> ToolStatus:
    env_name = "ASRBOX_FFMPEG_PATH" if name == "ffmpeg" else "ASRBOX_FFPROBE_PATH"
    attempts = [
        _candidate(manual_path, "manual", check_version=check_version),
        _candidate(os.environ.get(env_name), "bundled", check_version=check_version),
        _candidate(shutil.which(name), "system", check_version=check_version),
    ]
    first_error: ToolStatus | None = None
    for attempt in attempts:
        if attempt is None:
            continue
        if attempt.available:
            return attempt
        if first_error is None:
            first_error = attempt
    if first_error is not None:
        return ToolStatus(False, first_error.path, first_error.source, error=first_error.error)
    return ToolStatus(False, None, "missing", error=f"{name} was not found")


def resolve_tools(*, check_version: bool = True) -> dict[str, ToolStatus]:
    ffmpeg_path, ffprobe_path = _manual_paths()
    return {
        "ffmpeg": resolve_tool("ffmpeg", ffmpeg_path, check_version=check_version),
        "ffprobe": resolve_tool("ffprobe", ffprobe_path, check_version=check_version),
    }
