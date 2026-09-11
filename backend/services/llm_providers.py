from __future__ import annotations

import asyncio
import ipaddress
import json
import os
from datetime import UTC, datetime
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from backend.database.models import ChatSession, LLMProvider, ProofreadingRun, TranslationRun
from backend.models import (
    LLMProviderCreate,
    LLMCompatibility,
    LLMProviderModelsRequest,
    LLMProviderModelsResponse,
    LLMProviderPresetResponse,
    LLMProviderResponse,
    LLMProviderTestResponse,
    LLMProviderUpdate,
)

from backend.services.llm_compatibility import (
    LLMProviderError, MAX_RESPONSE_BYTES, bounded_completion as _bounded_completion, bounded_get,
    completion_content, request_body, settings,
)

PRESETS = (
    LLMProviderPresetResponse(
        id="minimax",
        name="MiniMax",
        base_url="https://api.minimaxi.com/v1",
        requires_api_key=True,
    ),
    LLMProviderPresetResponse(
        id="kimi",
        name="Kimi",
        base_url="https://api.moonshot.cn/v1",
        requires_api_key=True,
    ),
    LLMProviderPresetResponse(
        id="deepseek",
        name="DeepSeek",
        base_url="https://api.deepseek.com",
        requires_api_key=True,
    ),
    LLMProviderPresetResponse(
        id="qwen",
        name="Qwen",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        requires_api_key=True,
    ),
    LLMProviderPresetResponse(
        id="glm",
        name="GLM",
        base_url="https://open.bigmodel.cn/api/paas/v4",
        requires_api_key=True,
    ),
    LLMProviderPresetResponse(
        id="ollama",
        name="Ollama",
        base_url="http://localhost:11434/v1",
        requires_api_key=False,
        local_default=True,
    ),
    LLMProviderPresetResponse(
        id="custom",
        name="OpenAI-compatible",
        base_url="",
        requires_api_key=True,
    ),
)

PRESETS_BY_ID = {item.id: item for item in PRESETS}
CLOUD_PRESETS = {"minimax", "kimi", "deepseek", "qwen", "glm"}


def list_presets() -> list[LLMProviderPresetResponse]:
    if os.environ.get("ASRBOX_CONTAINER") != "1":
        return list(PRESETS)
    return [
        preset.model_copy(update={"base_url": "http://host.docker.internal:11434/v1"})
        if preset.id == "ollama"
        else preset
        for preset in PRESETS
    ]


def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 6:
        return "*" * len(value)
    return f"{value[:3]}...{value[-3:]}"


def is_loopback_url(value: str) -> bool:
    try:
        hostname = urlparse(value).hostname
    except ValueError:
        return False
    if not hostname:
        return False
    if hostname.lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(hostname).is_loopback
    except ValueError:
        return False


def is_local_url(value: str) -> bool:
    if is_loopback_url(value):
        return True
    try:
        hostname = urlparse(value).hostname
    except ValueError:
        return False
    return os.environ.get("ASRBOX_CONTAINER") == "1" and hostname == "host.docker.internal"


def validate_base_url(value: str) -> str:
    normalized = value.strip().rstrip("/")
    try:
        parsed = urlparse(normalized)
        port = parsed.port
    except ValueError as exc:
        raise ValueError("LLM provider base URL is invalid") from exc
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or port is not None and not 1 <= port <= 65535:
        raise ValueError("LLM provider base URL must be an HTTP or HTTPS URL")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("LLM provider base URL must not contain credentials, query parameters, or fragments")
    if parsed.scheme == "http" and not is_local_url(normalized):
        raise ValueError("Remote LLM provider endpoints must use HTTPS")
    return normalized


def _requires_api_key(provider: LLMProvider) -> bool:
    if provider.preset in CLOUD_PRESETS:
        return True
    if provider.preset == "ollama":
        return False
    return not is_local_url(provider.base_url)


