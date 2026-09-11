from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import config
from backend.database.migrations import run_migrations
from backend.database.models import ASRProvider, Base

engine = None
SessionLocal = None
_current_db_path = None


def init_db() -> None:
    global engine, SessionLocal, _current_db_path
    db_path = config.get_db_path()
    if engine is not None and _current_db_path == db_path:
        return
    if engine is not None:
        engine.dispose()
    engine = create_engine(
        f"sqlite:///{db_path}",
        # SQLite 默认 busy_timeout=0，API 线程与转写 worker 并发写时会直接
        # 报 database is locked；这里给足等待时间，让写者串行完成。
        connect_args={"check_same_thread": False, "timeout": 30},
    )
    _current_db_path = db_path
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    run_migrations(engine, SessionLocal)
    seed_builtin_providers()


def get_db():
    init_db()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def seed_builtin_providers() -> None:
    db = SessionLocal()
    try:
        existing = {row.provider_type for row in db.query(ASRProvider).all()}
        if "bcut" not in existing:
            db.add(
                ASRProvider(
                    id="bcut",
                    name="必剪免费接口",
                    provider_type="bcut",
                    enabled=True,
                    default_model="bcut-free",
                    options_json='{"experimental": true, "free": true}',
                )
            )
        if "aliyun" not in existing:
            db.add(
                ASRProvider(
                    id="aliyun",
                    name="阿里云 ASR",
                    provider_type="aliyun",
                    enabled=False,
                    default_model="paraformer-v2",
                    options_json="{}",
                )
            )
        if "openai_compatible" not in existing:
            db.add(
                ASRProvider(
                    id="openai-compatible",
                    name="OpenAI-compatible ASR",
                    provider_type="openai_compatible",
                    enabled=False,
                    default_model="whisper-1",
                    options_json="{}",
                )
            )
        if "generic_http" not in existing:
            db.add(
                ASRProvider(
                    id="generic-http",
                    name="Generic HTTP ASR",
                    provider_type="generic_http",
                    enabled=False,
                    options_json="{}",
                )
            )
        db.commit()
    finally:
        db.close()


def run_lightweight_migrations() -> None:
    run_migrations(engine, SessionLocal)
