from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


BASE_HIDDEN_IMPORTS = [
    "backend.app",
    "backend.server",
    "fastapi",
    "uvicorn",
    "sqlalchemy",
    "huggingface_hub",
    "tqdm",
    "transformers",
    "accelerate",
    "torch",
    "faster_whisper",
    "ctranslate2",
    "funasr",
    "modelscope",
    "transformers.models.auto.processing_auto",
    "transformers.models.auto.modeling_auto",
    "transformers.models.qwen3_asr",
    "transformers.models.qwen3_asr.configuration_qwen3_asr",
    "transformers.models.qwen3_asr.feature_extraction_qwen3_asr",
    "transformers.models.qwen3_asr.modeling_qwen3_asr",
    "transformers.models.qwen3_asr.processing_qwen3_asr",
    "moss_transcribe_diarize",
    "moss_transcribe_diarize.inference_utils",
    "moss_transcribe_diarize.transcript_parser",
]


def _write_funasr_module_manifest(build_root: Path) -> Path:
    """Record every funasr submodule for the frozen runtime hook.

    funasr populates its model registry by walking package paths at import time,
    which sees nothing under PyInstaller. The runtime hook pre-imports the modules
    listed here so the registry decorators run in the frozen binary as well.
    """
    import funasr
    import pkgutil

    names = sorted(name for _, name, _ in pkgutil.walk_packages(funasr.__path__, "funasr."))
    manifest = build_root / "funasr-modules.json"
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(names), encoding="utf-8")
    return manifest


def build_args(*, cuda: bool = False, mlx: bool = False) -> list[str]:
    root = Path(__file__).resolve().parent
    funasr_manifest = _write_funasr_module_manifest(root.parent / "build")
    knowledge_file = root / "data" / "chat_knowledge.json"
    if not knowledge_file.is_file():
        raise SystemExit(f"chat knowledge file is missing: {knowledge_file}")
    args = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--name",
        "asrbox-server",
        "--onedir",
        "--noconfirm",
        "--clean",
        "--collect-data",
        "funasr",
        "--collect-submodules",
        "funasr",
        "--add-data",
        f"{funasr_manifest}:.",
        "--add-data",
        f"{knowledge_file}:backend/data",
        "--exclude-module",
        "torchcodec",
        "--runtime-hook",
        str(root / "pyi_rth_numpy_torch.py"),
        "--runtime-hook",
        str(root / "pyi_rth_transformers_offline.py"),
        "--runtime-hook",
        str(root / "pyi_rth_funasr.py"),
    ]
    imports = list(BASE_HIDDEN_IMPORTS)
    if cuda:
        imports.extend(["nvidia", "torch.cuda"])
    if mlx:
        imports.extend(["mlx._reprlib_fix", "mlx.core", "mlx.nn", "mlx_whisper"])
        args.extend(
            [
                "--collect-binaries",
                "mlx",
                "--collect-data",
                "mlx",
                "--collect-data",
                "mlx_whisper",
            ]
        )
    for name in imports:
        args.extend(["--hidden-import", name])
    args.append(str(root / "server.py"))
    return args


def main() -> None:
    parser = argparse.ArgumentParser(description="Build ASRbox backend binary with PyInstaller")
    parser.add_argument("--cuda", action="store_true")
    parser.add_argument("--mlx", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    command = build_args(cuda=args.cuda, mlx=args.mlx)
    if args.dry_run:
        print(json.dumps({"command": command}, indent=2))
        return
    subprocess.run(command, check=True)


if __name__ == "__main__":
    main()
