from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Any

from backend.services.transcribe import transcribe_with_local_model

HEARTBEAT_SECONDS = 5.0


def _write_state(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    os.replace(temporary, path)


def _start_heartbeat(result_file: Path, progress_of) -> threading.Event:
    """A live process is not a working process: inference deadlocks keep daemons running.
    The heartbeat exposes the worker's accumulated CPU time, which advances while any
    real inference (CPU or GPU-driven) runs and freezes when the process is wedged."""
    stop = threading.Event()
    heartbeat_file = result_file.parent / "heartbeat.json"

    def beat() -> None:
        while not stop.wait(HEARTBEAT_SECONDS):
            completed, total = progress_of()
            _write_state(
                heartbeat_file,
                {"at": time.time(), "cpu": time.process_time(), "completed": completed, "total": total},
            )

    threading.Thread(target=beat, name="worker-heartbeat", daemon=True).start()
    return stop


def run_local_task_worker(request_path: str | Path, result_path: str | Path) -> int:
    request_file = Path(request_path)
    result_file = Path(result_path)
    results: list[dict[str, Any]] = []
    inputs: list[Any] = []

    try:
        request = json.loads(request_file.read_text(encoding="utf-8"))
        model_name = str(request["model_name"])
        options = dict(request.get("options") or {})
        inputs = list(request.get("inputs") or [])
        if not inputs:
            raise ValueError("Local transcription worker requires at least one input")
        _write_state(result_file, {"status": "running", "completed": 0, "total": len(inputs), "results": []})
        stop_heartbeat = _start_heartbeat(result_file, lambda: (len(results), len(inputs)))
        try:
            for item in inputs:
                result = transcribe_with_local_model(model_name, str(item["audio_path"]), options)
                results.append(result.model_dump(mode="json"))
                _write_state(
                    result_file,
                    {
                        "status": "running",
                        "completed": len(results),
                        "total": len(inputs),
                        "results": results,
                    },
                )
        finally:
            stop_heartbeat.set()
        _write_state(
            result_file,
            {
                "status": "completed",
                "completed": len(results),
                "total": len(inputs),
                "results": results,
            },
        )
        return 0
    except Exception as exc:
        _write_state(
            result_file,
            {
                "status": "failed",
                "completed": len(results),
                "total": len(inputs),
                "results": results,
                "error_type": type(exc).__name__,
                "error": str(exc),
            },
        )
        return 1
