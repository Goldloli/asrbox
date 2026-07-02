from __future__ import annotations

from fastapi import FastAPI


def register_routers(app: FastAPI) -> None:
    from backend.routes.health import router as health_router
    from backend.routes.models import router as models_router
    from backend.routes.providers import router as providers_router
    from backend.routes.settings import router as settings_router
    from backend.routes.tasks import router as tasks_router
    from backend.routes.transcriptions import router as transcriptions_router

    app.include_router(health_router)
    app.include_router(models_router)
    app.include_router(providers_router)
    app.include_router(settings_router)
    app.include_router(tasks_router)
    app.include_router(transcriptions_router)

