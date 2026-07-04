from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import requests

from backend.models import ProviderHealth, TranscriptSegment, TranscriptionResult
from backend.providers.base import ProviderError


def _get_path(data: Any, path: str | None):
    if not path:
        return None
    current = data
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list) and part.isdigit():
            current = current[int(part)]
        else:
            return None
    return current


def _segments_from_payload(value: Any) -> list[TranscriptSegment]:
    if not isinstance(value, list):
        return []
    segments = []
    for index, item in enumerate(value, 1):
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or item.get("transcript") or "").strip()
        if not text:
            continue
        start = float(item.get("start") or item.get("start_time") or 0)
        end = float(item.get("end") or item.get("end_time") or start)
        if start > 1000 or end > 1000:
            start /= 1000
            end /= 1000
        segments.append(TranscriptSegment(id=index, start=start, end=end, text=text))
    return segments


def _provider_error(message: str, status_code: int | None = None, *, stage: str | None = None) -> ProviderError:
    if status_code in {401, 403}:
        return ProviderError(message, code="PROVIDER_AUTH_FAILED", retryable=False, stage=stage)
    if status_code == 429:
        return ProviderError(message, code="PROVIDER_RATE_LIMITED", retryable=True, stage=stage)
    if status_code and status_code >= 500:
        return ProviderError(message, retryable=True, stage=stage)
    return ProviderError(message, retryable=False, stage=stage)


def _raise_if_cancelled(options: dict, stage: str = "cancel") -> None:
    should_cancel = options.get("should_cancel") or (lambda: False)
    if should_cancel():
        raise ProviderError("Task was cancelled", code="TASK_CANCELLED", retryable=False, stage=stage)


def _sleep_or_cancel(seconds: float, options: dict, stage: str = "poll") -> None:
    deadline = time.time() + seconds
    while time.time() < deadline:
        _raise_if_cancelled(options, stage=stage)
        time.sleep(min(0.2, deadline - time.time()))


def _result_from_payload(data: Any, *, text_path: str | None, segments_path: str | None, provider_id: str) -> TranscriptionResult:
    text_value = _get_path(data, text_path) if text_path else None
    if text_value is None and isinstance(data, dict):
        text_value = data.get("text")
    segments = _segments_from_payload(_get_path(data, segments_path) if segments_path else data.get("segments") if isinstance(data, dict) else None)
    text = str(text_value or "").strip()
    if not text and segments:
        text = "\n".join(segment.text for segment in segments)
    if text and not segments:
        segments = [TranscriptSegment(id=1, start=0.0, end=0.0, text=text)]
    return TranscriptionResult(
        text=text,
        duration=segments[-1].end if segments else None,
        segments=segments,
        provider_id=provider_id,
    )


class OpenAICompatibleProvider:
    def __init__(self, provider_id: str, base_url: str, api_key: str | None, default_model: str | None) -> None:
        self.provider_id = provider_id
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.default_model = default_model or "whisper-1"

    def test_connection(self) -> ProviderHealth:
        ok = bool(self.base_url and self.api_key)
        return ProviderHealth(
            ok=ok,
            provider_type="openai_compatible",
            message="OpenAI-compatible provider is configured." if ok else "Missing base_url or api_key.",
            models=[self.default_model],
        )

    def transcribe(self, audio_path: str, options: dict) -> TranscriptionResult:
        _raise_if_cancelled(options, stage="submit")
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        with Path(audio_path).open("rb") as handle:
            files = {"file": (Path(audio_path).name, handle)}
            data = {
                "model": options.get("model") or self.default_model,
                "response_format": "verbose_json",
            }
            language = options.get("language")
            if language and language != "auto":
                data["language"] = language
            response = requests.post(
                f"{self.base_url}/audio/transcriptions",
                headers=headers,
                files=files,
                data=data,
                timeout=120,
            )
        if response.status_code >= 400:
            raise _provider_error(f"OpenAI-compatible provider failed: {response.status_code} {response.text[:300]}", response.status_code, stage="submit")
        try:
            payload = response.json()
        except json.JSONDecodeError:
            payload = {"text": response.text}
        return _result_from_payload(payload, text_path="text", segments_path="segments", provider_id=self.provider_id)

    def list_models(self) -> list[str]:
        return [self.default_model]


