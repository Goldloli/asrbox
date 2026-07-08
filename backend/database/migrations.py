from __future__ import annotations

from pathlib import Path

from sqlalchemy import inspect, text

from backend import config
from backend.database.models import Base, SchemaMigration


def _add_columns(engine, inspector, tables: set[str], columns: list[tuple[str, str, str]]) -> None:
    with engine.begin() as conn:
        for table, column, column_type in columns:
            if table not in tables:
                continue
            existing_columns = {item["name"] for item in inspector.get_columns(table)}
            if column not in existing_columns:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}"))


def _normalize_value(value: str | None) -> str | None:
    if not value:
        return value
    stored = Path(value)
    data_dir = config.get_data_dir()
    if stored.is_absolute():
        try:
            return str(stored.resolve().relative_to(data_dir))
        except ValueError:
            return value
    parts = stored.parts
    if parts and parts[0] == data_dir.name:
        return str(Path(*parts[1:])) if len(parts) > 1 else ""
    return value


def _normalize_storage_paths(engine, tables: set[str]) -> None:
    targets = [
        ("transcription_tasks", "audio_path"),
        ("transcription_tasks", "normalized_audio_path"),
        ("transcription_chunks", "audio_path"),
    ]
    with engine.begin() as conn:
        for table, column in targets:
            if table not in tables:
                continue
            rows = conn.execute(text(f"SELECT id, {column} FROM {table} WHERE {column} IS NOT NULL")).fetchall()
            for row_id, value in rows:
                normalized = _normalize_value(value)
                if normalized != value:
                    conn.execute(text(f"UPDATE {table} SET {column} = :value WHERE id = :id"), {"value": normalized, "id": row_id})


def run_migrations(engine, session_factory) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "schema_migrations" not in tables:
        Base.metadata.tables["schema_migrations"].create(bind=engine, checkfirst=True)
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())

    migrations = [
        (
            "20260703_001_task_error_code",
            lambda: _add_columns(
                engine,
                inspector,
                tables,
                [
                    ("transcription_tasks", "error_code", "TEXT"),
                    ("transcription_chunks", "error_code", "TEXT"),
                ],
            ),
        ),
        (
            "20260703_002_batches_logs_benchmarks",
            lambda: _add_columns(engine, inspector, tables, [("transcription_tasks", "batch_id", "VARCHAR")]),
        ),
        ("20260703_003_storage_path_normalization", lambda: _normalize_storage_paths(engine, tables)),
        (
            "20260707_001_ffmpeg_paths",
            lambda: _add_columns(
                engine,
                inspector,
                tables,
                [
                    ("asr_settings", "ffmpeg_path", "TEXT"),
                    ("asr_settings", "ffprobe_path", "TEXT"),
                ],
            ),
        ),
    ]

    db = session_factory()
    try:
        applied = {row.version for row in db.query(SchemaMigration).all()}
        for version, migration in migrations:
            if version in applied:
                continue
            migration()
            db.add(SchemaMigration(version=version))
            db.commit()
        Base.metadata.create_all(bind=engine)
    finally:
        db.close()
