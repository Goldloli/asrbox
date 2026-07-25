from __future__ import annotations

import json
import hashlib
import shutil
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from backend import config
from backend.database.models import ASRProvider, ASRSettings, TaskDiagnostic, TranscriptVersion, TranscriptionChunk, TranscriptionTask

MAX_RESTORE_FILES = 5000
MAX_RESTORE_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024


def _directory_size(path: Path) -> int:
    total = 0
    if not path.exists():
        return total
    for item in path.rglob("*"):
        try:
            if item.is_file():
                total += item.stat().st_size
        except OSError:
            continue
    return total


def _mb(value: int) -> float:
    return round(value / (1024 * 1024), 2)


def usage(db: Session) -> dict[str, Any]:
    uploads_dir = config.get_uploads_dir()
    exports_dir = config.get_exports_dir()
    models_dir = config.get_models_dir()
    uploads = _directory_size(uploads_dir)
    exports = _directory_size(exports_dir)
    models = _directory_size(models_dir)
    normalized = 0
    chunks = 0
    for row in db.query(TranscriptionTask).all():
        source = config.resolve_storage_path(row.audio_path)
        normalized_path = config.resolve_storage_path(row.normalized_audio_path)
        if normalized_path and normalized_path.exists() and normalized_path != source:
            normalized += normalized_path.stat().st_size
    for row in db.query(TranscriptionChunk).all():
        path = config.resolve_storage_path(row.audio_path)
        if path and path.exists():
            chunks += path.stat().st_size
    try:
        free_disk_bytes = shutil.disk_usage(config.get_data_dir()).free
    except OSError:
        free_disk_bytes = None
    total = uploads + exports + models
    return {
        "uploads_mb": _mb(uploads),
        "normalized_mb": _mb(normalized),
        "chunks_mb": _mb(chunks),
        "exports_mb": _mb(exports),
        "models_mb": _mb(models),
        "diagnostics_count": db.query(TaskDiagnostic).count(),
        "transcript_versions_count": db.query(TranscriptVersion).count(),
        "total_mb": _mb(total),
        "free_disk_bytes": free_disk_bytes,
    }


def cleanup(db: Session, *, delete_normalized: bool, delete_chunks: bool, delete_orphans: bool, delete_old_diagnostics: bool, dry_run: bool = False) -> dict[str, Any]:
    removed: list[str] = []
    errors: list[str] = []
    freed = 0

    def remove_file(path: Path) -> None:
        nonlocal freed
        try:
            if path.exists() and path.is_file():
                freed += path.stat().st_size
                if not dry_run:
                    path.unlink()
                removed.append(str(path))
        except OSError as exc:
            errors.append(f"{path}: {exc}")

    if delete_normalized:
        for row in db.query(TranscriptionTask).filter(TranscriptionTask.status.in_(("completed", "failed", "cancelled", "interrupted"))).all():
            source = config.resolve_storage_path(row.audio_path)
            normalized_path = config.resolve_storage_path(row.normalized_audio_path)
            if normalized_path and normalized_path != source:
                remove_file(normalized_path)
                if not dry_run:
                    row.normalized_audio_path = None

    if delete_chunks:
        for chunk in db.query(TranscriptionChunk).all():
            path = config.resolve_storage_path(chunk.audio_path)
            if path:
                remove_file(path)
        if not dry_run:
            db.query(TranscriptionChunk).delete()

    if delete_orphans:
        referenced = {config.resolve_storage_path(row.audio_path) for row in db.query(TranscriptionTask).all()}
        referenced.update(config.resolve_storage_path(row.normalized_audio_path) for row in db.query(TranscriptionTask).all())
        referenced.discard(None)
        for directory in {config.get_uploads_dir(), config.get_derived_audio_dir()}:
            for path in directory.glob("*.wav"):
                if path not in referenced:
                    remove_file(path)

    if delete_old_diagnostics:
        if not dry_run:
            db.query(TaskDiagnostic).delete()

    if not dry_run:
        db.commit()
    return {"removed": removed, "errors": errors, "freed_mb": _mb(freed)}