class GenericHTTPProvider:
    def __init__(self, provider_id: str, base_url: str | None, api_key: str | None, default_model: str | None, options: dict) -> None:
        self.provider_id = provider_id
        self.base_url = base_url
        self.api_key = api_key
        self.default_model = default_model
        self.options = options

    def test_connection(self) -> ProviderHealth:
        url = self.options.get("url") or self.base_url
        return ProviderHealth(
            ok=bool(url),
            provider_type="generic_http",
            message="Generic HTTP provider is configured." if url else "Missing url.",
            models=[self.default_model] if self.default_model else [],
        )

    def transcribe(self, audio_path: str, options: dict) -> TranscriptionResult:
        _raise_if_cancelled(options, stage="submit")
        url = self.options.get("url") or self.base_url
        if not url:
            raise ProviderError("Generic HTTP provider missing url")
        method = str(self.options.get("method") or "POST").upper()
        headers = dict(self.options.get("headers") or {})
        if self.api_key and "Authorization" not in headers:
            headers["Authorization"] = f"Bearer {self.api_key}"
        file_field = self.options.get("file_field") or "file"
        model_field = self.options.get("model_field") or "model"
        data = {}
        model = options.get("model") or self.default_model
        if model:
            data[model_field] = model
        with Path(audio_path).open("rb") as handle:
            files = {file_field: (Path(audio_path).name, handle)}
            response = requests.request(method, url, headers=headers, files=files, data=data, timeout=120)
        if response.status_code >= 400:
            raise _provider_error(f"Generic HTTP provider failed: {response.status_code} {response.text[:300]}", response.status_code, stage="submit")
        payload = response.json()
        return _result_from_payload(
            payload,
            text_path=self.options.get("text_path") or "text",
            segments_path=self.options.get("segments_path") or "segments",
            provider_id=self.provider_id,
        )

    def list_models(self) -> list[str]:
        return [self.default_model] if self.default_model else []


class AliyunProvider(GenericHTTPProvider):
    def test_connection(self) -> ProviderHealth:
        required = ["app_key", "access_key_id", "access_key_secret"]
        missing = [key for key in required if not self.options.get(key)]
        endpoint = self.options.get("url") or self.base_url
        if missing:
            return ProviderHealth(
                ok=False,
                provider_type="aliyun",
                message=f"Missing Aliyun config: {', '.join(missing)}.",
                models=[self.default_model or "paraformer-v2"],
            )
        return ProviderHealth(
            ok=bool(endpoint),
            provider_type="aliyun",
            message="Aliyun provider is configured." if endpoint else "Missing Aliyun endpoint url.",
            models=[self.default_model or "paraformer-v2"],
        )

    def transcribe(self, audio_path: str, options: dict) -> TranscriptionResult:
        _raise_if_cancelled(options, stage="submit")
        submit_url = self.options.get("submit_url") or self.options.get("url") or self.base_url
        result_url = self.options.get("result_url")
        if not submit_url:
            raise ProviderError("Aliyun provider missing submit_url", stage="submit")
        if not result_url:
            return super().transcribe(audio_path, options)

        headers = dict(self.options.get("headers") or {})
        access_key_id = self.options.get("access_key_id")
        access_key_secret = self.options.get("access_key_secret")
        if access_key_id:
            headers["X-ASRBOX-Aliyun-Access-Key-Id"] = str(access_key_id)
        if access_key_secret:
            headers["X-ASRBOX-Aliyun-Access-Key-Secret"] = str(access_key_secret)
        data = {
            "app_key": self.options.get("app_key"),
            "model": options.get("model") or self.default_model or "paraformer-v2",
        }
        data = {key: value for key, value in data.items() if value}
        with Path(audio_path).open("rb") as handle:
            response = requests.post(
                submit_url,
                headers=headers,
                files={"file": (Path(audio_path).name, handle)},
                data=data,
                timeout=120,
            )
        if response.status_code >= 400:
            raise _provider_error(f"Aliyun submit failed: {response.status_code} {response.text[:300]}", response.status_code, stage="submit")
        payload = response.json()
        task_id = _get_path(payload, self.options.get("task_id_path") or "task_id")
        if not task_id:
            return _result_from_payload(
                payload,
                text_path=self.options.get("text_path") or "text",
                segments_path=self.options.get("segments_path") or "segments",
                provider_id=self.provider_id,
            )

        status_path = self.options.get("status_path") or "status"
        success_status = str(self.options.get("success_status") or "completed")
        error_status = str(self.options.get("error_status") or "failed")
        interval = float(self.options.get("poll_interval_seconds") or 1)
        attempts = int(self.options.get("poll_attempts") or 120)
        for _ in range(attempts):
            _raise_if_cancelled(options, stage="poll")
            result_response = requests.get(
                result_url,
                headers=headers,
                params={"task_id": task_id},
                timeout=60,
            )
            if result_response.status_code >= 400:
                raise _provider_error(f"Aliyun result polling failed: {result_response.status_code} {result_response.text[:300]}", result_response.status_code, stage="poll")
            result_payload = result_response.json()
            status = str(_get_path(result_payload, status_path) or "")
            if status == success_status:
                return _result_from_payload(
                    result_payload,
                    text_path=self.options.get("text_path") or "text",
                    segments_path=self.options.get("segments_path") or "segments",
                    provider_id=self.provider_id,
                )
            if status == error_status:
                raise ProviderError(f"Aliyun task failed: {result_payload}", stage="poll")
            _sleep_or_cancel(interval, options, stage="poll")
        raise ProviderError("Aliyun ASR task timed out", code="PROVIDER_TIMEOUT", retryable=True, stage="poll")
