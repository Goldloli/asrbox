#!/usr/bin/env python3
"""Build the optional Windows CUDA acceleration kit release asset.

Installs the pinned cu128 torch tree from requirements-windows-cuda.lock into a
--target directory, trims everything except the torch package itself, records a
per-file SHA-256 manifest, packs a reproducible zip, and splits it into
byte-range parts that each stay under the GitHub 2 GiB asset limit (concatenate
the parts in order to reproduce the zip; the standalone manifest records the
zip hash and every part hash). The backend downloads these parts from the
release, verifies, extracts under the data directory, and points
ASRBOX_CUDA_KIT_DIR at it (see backend/pyi_rth_cuda_kit.py).

Usage:
    python scripts/build-cuda-kit.py [--kit-version 0.1.9]
    python scripts/build-cuda-kit.py --check <kit-dir> [--manifest <manifest.json>]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_LOCK = REPO_ROOT / "requirements-windows-cuda.lock"
ZIP_NAME = "asrbox-cuda-kit-windows-x64.zip"
MANIFEST_NAME = "cuda-kit-manifest.json"
# cpp_extension build-time headers/CMake files are never used for inference.
TORCH_TRIM_DIRS = ("include", "share")
GITHUB_ASSET_LIMIT_BYTES = 2 * 1024**3


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _trim_kit(kit_root: Path) -> None:
    torch_dist_info_suffix = ".dist-info"
    for entry in kit_root.iterdir():
        if entry.name == "torch" and entry.is_dir():
            continue
        if entry.name.startswith("torch-") and entry.name.endswith(torch_dist_info_suffix):
            continue
        if entry.is_dir():
            shutil.rmtree(entry)
        else:
            entry.unlink()
    for trim_name in TORCH_TRIM_DIRS:
        target = kit_root / "torch" / trim_name
        if target.exists():
            shutil.rmtree(target)
    for cache_dir in sorted(kit_root.rglob("__pycache__")):
        shutil.rmtree(cache_dir)


def _kit_files(kit_root: Path) -> list[Path]:
    return sorted(path for path in kit_root.rglob("*") if path.is_file())


def _build_manifest(kit_root: Path, kit_version: str, torch_version: str) -> dict:
    files = []
    for path in _kit_files(kit_root):
        files.append(
            {
                "path": path.relative_to(kit_root).as_posix(),
                "size": path.stat().st_size,
                "sha256": _hash_file(path),
            }
        )
    return {
        "schema_version": 1,
        "kit_version": kit_version,
        "torch_version": torch_version,
        "python": f"{sys.version_info.major}.{sys.version_info.minor}",
        "platform": "windows-x64",
        "file_count": len(files),
        "total_bytes": sum(item["size"] for item in files),
        "files": files,
    }


def _detect_torch_version(kit_root: Path) -> str:
    dist_infos = [p.name for p in kit_root.glob("torch-*.dist-info")]
    if len(dist_infos) != 1:
        raise SystemExit(f"expected exactly one torch dist-info, found: {dist_infos}")
    return dist_infos[0][len("torch-") : -len(".dist-info")]


def _write_zip(kit_root: Path, zip_path: Path) -> None:
    fixed_date = (1980, 1, 1, 0, 0, 0)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
        for path in _kit_files(kit_root):
            info = zipfile.ZipInfo(path.relative_to(kit_root).as_posix(), date_time=fixed_date)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            with path.open("rb") as handle:
                with archive.open(info, "w", force_zip64=True) as target:
                    shutil.copyfileobj(handle, target, length=1024 * 1024)


def _split_parts(zip_path: Path, part_count: int) -> list[dict]:
    """Split the zip into byte-range parts that stay under the GitHub 2 GiB
    per-asset limit; concatenating the parts in order reproduces the zip."""
    zip_size = zip_path.stat().st_size
    chunk = (zip_size + part_count - 1) // part_count
    parts = []
    with zip_path.open("rb") as source:
        for index in range(part_count):
            part_path = zip_path.with_name(f"{zip_path.name}.part{index + 1}")
            digest = hashlib.sha256()
            written = 0
            with part_path.open("wb") as target:
                while written < chunk:
                    block = source.read(min(1024 * 1024, chunk - written))
                    if not block:
                        break
                    digest.update(block)
                    target.write(block)
                    written += len(block)
            if written == 0:
                part_path.unlink()
                break
            parts.append({"name": part_path.name, "size": written, "sha256": digest.hexdigest()})
    oversized = [part["name"] for part in parts if part["size"] > GITHUB_ASSET_LIMIT_BYTES]
    if oversized:
        raise SystemExit(f"part(s) exceed the 2 GiB GitHub asset limit, increase --parts: {oversized}")
    return parts


def _check_kit(kit_dir: Path, manifest_path: Path) -> int:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    expected = {item["path"]: item for item in manifest["files"]}
    actual = {path.relative_to(kit_dir).as_posix(): path for path in _kit_files(kit_dir)}
    actual.pop(MANIFEST_NAME, None)
    problems = []
    for rel_path in sorted(set(expected) | set(actual)):
        if rel_path not in expected:
            problems.append(f"unexpected file: {rel_path}")
            continue
        if rel_path not in actual:
            problems.append(f"missing file: {rel_path}")
            continue
        path = actual[rel_path]
        item = expected[rel_path]
        if path.stat().st_size != item["size"] or _hash_file(path) != item["sha256"]:
            problems.append(f"hash/size mismatch: {rel_path}")
    if problems:
        for problem in problems[:20]:
            print(f"CHECK FAILED: {problem}", file=sys.stderr)
        print(f"{len(problems)} problem(s)", file=sys.stderr)
        return 1
    print(f"kit matches manifest: {len(expected)} files, torch {manifest['torch_version']}")
    return 0


def _verify_parts(out_dir: Path) -> int:
    """Replay the user-facing install path: concatenate the split parts, check
    the zip hash, extract, and verify every extracted file against the
    manifest. Proves the published parts alone are sufficient."""
    manifest_path = out_dir / MANIFEST_NAME
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    parts = manifest.get("parts")
    if not parts:
        print("CHECK FAILED: manifest has no parts", file=sys.stderr)
        return 1
    with tempfile.TemporaryDirectory(prefix="cuda-kit-verify-", dir=out_dir) as work:
        zip_path = Path(work) / manifest["zip_name"]
        digest = hashlib.sha256()
        with zip_path.open("wb") as target:
            for part in parts:
                part_path = out_dir / part["name"]
                if not part_path.is_file():
                    print(f"CHECK FAILED: missing part {part['name']}", file=sys.stderr)
                    return 1
                part_digest = hashlib.sha256()
                with part_path.open("rb") as source:
                    while True:
                        block = source.read(1024 * 1024)
                        if not block:
                            break
                        part_digest.update(block)
                        digest.update(block)
                        target.write(block)
                if part_path.stat().st_size != part["size"] or part_digest.hexdigest() != part["sha256"]:
                    print(f"CHECK FAILED: part hash/size mismatch: {part['name']}", file=sys.stderr)
                    return 1
        if zip_path.stat().st_size != manifest["zip_size"] or digest.hexdigest() != manifest["zip_sha256"]:
            print("CHECK FAILED: zip hash/size mismatch after concatenating parts", file=sys.stderr)
            return 1
        print("parts concatenated: zip sha256 ok")
        kit_dir = Path(work) / "kit"
        with zipfile.ZipFile(zip_path) as archive:
            archive.extractall(kit_dir)
        return _check_kit(kit_dir, manifest_path)


def build(args: argparse.Namespace) -> int:
    lock = Path(args.lock)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    work_parent = Path(args.work_dir) if args.work_dir else None
    if work_parent:
        work_parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="cuda-kit-", dir=work_parent) as work:
        kit_root = Path(work) / "kit-root"
        print(f"installing kit from {lock} ...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--target", str(kit_root), "-r", str(lock)],
            check=True,
        )
        _trim_kit(kit_root)
        torch_version = _detect_torch_version(kit_root)
        print(f"trimmed kit: torch {torch_version}, hashing files ...")
        manifest = _build_manifest(kit_root, args.kit_version, torch_version)
        zip_path = out_dir / ZIP_NAME
        manifest_path = out_dir / MANIFEST_NAME
        print(f"packing {zip_path} ...")
        _write_zip(kit_root, zip_path)
        print("splitting parts ...")
        parts = _split_parts(zip_path, args.parts)
        manifest.update(
            {
                "zip_name": zip_path.name,
                "zip_size": zip_path.stat().st_size,
                "zip_sha256": _hash_file(zip_path),
                "parts": parts,
            }
        )
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        if not args.keep_zip:
            zip_path.unlink()
        raw_gib = manifest["total_bytes"] / 1024**3
        zip_gib = manifest["zip_size"] / 1024**3
        parts_summary = ", ".join(f"{part['name']} {part['size'] / 1024**3:.2f} GiB" for part in parts)
        print(f"kit: {manifest['file_count']} files, raw {raw_gib:.2f} GiB, zip {zip_gib:.2f} GiB")
        print(f"parts: {parts_summary}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lock", default=str(DEFAULT_LOCK))
    parser.add_argument("--out-dir", default=str(REPO_ROOT / "dist" / "cuda-kit"))
    parser.add_argument("--work-dir", default=None, help="parent directory for the temporary build tree")
    parser.add_argument("--kit-version", default="dev")
    parser.add_argument("--parts", type=int, default=2, help="byte-range part count for the zip (each part must stay under 2 GiB)")
    parser.add_argument("--keep-zip", action="store_true", help="keep the unsplit zip next to the parts")
    parser.add_argument("--check", metavar="KIT_DIR", default=None, help="verify an extracted kit against its manifest")
    parser.add_argument("--verify-parts", action="store_true", help="replay the install path from the published parts (concat, zip hash, extract, per-file check)")
    parser.add_argument("--manifest", default=None, help="manifest path for --check (defaults to <out-dir>/cuda-kit-manifest.json)")
    args = parser.parse_args()
    if args.check:
        manifest = Path(args.manifest) if args.manifest else Path(args.out_dir) / MANIFEST_NAME
        return _check_kit(Path(args.check), manifest)
    if args.verify_parts:
        return _verify_parts(Path(args.out_dir))
    return build(args)


if __name__ == "__main__":
    raise SystemExit(main())
