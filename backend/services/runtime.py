from __future__ import annotations

import json
import shutil
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from backend import config
from backend.models import RuntimeStatusResponse
from backend.services.platform import detect_runtime


def get_runtime_status() -> RuntimeStatusResponse:
    models_dir = config.get_models_dir()
    data = detect_runtime()
    try:
        free_disk_bytes = shutil.disk_usage(models_dir).free
    except OSError:
        free_disk_bytes = None
        data["warnings"].append("models directory disk usage is unavailable")
    return RuntimeStatusResponse(
        **data,
        data_dir=str(config.get_data_dir()),
        models_dir=str(models_dir),
        free_disk_bytes=free_disk_bytes,
    )


def _latest_schema_version(db) -> str | None:
    try:
        from backend.database.models import SchemaMigration

        row = db.query(SchemaMigration).order_by(SchemaMigration.applied_at.desc()).first()
        return row.version if row else None
    except Exception:
        return None


def health_report(db):
    from backend.services import models as model_service
    from backend.services import providers as provider_service
    from backend.services import storage as storage_service
    from backend.models import RuntimeHealthReportResponse

    runtime = get_runtime_status()
    filesystem = storage_service.usage(db)
    providers = provider_service.list_providers(db)
    warnings = list(runtime.warnings)
    if filesystem.get("free_disk_bytes") is not None and filesystem["free_disk_bytes"] < 5 * 1024 * 1024 * 1024:
        warnings.append("Free disk space is below 5GB")
    return RuntimeHealthReportResponse(
        runtime=runtime,
        filesystem=filesystem,
        schema_version=_latest_schema_version(db),
        models=model_service.list_model_statuses(),
        providers=providers,
        warnings=warnings,
    )


def diagnostic_bundle(db) -> Path:
    from backend.database.models import TaskDiagnostic
    from backend.services import models as model_service
    from backend.services import providers as provider_service
    from backend.services import settings as settings_service

    bundle_dir = config.get_exports_dir() / "diagnostics"
    bundle_dir.mkdir(parents=True, exist_ok=True)
    path = bundle_dir / f"asrbox-diagnostics-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}.zip"
    settings = settings_service.get_settings(db)
    diagnostics = [
        {
            "task_id": row.task_id,
            "stage": row.stage,
            "error_code": row.error_code,
            "message": row.message,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in db.query(TaskDiagnostic).order_by(TaskDiagnostic.created_at.desc()).limit(50).all()
    ]
    payloads = {
        "runtime.json": get_runtime_status().model_dump(),
        "health-report.json": health_report(db).model_dump(),
        "settings.json": settings.model_dump(),
        "providers.json": [provider.model_dump() for provider in provider_service.list_providers(db)],
        "models.json": [model.model_dump() for model in model_service.list_model_statuses()],
        "recent-diagnostics.json": diagnostics,
    }
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, payload in payloads.items():
            archive.writestr(name, json.dumps(payload, ensure_ascii=False, indent=2, default=str))
    return path
