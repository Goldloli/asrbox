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
]


def build_args(*, cuda: bool = False, mlx: bool = False) -> list[str]:
    root = Path(__file__).resolve().parent
    args = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--name",
        "asrbox-server",
        "--onefile",
        "--clean",
        "--runtime-hook",
        str(root / "pyi_rth_numpy_torch.py"),
        "--runtime-hook",
        str(root / "pyi_rth_transformers_offline.py"),
    ]
    imports = list(BASE_HIDDEN_IMPORTS)
    if cuda:
        imports.extend(["nvidia", "torch.cuda"])
    if mlx:
        imports.append("mlx_whisper")
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
