from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import config
from backend.database.models import ASRProvider, Base

engine = None
SessionLocal = None


def init_db() -> None:
    global engine, SessionLocal
    db_path = config.get_db_path()
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    seed_builtin_providers()


def get_db():
    if SessionLocal is None:
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
        db.commit()
    finally:
        db.close()