def _validate_preset(preset: str) -> None:
    if preset not in PRESETS_BY_ID:
        raise ValueError(f"Unsupported LLM provider preset: {preset}")


def validate_usable(provider: LLMProvider) -> None:
    if not provider.enabled:
        raise LLMProviderError("LLM_PROVIDER_DISABLED", "LLM provider is disabled")
    validate_base_url(provider.base_url)
    if not (provider.default_model or "").strip():
        raise LLMProviderError("LLM_MODEL_REQUIRED", "LLM provider requires a model")
    if _requires_api_key(provider) and not provider.api_key_secret:
        raise LLMProviderError("LLM_API_KEY_REQUIRED", "LLM provider requires an API key")


def to_response(row: LLMProvider) -> LLMProviderResponse:
    return LLMProviderResponse(
        compatibility=settings(row),
        id=row.id,
        name=row.name,
        preset=row.preset,
        base_url=row.base_url,
        api_key_masked=mask_secret(row.api_key_secret),
        default_model=row.default_model,
        enabled=bool(row.enabled),
        is_local=is_local_url(row.base_url),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def list_providers(db: Session) -> list[LLMProviderResponse]:
    rows = db.query(LLMProvider).order_by(LLMProvider.created_at.asc()).all()
    return [to_response(row) for row in rows]


def create_provider(db: Session, payload: LLMProviderCreate) -> LLMProviderResponse:
    _validate_preset(payload.preset)
    row = LLMProvider(
        compatibility_json=payload.compatibility.model_dump_json(),
        name=payload.name,
        preset=payload.preset,
        base_url=validate_base_url(payload.base_url),
        api_key_secret=payload.api_key,
        default_model=payload.default_model,
        enabled=payload.enabled,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return to_response(row)


def update_provider(db: Session, provider_id: str, patch: LLMProviderUpdate) -> LLMProviderResponse | None:
    row = db.query(LLMProvider).filter(LLMProvider.id == provider_id).first()
    if row is None:
        return None
    data = patch.model_dump(exclude_unset=True)
    expected = data.pop("expected_updated_at", None)
    updates = {}
    for key in ("name", "preset", "base_url", "enabled", "compatibility"):
        if key in data and data[key] is None:
            raise ValueError(f"LLM provider {key} is required")
    if "preset" in data:
        _validate_preset(data["preset"])
    if "base_url" in data:
        data["base_url"] = validate_base_url(data["base_url"])
    if "compatibility" in data:
        updates["compatibility_json"] = LLMCompatibility.model_validate(data.pop("compatibility")).model_dump_json()
    if "api_key" in data:
        updates["api_key_secret"] = data.pop("api_key")
    updates.update(data)
    updates["updated_at"] = datetime.now(UTC)
    query = db.query(LLMProvider).filter(LLMProvider.id == provider_id)
    if expected is not None:
        # SQLite stores naive UTC datetimes; apply recommendations only to their exact config revision.
        expected = expected.astimezone(UTC).replace(tzinfo=None) if expected.tzinfo else expected
        query = query.filter(LLMProvider.updated_at == expected)
    if query.update(updates, synchronize_session=False) != 1:
        db.rollback()
        raise LLMProviderError("LLM_PROVIDER_CHANGED", "Provider changed; test the current configuration again")
    db.commit()
    db.refresh(row)
    return to_response(row)


def delete_provider(db: Session, provider_id: str) -> bool:
    row = db.query(LLMProvider).filter(LLMProvider.id == provider_id).first()
    if row is None:
        return False
    db.query(ProofreadingRun).filter(ProofreadingRun.llm_provider_id == provider_id).update(
        {ProofreadingRun.llm_provider_id: None},
        synchronize_session="fetch",
    )
    db.query(TranslationRun).filter(TranslationRun.llm_provider_id == provider_id).update(
        {TranslationRun.llm_provider_id: None}, synchronize_session="fetch",
    )
    db.query(ChatSession).filter(ChatSession.provider_id == provider_id).update(
        {ChatSession.provider_id: None}, synchronize_session="fetch",
    )
    db.delete(row)
    db.commit()
    return True


def get_provider_row(db: Session, provider_id: str) -> LLMProvider | None:
    return db.query(LLMProvider).filter(LLMProvider.id == provider_id).first()


def chat_completion(provider: LLMProvider, messages: list[dict[str, str]], *, timeout: float = 30,
                    max_response_bytes: int | None = None, structured_translation: bool = False,
                    response_schema: dict | None = None, on_delta=None) -> str:
    validate_usable(provider)
    headers = {"Content-Type": "application/json"}
    if provider.api_key_secret:
        headers["Authorization"] = f"Bearer {provider.api_key_secret}"
    body = request_body(provider, messages, structured=structured_translation or response_schema is not None,
                        schema=response_schema, stream=True if on_delta is not None else None)
    url = f"{provider.base_url.rstrip('/')}/chat/completions"
    response = asyncio.run(_bounded_completion(url, headers, body, timeout,
                                               max_response_bytes if max_response_bytes is not None else MAX_RESPONSE_BYTES,
                                               on_delta))
    if response.status_code in {401, 403}:
        raise LLMProviderError("LLM_PROVIDER_AUTH_FAILED", "LLM provider rejected credentials")
    if response.status_code == 429:
        raise LLMProviderError("LLM_PROVIDER_RATE_LIMITED", "LLM provider rate limit reached")
    if _is_context_too_long(response):
        raise LLMProviderError("LLM_PROVIDER_CONTEXT_TOO_LONG", "LLM provider context limit exceeded")
    if response.status_code in {400, 422}:
        # Only classify known parameter rejection; never expose a provider body or guess from model text.
        try:
            detail = json.dumps(response.json()).lower()
        except (ValueError, RecursionError):
            detail = ""
        if any(key in detail for key in ("response_format", "json_schema", "json_object")) and any(
            word in detail for word in ("unsupported", "not support", "not supported", "invalid", "unknown")
        ):
            raise LLMProviderError("LLM_OUTPUT_FORMAT_UNSUPPORTED", "Provider rejected the output format; run capability testing")
        raise LLMProviderError("LLM_PARAMETERS_REJECTED", "Provider rejected the request; review protocol, thinking and streaming settings")
    if not 200 <= response.status_code < 300:
        raise LLMProviderError("LLM_PROVIDER_HTTP_ERROR", f"LLM provider returned HTTP {response.status_code}")
    try:
        payload = response.json()
    except (ValueError, RecursionError) as exc:
        raise LLMProviderError("LLM_PROVIDER_INVALID_RESPONSE", "LLM provider returned invalid JSON") from exc
    return completion_content(payload)


def _is_context_too_long(response) -> bool:
    if response.status_code == 413:
        return True
    if response.status_code != 400:
        return False
    try:
        payload = response.json()
    except (TypeError, ValueError, RecursionError):
        return False

    values: list[str] = []

    def collect(value) -> None:
        if isinstance(value, dict):
            for item in value.values():
                collect(item)
        elif isinstance(value, list):
            for item in value:
                collect(item)
        elif isinstance(value, str):
            values.append(value.lower())

    collect(payload)
    combined = " ".join(values)
    return any(
        marker in combined
        for marker in (
            "context_length_exceeded",
            "maximum context length",
            "context window",
            "too many tokens",
            "prompt is too long",
            "input is too long",
        )
    )


def test_provider(db: Session, provider_id: str) -> LLMProviderTestResponse | None:
    row = get_provider_row(db, provider_id)
    if row is None:
        return None
    try:
        chat_completion(
            row,
            [
                {"role": "system", "content": "Return a short connectivity confirmation."},
                {"role": "user", "content": "Reply with OK."},
            ],
        )
    except (LLMProviderError, ValueError) as exc:
        return LLMProviderTestResponse(
            ok=False,
            message=str(exc),
            error_code=getattr(exc, "code", "LLM_PROVIDER_INVALID"),
        )
    return LLMProviderTestResponse(ok=True, message="LLM provider connection succeeded")


MAX_MODEL_LIST_ITEMS = 500
MODEL_LIST_TIMEOUT = 10


def _classify_list_response(response) -> None:
    if response.status_code in {401, 403}:
        raise LLMProviderError("LLM_PROVIDER_AUTH_FAILED", "LLM provider rejected credentials")
    if response.status_code == 429:
        raise LLMProviderError("LLM_PROVIDER_RATE_LIMITED", "LLM provider rate limit reached")
    if not 200 <= response.status_code < 300:
        raise LLMProviderError("LLM_PROVIDER_HTTP_ERROR", f"LLM provider returned HTTP {response.status_code}")


def _parse_json(response):
    try:
        return response.json()
    except (ValueError, RecursionError) as exc:
        raise LLMProviderError("LLM_PROVIDER_INVALID_RESPONSE", "LLM provider returned invalid JSON") from exc


def _extract_model_ids(entries, key: str) -> list[str]:
    if not isinstance(entries, list):
        raise LLMProviderError("LLM_PROVIDER_INVALID_RESPONSE", "LLM provider returned an invalid model list")
    items: list[str] = []
    seen: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        model_id = entry.get(key)
        if not isinstance(model_id, str) or not model_id.strip() or model_id in seen:
            continue
        seen.add(model_id)
        items.append(model_id)
        if len(items) >= MAX_MODEL_LIST_ITEMS:
            break
    return items


def _fetch_openai_model_ids(base_url: str, headers: dict[str, str]) -> list[str]:
    response = asyncio.run(bounded_get(f"{base_url}/models", headers, MODEL_LIST_TIMEOUT, MAX_RESPONSE_BYTES))
    _classify_list_response(response)
    payload = _parse_json(response)
    if not isinstance(payload, dict):
        raise LLMProviderError("LLM_PROVIDER_INVALID_RESPONSE", "LLM provider returned an invalid model list")
    return _extract_model_ids(payload.get("data"), "id")


def _fetch_ollama_model_names(base_url: str, headers: dict[str, str]) -> list[str]:
    native_base = base_url[:-3] if base_url.lower().endswith("/v1") else base_url
    response = asyncio.run(bounded_get(f"{native_base}/api/tags", headers, MODEL_LIST_TIMEOUT, MAX_RESPONSE_BYTES))
    _classify_list_response(response)
    payload = _parse_json(response)
    if not isinstance(payload, dict):
        raise LLMProviderError("LLM_PROVIDER_INVALID_RESPONSE", "LLM provider returned an invalid model list")
    return _extract_model_ids(payload.get("models"), "name")


def fetch_models(db: Session, payload: LLMProviderModelsRequest) -> LLMProviderModelsResponse:
    """Probe the provider's model list with inline form values; nothing is persisted or echoed."""
    try:
        _validate_preset(payload.preset)
        base_url = validate_base_url(payload.base_url)
        api_key = (payload.api_key or "").strip() or None
        if not api_key and payload.provider_id:
            row = get_provider_row(db, payload.provider_id)
            if row is None:
                raise LLMProviderError("LLM_PROVIDER_NOT_FOUND", "LLM provider not found")
            api_key = row.api_key_secret
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        try:
            items = _fetch_openai_model_ids(base_url, headers)
        except LLMProviderError:
            if payload.preset != "ollama":
                raise
            items = _fetch_ollama_model_names(base_url, headers)
    except (LLMProviderError, ValueError) as exc:
        return LLMProviderModelsResponse(
            ok=False,
            items=[],
            message=str(exc),
            error_code=getattr(exc, "code", "LLM_PROVIDER_INVALID"),
        )
    return LLMProviderModelsResponse(ok=True, items=items, message=f"{len(items)} models available")
