from __future__ import annotations

from fastapi import FastAPI


def register_routers(app: FastAPI) -> None:
    from backend.routes.health import router as health_router
    from backend.routes.auth import router as auth_router
    from backend.routes.batches import router as batches_router
    from backend.routes.events import router as events_router
    from backend.routes.diagnostics import router as diagnostics_router
    from backend.routes.models import router as models_router
    from backend.routes.llm_providers import router as llm_providers_router
    from backend.routes.proofreading import router as proofreading_router
    from backend.routes.providers import router as providers_router
    from backend.routes.runtime import router as runtime_router
    from backend.routes.settings import router as settings_router
    from backend.routes.storage import router as storage_router
    from backend.routes.tasks import router as tasks_router
    from backend.routes.transcriptions import router as transcriptions_router
    from backend.mcp_server import mount_mcp

    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(batches_router)
    app.include_router(events_router)
    app.include_router(diagnostics_router)
    app.include_router(models_router)
    app.include_router(llm_providers_router)
    app.include_router(providers_router)
    app.include_router(proofreading_router)
    app.include_router(runtime_router)
    app.include_router(settings_router)
    app.include_router(storage_router)
    app.include_router(tasks_router)
    app.include_router(transcriptions_router)
    mount_mcp(app)
