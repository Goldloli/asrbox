from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from backend.services.transcribe import transcribe_with_local_model


def _write_state(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    os.replace(temporary, path)


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