def backup(db: Session, *, include_uploads: bool, include_exports: bool) -> dict[str, Any]:
    backup_dir = config.get_data_dir() / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now(UTC)
    path = backup_dir / f"asrbox-backup-{now.strftime('%Y%m%d-%H%M%S')}.zip"
    files: list[dict[str, Any]] = []

    def sha256_file(source: Path) -> str:
        digest = hashlib.sha256()
        with source.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def add_file(archive: zipfile.ZipFile, source: Path, arcname: str) -> None:
        archive.write(source, arcname)
        files.append(
            {
                "path": arcname,
                "size": source.stat().st_size,
                "sha256": sha256_file(source),
            }
        )

    manifest = {
        "name": "asrbox-backup",
        "schema_version": "1",
        "created_at": now.isoformat(),
        "include_uploads": include_uploads,
        "include_exports": include_exports,
        "counts": {
            "settings": db.query(ASRSettings).count(),
            "providers": db.query(ASRProvider).count(),
            "tasks": db.query(TranscriptionTask).count(),
            "versions": db.query(TranscriptVersion).count(),
        },
        "files": files,
    }
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        db_path = config.get_db_path()
        if db_path.exists():
            add_file(archive, db_path, "asrbox.db")
        if include_uploads:
            for item in config.get_uploads_dir().rglob("*"):
                if item.is_file():
                    add_file(archive, item, str(Path("uploads") / item.relative_to(config.get_uploads_dir())))
        if include_exports:
            for item in config.get_exports_dir().rglob("*"):
                if item.is_file():
                    add_file(archive, item, str(Path("exports") / item.relative_to(config.get_exports_dir())))
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        archive.writestr("metadata.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    return {
        "path": str(path),
        "included_uploads": include_uploads,
        "included_exports": include_exports,
        "size_mb": _mb(path.stat().st_size),
    }


def restore(backup_path: str) -> dict[str, Any]:
    source = Path(backup_path).expanduser()
    if not source.exists():
        raise ValueError(f"Backup file not found: {backup_path}")
    restore_dir = config.get_data_dir() / "restore-pending"
    if restore_dir.exists():
        shutil.rmtree(restore_dir)
    restore_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as archive:
        manifest = _read_manifest(archive)
        _safe_extract(archive, restore_dir, manifest)
    pending_db = restore_dir / "asrbox.db"
    if not pending_db.exists():
        raise ValueError("Backup does not contain asrbox.db")
    return {
        "message": "Backup extracted. Stop the server before replacing the active database.",
        "restore_dir": str(restore_dir),
        "pending_db": str(pending_db),
        "manifest": manifest,
    }


def _read_manifest(archive: zipfile.ZipFile) -> dict[str, Any]:
    try:
        manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
    except KeyError as exc:
        raise ValueError("Backup does not contain manifest.json") from exc
    except json.JSONDecodeError as exc:
        raise ValueError("Backup manifest is not valid JSON") from exc
    if manifest.get("name") != "asrbox-backup":
        raise ValueError("Backup manifest is not for ASRbox")
    if not manifest.get("schema_version"):
        raise ValueError("Backup manifest missing schema_version")
    return manifest


def _zip_sha256(archive: zipfile.ZipFile, name: str) -> str:
    digest = hashlib.sha256()
    with archive.open(name) as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_extract(archive: zipfile.ZipFile, destination: Path, manifest: dict[str, Any]) -> None:
    infos = archive.infolist()
    if len(infos) > MAX_RESTORE_FILES:
        raise ValueError("Backup contains too many files")
    total_size = sum(info.file_size for info in infos)
    if total_size > MAX_RESTORE_UNCOMPRESSED_BYTES:
        raise ValueError("Backup is too large to restore safely")
    expected_files = {
        str(item.get("path")): item
        for item in manifest.get("files", [])
        if isinstance(item, dict) and item.get("path")
    }
    allowed_extra = {"manifest.json", "metadata.json"}
    member_names = {info.filename for info in infos if not info.is_dir()}
    unknown = member_names - set(expected_files) - allowed_extra
    if unknown:
        raise ValueError(f"Backup contains files not listed in manifest: {sorted(unknown)[0]}")
    missing = set(expected_files) - member_names
    if missing:
        raise ValueError(f"Backup is missing manifest file entry: {sorted(missing)[0]}")
    for name, expected in expected_files.items():
        info = archive.getinfo(name)
        if int(expected.get("size", -1)) != info.file_size:
            raise ValueError(f"Backup file size mismatch: {name}")
        if expected.get("sha256") and _zip_sha256(archive, name) != expected["sha256"]:
            raise ValueError(f"Backup file checksum mismatch: {name}")
    destination = destination.resolve()
    for info in infos:
        member_path = Path(info.filename)
        if member_path.is_absolute() or ".." in member_path.parts:
            raise ValueError(f"Unsafe backup member path: {info.filename}")
        target = (destination / member_path).resolve()
        if destination not in target.parents and target != destination:
            raise ValueError(f"Unsafe backup member path: {info.filename}")
    archive.extractall(destination)
