from __future__ import annotations

import json
import time
from datetime import UTC, datetime
from typing import Any

import requests
from sqlalchemy.orm import Session

from backend.database.models import ASRProvider
from backend.models import ProviderCreate, ProviderHealth, ProviderResponse, ProviderUpdate, TranscriptionResult
from backend.providers import BcutProvider
from backend.providers.base import ProviderError
from backend.providers.http_providers import AliyunProvider, GenericHTTPProvider, OpenAICompatibleProvider


def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 6:
        return "*" * len(value)
    return f"{value[:3]}...{value[-3:]}"


def _options(row: ASRProvider) -> dict[str, Any]:
    try:
        return json.loads(row.options_json or "{}")
    except json.JSONDecodeError:
        return {}


def _mask_options(value):
    if isinstance(value, dict):
        masked = {}
        for key, item in value.items():
            lowered = key.lower()
            if any(token in lowered for token in ("secret", "token", "key", "password")):
                masked[key] = mask_secret(str(item)) if item else item
            else:
                masked[key] = _mask_options(item)
        return masked
    if isinstance(value, list):
        return [_mask_options(item) for item in value]
    return value


def to_response(row: ASRProvider) -> ProviderResponse:
    return ProviderResponse(
        id=row.id,
        name=row.name,
        provider_type=row.provider_type,
        base_url=row.base_url,
        api_key_masked=mask_secret(row.api_key_secret),
        default_model=row.default_model,
        enabled=bool(row.enabled),
        options=_mask_options(_options(row)),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def list_providers(db: Session) -> list[ProviderResponse]:
    rows = db.query(ASRProvider).order_by(ASRProvider.created_at.asc()).all()
    priority = {"bcut": 0, "aliyun": 1, "openai_compatible": 2, "generic_http": 3, "custom": 4}
    return sorted([to_response(row) for row in rows], key=lambda p: (priority.get(p.provider_type, 9), p.name))


def build_provider(row: ASRProvider):
    options = _options(row)
    if row.provider_type == "bcut":
        return BcutProvider()
    if row.provider_type == "aliyun":
        return AliyunProvider(row.id, row.base_url, row.api_key_secret, row.default_model, options)
    if row.provider_type == "openai_compatible":
        if not row.base_url:
            raise RuntimeError("OpenAI-compatible provider missing base_url")
        return OpenAICompatibleProvider(row.id, row.base_url, row.api_key_secret, row.default_model)
    return GenericHTTPProvider(row.id, row.base_url, row.api_key_secret, row.default_model, options)


def create_provider(db: Session, payload: ProviderCreate) -> ProviderResponse:
    row = ASRProvider(
        name=payload.name,
        provider_type=payload.provider_type,
        base_url=payload.base_url,
        api_key_secret=payload.api_key,
        default_model=payload.default_model,
        enabled=payload.enabled,
        options_json=json.dumps(payload.options, ensure_ascii=False),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return to_response(row)


def update_provider(db: Session, provider_id: str, patch: ProviderUpdate) -> ProviderResponse | None:
    row = db.query(ASRProvider).filter(ASRProvider.id == provider_id).first()
    if row is None:
        return None
    data = patch.model_dump(exclude_unset=True)
    if "name" in data:
        row.name = data["name"]
    if "provider_type" in data:
        row.provider_type = data["provider_type"]
    if "base_url" in data:
        row.base_url = data["base_url"]
    if "api_key" in data:
        row.api_key_secret = data["api_key"]
    if "default_model" in data:
        row.default_model = data["default_model"]
    if "enabled" in data:
        row.enabled = data["enabled"]
    if "options" in data:
        row.options_json = json.dumps(data["options"] or {}, ensure_ascii=False)
    row.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(row)
    return to_response(row)


def delete_provider(db: Session, provider_id: str) -> bool:
    row = db.query(ASRProvider).filter(ASRProvider.id == provider_id).first()
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True


def test_provider(db: Session, provider_id: str) -> ProviderHealth | None:
    row = db.query(ASRProvider).filter(ASRProvider.id == provider_id).first()
    if row is None:
        return None
    if row.provider_type == "bcut":
        return ProviderHealth(
            ok=True,
            provider_type=row.provider_type,
            message="必剪免费接口已配置；实际可用性取决于非官方接口状态。",
            models=["bcut-free"],
        )
    provider = build_provider(row)
    return provider.test_connection()


def transcribe_with_provider(db: Session, provider_id: str, audio_path: str, options: dict) -> TranscriptionResult:
    row = db.query(ASRProvider).filter(ASRProvider.id == provider_id).first()
    if row is None:
        raise RuntimeError(f"Provider {provider_id} is not configured")
    if not row.enabled:
        raise RuntimeError(f"Provider {provider_id} is disabled")
    provider = build_provider(row)
    provider_options = {**_options(row), **options, "model": options.get("model") or row.default_model}
    should_cancel = provider_options.get("should_cancel") or (lambda: False)
    delays = [1, 2, 5]
    last_error: Exception | None = None
    for attempt in range(len(delays) + 1):
        if should_cancel():
            raise ProviderError("Task was cancelled", code="TASK_CANCELLED", retryable=False, stage="cancel")
        try:
            return provider.transcribe(audio_path, provider_options)
        except requests.Timeout as exc:
            last_error = ProviderError(str(exc), code="PROVIDER_TIMEOUT", retryable=True, stage="submit")
        except requests.RequestException as exc:
            last_error = ProviderError(str(exc), retryable=True, stage="submit")
        except ProviderError as exc:
            last_error = exc
            if not exc.retryable:
                raise
        if attempt >= len(delays):
            break
        deadline = time.time() + delays[attempt]
        while time.time() < deadline:
            if should_cancel():
                raise ProviderError("Task was cancelled", code="TASK_CANCELLED", retryable=False, stage="cancel")
            time.sleep(min(0.2, deadline - time.time()))
    if isinstance(last_error, ProviderError):
        raise last_error
    raise RuntimeError(f"Provider {provider_id} failed")
