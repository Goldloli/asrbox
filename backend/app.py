from __future__ import annotations

from contextlib import asynccontextmanager
import os
from pathlib import Path
import secrets

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend import __version__, config
from backend.database import init_db
from backend.database import session as db_session
from backend.routes import register_routers
from backend.services.tasks import mark_interrupted_tasks
from backend.services.errors import ASRboxError

API_DOCUMENT_PATHS = {"/docs", "/docs/oauth2-redirect", "/redoc", "/openapi.json"}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    config.configure_model_cache_environment()
    init_db()
    _mark_interrupted_tasks()
    from backend.services import model_storage

    model_storage.recover_interrupted_relocation()
    yield


def create_app() -> FastAPI:
    frontend_dir = _frontend_directory()
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

    @app.exception_handler(ASRboxError)
    async def handle_asrbox_error(_request: Request, exc: ASRboxError):
        return JSONResponse(
            {"detail": exc.message, "error_code": exc.code, "stage": exc.stage},
            status_code=409,
        )

    @app.middleware("http")
    async def require_loopback_token(request: Request, call_next):
        if frontend_dir is not None and request.method == "GET":
            accepts_html = "text/html" in request.headers.get("accept", "")
            if accepts_html and request.url.path not in {"/health", "/health/filesystem", "/api-info", *API_DOCUMENT_PATHS}:
                from fastapi.responses import FileResponse

                return FileResponse(frontend_dir / "index.html", media_type="text/html")
        expected = os.environ.get("ASRBOX_API_TOKEN")
        requested_frontend_file = (frontend_dir / request.url.path.removeprefix("/")).resolve() if frontend_dir is not None else None
        public_frontend_path = frontend_dir is not None and (
            request.url.path == "/"
            or (
                requested_frontend_file is not None
                and requested_frontend_file.is_relative_to(frontend_dir)
                and requested_frontend_file.is_file()
            )
        )
        if not expected or request.method == "OPTIONS" or request.url.path in {"/", "/health", "/api-info"} or public_frontend_path:
            return await call_next(request)
        authorization = request.headers.get("authorization", "")
        supplied = authorization.removeprefix("Bearer ") if authorization.startswith("Bearer ") else ""
        if not supplied:
            supplied = request.query_params.get("api_token", "")
        if not supplied or not secrets.compare_digest(supplied, expected):
            return JSONResponse({"detail": "ASRbox API authentication required"}, status_code=401)
        return await call_next(request)

    register_routers(app)
    if frontend_dir is None:
        @app.get("/")
        async def root():
            return {"message": "ASRbox API", "version": __version__}

    _mount_frontend(app, frontend_dir)
    return app


def _mark_interrupted_tasks() -> None:
    from backend.services.proofreading import mark_interrupted_runs

    db = db_session.SessionLocal()
    try:
        mark_interrupted_tasks(db)
        mark_interrupted_runs(db)
    finally:
        db.close()


def _frontend_directory() -> Path | None:
    configured = os.environ.get("ASRBOX_FRONTEND_DIR")
    frontend_dir = Path(configured) if configured else Path(__file__).resolve().parent.parent / "frontend"
    frontend_dir = frontend_dir.resolve()
    if not (frontend_dir / "index.html").is_file():
        return None
    return frontend_dir


def _mount_frontend(app: FastAPI, frontend_dir: Path | None) -> None:
    if frontend_dir is None:
        return
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    assets = frontend_dir / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets)), name="frontend-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str, request: Request):
        file_path = (frontend_dir / full_path).resolve()
        if not full_path:
            return FileResponse(frontend_dir / "index.html", media_type="text/html")
        if full_path and file_path.is_file() and file_path.is_relative_to(frontend_dir):
            return FileResponse(file_path)
        if "text/html" in request.headers.get("accept", ""):
            return FileResponse(frontend_dir / "index.html", media_type="text/html")
        raise HTTPException(status_code=404, detail="Not found")


app = create_app()
