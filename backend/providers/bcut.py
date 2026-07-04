from __future__ import annotations

import json
import time
from pathlib import Path

import requests

from backend.models import ProviderHealth, TranscriptSegment, TranscriptionResult
from backend.providers.base import ProviderError

API_BASE_URL = "https://member.bilibili.com/x/bcut/rubick-interface"
API_REQ_UPLOAD = f"{API_BASE_URL}/resource/create"
API_COMMIT_UPLOAD = f"{API_BASE_URL}/resource/create/complete"
API_CREATE_TASK = f"{API_BASE_URL}/task"
API_QUERY_RESULT = f"{API_BASE_URL}/task/result"


class BcutProvider:
    headers = {
        "User-Agent": "Bilibili/1.0.0 (https://www.bilibili.com)",
        "Content-Type": "application/json",
    }

    def test_connection(self) -> ProviderHealth:
        return ProviderHealth(
            ok=True,
            provider_type="bcut",
            message="必剪免费接口适配器已启用；真实任务会在转写时访问非官方接口。",
            models=["bcut-free"],
        )

    def list_models(self) -> list[str]:
        return ["bcut-free"]

    def transcribe(self, audio_path: str, options: dict) -> TranscriptionResult:
        audio = Path(audio_path).read_bytes()
        response = self._run(audio, options.get("should_cancel") or (lambda: False))
        segments = [
            TranscriptSegment(
                id=index,
                start=item["start_time"] / 1000,
                end=item["end_time"] / 1000,
                text=item["transcript"],
            )
            for index, item in enumerate(response.get("utterances", []), 1)
        ]
        return TranscriptionResult(
            text="\n".join(segment.text for segment in segments),
            language=options.get("language"),
            duration=segments[-1].end if segments else None,
            segments=segments,
            provider_id="bcut",
        )

    def _run(self, audio: bytes, should_cancel) -> dict:
        self._raise_if_cancelled(should_cancel)
        upload_data = self._request_upload(audio)
        self._raise_if_cancelled(should_cancel)
        etags = self._upload_parts(audio, upload_data)
        self._raise_if_cancelled(should_cancel)
        download_url = self._commit_upload(upload_data, etags)
        self._raise_if_cancelled(should_cancel)
        task_id = self._create_task(download_url)
        for _ in range(500):
            self._raise_if_cancelled(should_cancel)
            result = self._query_result(task_id)
            if result.get("state") == 4:
                return json.loads(result["result"])
            self._sleep_or_cancel(1, should_cancel)
        raise RuntimeError("Bcut ASR task timed out")

    @staticmethod
    def _raise_if_cancelled(should_cancel) -> None:
        if should_cancel():
            raise ProviderError("Task was cancelled", code="TASK_CANCELLED", stage="cancel")

    @classmethod
    def _sleep_or_cancel(cls, seconds: float, should_cancel) -> None:
        deadline = time.time() + seconds
        while time.time() < deadline:
            cls._raise_if_cancelled(should_cancel)
            time.sleep(min(0.2, deadline - time.time()))

    def _request_upload(self, audio: bytes) -> dict:
        payload = json.dumps(
            {
                "type": 2,
                "name": "audio.mp3",
                "size": len(audio),
                "ResourceFileType": "mp3",
                "model_id": "8",
            }
        )
        response = requests.post(API_REQ_UPLOAD, data=payload, headers=self.headers, timeout=30)
        response.raise_for_status()
        return response.json()["data"]

    def _upload_parts(self, audio: bytes, data: dict) -> list[str]:
        etags: list[str] = []
        per_size = data["per_size"]
        for index, upload_url in enumerate(data["upload_urls"]):
            start = index * per_size
            end = (index + 1) * per_size
            response = requests.put(upload_url, data=audio[start:end], headers=self.headers, timeout=60)
            response.raise_for_status()
            etags.append(response.headers.get("Etag", ""))
        return etags

    def _commit_upload(self, data: dict, etags: list[str]) -> str:
        payload = json.dumps(
            {
                "InBossKey": data["in_boss_key"],
                "ResourceId": data["resource_id"],
                "Etags": ",".join(etags),
                "UploadId": data["upload_id"],
                "model_id": "8",
            }
        )
        response = requests.post(API_COMMIT_UPLOAD, data=payload, headers=self.headers, timeout=30)
        response.raise_for_status()
        return response.json()["data"]["download_url"]

    def _create_task(self, download_url: str) -> str:
        response = requests.post(
            API_CREATE_TASK,
            json={"resource": download_url, "model_id": "8"},
            headers=self.headers,
            timeout=30,
        )
        response.raise_for_status()
        return response.json()["data"]["task_id"]

    def _query_result(self, task_id: str) -> dict:
        response = requests.get(
            API_QUERY_RESULT,
            params={"model_id": 7, "task_id": task_id},
            headers=self.headers,
            timeout=30,
        )
        response.raise_for_status()
        return response.json()["data"]
