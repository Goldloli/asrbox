from __future__ import annotations

import ipaddress
from datetime import UTC, datetime
from urllib.parse import urlparse

import requests
from sqlalchemy.orm import Session

from backend.database.models import LLMProvider, ProofreadingRun
from backend.models import (
    LLMProviderCreate,
    LLMProviderPresetResponse,
    LLMProviderResponse,
    LLMProviderTestResponse,
    LLMProviderUpdate,
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


class LLMProviderError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def list_presets() -> list[LLMProviderPresetResponse]:
    return list(PRESETS)


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
    if parsed.scheme == "http" and not is_loopback_url(normalized):
        raise ValueError("Remote LLM provider endpoints must use HTTPS")
    return normalized


def _requires_api_key(provider: LLMProvider) -> bool:
    if provider.preset in CLOUD_PRESETS:
        return True
    if provider.preset == "ollama":
        return False
    return not is_loopback_url(provider.base_url)


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
        id=row.id,
        name=row.name,
        preset=row.preset,
        base_url=row.base_url,
        api_key_masked=mask_secret(row.api_key_secret),
        default_model=row.default_model,
        enabled=bool(row.enabled),
        is_local=is_loopback_url(row.base_url),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def list_providers(db: Session) -> list[LLMProviderResponse]:
    rows = db.query(LLMProvider).order_by(LLMProvider.created_at.asc()).all()
    return [to_response(row) for row in rows]


def create_provider(db: Session, payload: LLMProviderCreate) -> LLMProviderResponse:
    _validate_preset(payload.preset)
    row = LLMProvider(
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
    if "name" in data:
        if data["name"] is None:
            raise ValueError("LLM provider name is required")
        row.name = data["name"]
    if "preset" in data:
        if data["preset"] is None:
            raise ValueError("LLM provider preset is required")
        _validate_preset(data["preset"])
        row.preset = data["preset"]
    if "base_url" in data:
        if data["base_url"] is None:
            raise ValueError("LLM provider base URL is required")
        row.base_url = validate_base_url(data["base_url"])
    if "api_key" in data:
        row.api_key_secret = data["api_key"]
    if "default_model" in data:
        row.default_model = data["default_model"]
    if "enabled" in data:
        if data["enabled"] is None:
            raise ValueError("LLM provider enabled state is required")
        row.enabled = data["enabled"]
    row.updated_at = datetime.now(UTC)
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
    db.delete(row)
    db.commit()
    return True


def get_provider_row(db: Session, provider_id: str) -> LLMProvider | None:
    return db.query(LLMProvider).filter(LLMProvider.id == provider_id).first()


def chat_completion(provider: LLMProvider, messages: list[dict[str, str]], *, timeout: float = 30) -> str:
    validate_usable(provider)
    headers = {"Content-Type": "application/json"}
    if provider.api_key_secret:
        headers["Authorization"] = f"Bearer {provider.api_key_secret}"
    try:
        response = requests.post(
            f"{provider.base_url.rstrip('/')}/chat/completions",
            headers=headers,
            json={
                "model": provider.default_model,
                "messages": messages,
                "stream": False,
            },
            timeout=timeout,
            allow_redirects=False,
        )
    except requests.Timeout as exc:
        raise LLMProviderError("LLM_PROVIDER_TIMEOUT", "LLM provider timed out") from exc
    except requests.RequestException as exc:
        raise LLMProviderError("LLM_PROVIDER_UNAVAILABLE", "LLM provider request failed") from exc

    if response.status_code in {401, 403}:
        raise LLMProviderError("LLM_PROVIDER_AUTH_FAILED", "LLM provider rejected credentials")
    if response.status_code == 429:
        raise LLMProviderError("LLM_PROVIDER_RATE_LIMITED", "LLM provider rate limit reached")
    if _is_context_too_long(response):
        raise LLMProviderError("LLM_PROVIDER_CONTEXT_TOO_LONG", "LLM provider context limit exceeded")
    if not 200 <= response.status_code < 300:
        raise LLMProviderError("LLM_PROVIDER_HTTP_ERROR", f"LLM provider returned HTTP {response.status_code}")
    try:
        payload = response.json()
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise LLMProviderError("LLM_PROVIDER_INVALID_RESPONSE", "LLM provider returned an invalid response") from exc
    if not isinstance(content, str) or not content.strip():
        raise LLMProviderError("LLM_PROVIDER_INVALID_RESPONSE", "LLM provider returned an empty response")
    return content


def _is_context_too_long(response) -> bool:
    if response.status_code == 413:
        return True
    if response.status_code != 400:
        return False
    try:
        payload = response.json()
    except (TypeError, ValueError):
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
