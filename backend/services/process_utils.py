"""Shared helpers for spawning child processes."""

from __future__ import annotations

import subprocess
from typing import Any


def no_window_kwargs() -> dict[str, Any]:
    """Keep CUI child processes windowless on Windows; a no-op elsewhere.

    The desktop shell spawns the backend with CREATE_NO_WINDOW, so the backend
    owns no console. A console-subsystem child (the frozen server exe, ffmpeg,
    ffprobe) spawned without flags would then allocate a fresh console window.
    """
    flag = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return {"creationflags": flag} if flag else {}
