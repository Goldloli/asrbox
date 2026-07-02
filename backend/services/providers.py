from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from backend.database.models import ASRProvider
from backend.models import ProviderCreate, ProviderHealth, ProviderResponse, ProviderUpdate


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


def to_response(row: ASRProvider) -> ProviderResponse:
    return ProviderResponse(
        id=row.id,
        name=row.name,
        provider_type=row.provider_type,
        base_url=row.base_url,
        api_key_masked=mask_secret(row.api_key_secret),
        default_model=row.default_model,
        enabled=bool(row.enabled),
        options=_options(row),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def list_providers(db: Session) -> list[ProviderResponse]:
    rows = db.query(ASRProvider).order_by(ASRProvider.created_at.asc()).all()
    priority = {"bcut": 0, "aliyun": 1, "custom": 2}
    return sorted([to_response(row) for row in rows], key=lambda p: (priority.get(p.provider_type, 9), p.name))


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
    row.updated_at = datetime.utcnow()
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
    if row.provider_type == "aliyun":
        ok = bool(row.api_key_secret)
        return ProviderHealth(
            ok=ok,
            provider_type=row.provider_type,
            message="阿里云 provider 已保存配置。" if ok else "缺少 API Key。",
            models=[row.default_model or "paraformer-v2"],
        )
    return ProviderHealth(
        ok=bool(row.base_url),
        provider_type=row.provider_type,
        message="自定义 provider 已保存配置。" if row.base_url else "缺少 base_url。",
        models=[row.default_model] if row.default_model else [],
    )

