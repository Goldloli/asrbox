from __future__ import annotations

import json
import os
import time
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend import config
from backend.app import create_app
from backend.backends.registry import get_all_model_configs

SUPPORTED_SUFFIXES = {".mp4", ".mov", ".mkv", ".webm", ".mp3", ".wav", ".m4a", ".flac", ".ogg"}
EXPORT_FORMATS = ["txt", "srt", "vtt", "ass", "json", "markdown"]
RESULTS: list[dict] = []


def _results_dir() -> Path:
    path = Path(__file__).resolve().parent / "results"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _write_results() -> None:
    if not RESULTS:
        return
    timestamp = os.environ.get("ASRBOX_REAL_TEST_RESULTS_TIMESTAMP")
    if not timestamp:
        timestamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
        os.environ["ASRBOX_REAL_TEST_RESULTS_TIMESTAMP"] = timestamp
    output_dir = _results_dir()
    payload = {
        "created_at": datetime.now(UTC).isoformat(),
        "total": len(RESULTS),
        "passed": sum(1 for item in RESULTS if item.get("ok")),
        "failed": sum(1 for item in RESULTS if not item.get("ok")),
        "items": RESULTS,
    }
    (output_dir / f"asrbox-real-models-{timestamp}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    lines = [
        "# ASRbox Real Model Results",
        "",
        f"- created_at: `{payload['created_at']}`",
        f"- total: `{payload['total']}`",
        f"- passed: `{payload['passed']}`",
        f"- failed: `{payload['failed']}`",
        "",
        "| model | source | repo | status | text | segments | exports | deleted |",
        "| --- | --- | --- | --- | ---: | ---: | --- | --- |",
    ]
    for item in RESULTS:
        lines.append(
            "| {model} | {source} | {repo} | {status} | {text_len} | {segments} | {exports} | {deleted} |".format(
                model=item["model_name"],
                source=item.get("installed_source") or item.get("preferred_source") or "",
                repo=item.get("installed_repo_id") or "",
                status="pass" if item.get("ok") else "fail",
                text_len=item.get("text_length") or 0,
                segments=item.get("segments_count") or 0,
                exports=",".join(item.get("exports") or []),
                deleted="yes" if item.get("deleted") else "no",
            )
        )
    (output_dir / f"asrbox-real-models-{timestamp}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def pytest_sessionfinish(session, exitstatus) -> None:
    _write_results()


@pytest.fixture(scope="session", autouse=True)
def _real_model_results_writer():
    yield
    _write_results()


def _client() -> TestClient:
    return TestClient(create_app())


def _media_file() -> Path:
    media_dir = os.environ.get("ASRBOX_REAL_MEDIA_DIR")
    if not media_dir:
        raise AssertionError("ASRBOX_REAL_MEDIA_DIR is required for real model tests")
    root = Path(media_dir).expanduser()
    if not root.exists():
        raise AssertionError(f"ASRBOX_REAL_MEDIA_DIR does not exist: {root}")
    candidates = sorted(path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES)
    if not candidates:
        raise AssertionError(f"No supported media files found in {root}")
    return candidates[0]


def _wait_for_model(client: TestClient, model_name: str, timeout_s: int) -> dict:
    deadline = time.time() + timeout_s
    last = {}
    while time.time() < deadline:
        response = client.get("/models/status")
        assert response.status_code == 200
        last = next(item for item in response.json()["models"] if item["model_name"] == model_name)
        if last["downloaded"] and last.get("compatible") is True:
            return last
        if last.get("download_error") or last.get("error"):
            raise AssertionError(f"{model_name} download failed: {last.get('download_error') or last.get('error')}")
        time.sleep(2)
    raise AssertionError(f"{model_name} did not become downloaded+compatible before timeout; last={last}")


def _wait_for_task(client: TestClient, task_id: str, timeout_s: int) -> dict:
    deadline = time.time() + timeout_s
    last = {}
    while time.time() < deadline:
        response = client.get(f"/tasks/{task_id}")
        assert response.status_code == 200
        last = response.json()
        if last["status"] == "completed":
            return last
        if last["status"] in {"failed", "cancelled", "interrupted", "failed_resumable"}:
            raise AssertionError(f"Task {task_id} failed for {last.get('model_name')}: {last}")
        time.sleep(2)
    raise AssertionError(f"Task {task_id} did not complete before timeout; last={last}")


@pytest.mark.parametrize("model_config", get_all_model_configs(), ids=lambda item: item.model_name)
def test_every_local_model_real_transcription(model_config) -> None:
    if os.environ.get("ASRBOX_RUN_REAL_MODELS") != "1":
        raise AssertionError("ASRBOX_RUN_REAL_MODELS=1 is required; real model tests must not be skipped")

    media_path = _media_file()
    download_timeout = int(os.environ.get("ASRBOX_REAL_MODEL_DOWNLOAD_TIMEOUT", "3600"))
    task_timeout = int(os.environ.get("ASRBOX_REAL_MODEL_TASK_TIMEOUT", "1800"))

    result_record = {
        "model_name": model_config.model_name,
        "ok": False,
        "preferred_source": None,
        "installed_source": None,
        "installed_repo_id": None,
        "exports": [],
        "deleted": False,
    }
    try:
        with _client() as client:
            status_response = client.get("/models/status")
            assert status_response.status_code == 200
            names = {item["model_name"] for item in status_response.json()["models"]}
            assert model_config.model_name in names

            status = next(item for item in status_response.json()["models"] if item["model_name"] == model_config.model_name)
            result_record["preferred_source"] = status.get("preferred_source")
            if not status["downloaded"] or status.get("compatible") is not True:
                download = client.post("/models/download", json={"model_name": model_config.model_name})
                assert download.status_code == 200
                status = _wait_for_model(client, model_config.model_name, download_timeout)
            assert status["downloaded"] is True
            assert status.get("compatible") is True
            result_record["installed_source"] = status.get("installed_source")
            result_record["installed_repo_id"] = status.get("installed_repo_id")

            with media_path.open("rb") as handle:
                response = client.post(
                    "/transcriptions",
                    data={
                        "backend": "local",
                        "model_name": model_config.model_name,
                        "language": "auto",
                        "output_formats": '["txt","srt","vtt","ass","json","markdown"]',
                    },
                    files={"file": (media_path.name, handle, "application/octet-stream")},
                )
            assert response.status_code == 200
            task = _wait_for_task(client, response.json()["id"], task_timeout)
            assert task["text"]
            assert task["segments"]
            result_record["task_id"] = task["id"]
            result_record["text_length"] = len(task["text"])
            result_record["segments_count"] = len(task["segments"])

            for fmt in EXPORT_FORMATS:
                export = client.get(f"/tasks/{task['id']}/export/{fmt}")
                assert export.status_code == 200
                assert export.text.strip()
                result_record["exports"].append(fmt)

            unload = client.post(f"/models/{model_config.model_name}/unload")
            assert unload.status_code == 200
            delete = client.delete(f"/models/{model_config.model_name}")
            assert delete.status_code == 200
            deleted_status = next(item for item in client.get("/models/status").json()["models"] if item["model_name"] == model_config.model_name)
            assert deleted_status["downloaded"] is False
            model_dir = config.get_models_dir() / model_config.model_name
            assert not model_dir.exists()
            result_record["deleted"] = True
            result_record["ok"] = True
    except Exception as exc:
        result_record["error"] = str(exc)
        raise
    finally:
        RESULTS.append(result_record)
