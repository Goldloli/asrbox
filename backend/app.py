from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend import __version__
from backend.database import init_db
from backend.database import session as db_session
from backend.routes import register_routers
from backend.services.tasks import mark_interrupted_tasks


def create_app() -> FastAPI:
    init_db()
    _mark_interrupted_tasks()
    app = FastAPI(
        title="ASRbox API",
        description="Web-first ASR model and provider workspace",
        version=__version__,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:17494",
            "http://127.0.0.1:17494",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_routers(app)
    _mount_frontend(app)
    return app


def _mark_interrupted_tasks() -> None:
    db = db_session.SessionLocal()
    try:
        mark_interrupted_tasks(db)
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
