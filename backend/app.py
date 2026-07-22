from __future__ import annotations

from contextlib import asynccontextmanager
import os
from pathlib import Path
import secrets

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend import __version__
from backend.database import init_db
from backend.database import session as db_session
from backend.routes import register_routers
from backend.services.tasks import mark_interrupted_tasks


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    _mark_interrupted_tasks()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="ASRbox API",
        description="Web-first ASR model and provider workspace",
        version=__version__,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:17494",
            "http://127.0.0.1:17494",
            "http://tauri.localhost",
            "https://tauri.localhost",
            "tauri://localhost",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def require_loopback_token(request: Request, call_next):
        expected = os.environ.get("ASRBOX_API_TOKEN")
        if not expected or request.method == "OPTIONS" or request.url.path in {"/", "/health"}:
            return await call_next(request)
        authorization = request.headers.get("authorization", "")
        supplied = authorization.removeprefix("Bearer ") if authorization.startswith("Bearer ") else ""
        if not supplied:
            supplied = request.query_params.get("api_token", "")
        if not supplied or not secrets.compare_digest(supplied, expected):
            return JSONResponse({"detail": "ASRbox API authentication required"}, status_code=401)
        return await call_next(request)

    register_routers(app)
    _mount_frontend(app)
    return app


def _mark_interrupted_tasks() -> None:
    from backend.services.proofreading import mark_interrupted_runs

    db = db_session.SessionLocal()
    try:
        mark_interrupted_tasks(db)
        mark_interrupted_runs(db)
    finally:
        db.close()


def _mount_frontend(app: FastAPI) -> None:
    frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
    if not frontend_dir.is_dir():
        return
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    assets = frontend_dir / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets)), name="frontend-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = (frontend_dir / full_path).resolve()
        if full_path and file_path.is_file() and file_path.is_relative_to(frontend_dir):
            return FileResponse(file_path)
        return FileResponse(frontend_dir / "index.html", media_type="text/html")


app = create_app()
