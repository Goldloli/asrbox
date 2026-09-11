from __future__ import annotations

import subprocess
import sys

from backend.services.process_utils import no_window_kwargs


def test_no_window_kwargs_matches_platform() -> None:
    kwargs = no_window_kwargs()
    if sys.platform == "win32":
        assert kwargs == {"creationflags": subprocess.CREATE_NO_WINDOW}
    else:
        assert kwargs == {}


def test_no_window_kwargs_is_accepted_by_subprocess() -> None:
    # Smoke: the kwargs must be valid for this platform's subprocess API.
    completed = subprocess.run(
        [sys.executable, "-c", "pass"],
        capture_output=True,
        **no_window_kwargs(),
    )
    assert completed.returncode == 0
