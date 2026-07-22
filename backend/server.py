from __future__ import annotations

import argparse
import multiprocessing
import os
import signal
import sys
import threading
import time
from pathlib import Path

import uvicorn

from backend import __version__
from backend import config


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _start_parent_watchdog(parent_pid: int | None, sentinel: Path | None) -> None:
    if not parent_pid:
        return

    def watch() -> None:
        while True:
            if sentinel and sentinel.exists():
                time.sleep(1)
                continue
            if not _pid_alive(parent_pid):
                os.kill(os.getpid(), signal.SIGTERM)
                return
            time.sleep(2)

    threading.Thread(target=watch, daemon=True).start()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the ASRbox backend server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=config.DEFAULT_PORT)
    parser.add_argument("--data-dir", default=None)
    parser.add_argument("--parent-pid", type=int, default=None)
    parser.add_argument("--keep-running-sentinel", default=None)
    parser.add_argument("--local-worker-request", default=None)
    parser.add_argument("--local-worker-result", default=None)
    parser.add_argument("--runtime-check", choices=["mlx"], default=None)
    parser.add_argument("--version", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    multiprocessing.freeze_support()
    args = parse_args(argv)
    if args.version:
        print(__version__)
        return
    if args.runtime_check == "mlx":
        from backend.services.platform import mlx_runtime_import_error

        error = mlx_runtime_import_error()
        if error:
            print(error, file=sys.stderr)
            raise SystemExit(1)
        print("MLX runtime available")
        return
    if args.data_dir:
        os.environ["ASRBOX_DATA_DIR"] = str(Path(args.data_dir).expanduser().resolve())
    os.environ["HF_HUB_DISABLE_XET"] = "1"
    sentinel = Path(args.keep_running_sentinel).expanduser().resolve() if args.keep_running_sentinel else None
    _start_parent_watchdog(args.parent_pid, sentinel)
    if args.local_worker_request or args.local_worker_result:
        if not args.local_worker_request or not args.local_worker_result:
            parser_error = "--local-worker-request and --local-worker-result must be used together"
            raise SystemExit(parser_error)
        from backend.services.local_task_worker import run_local_task_worker

        raise SystemExit(run_local_task_worker(args.local_worker_request, args.local_worker_result))
    uvicorn.run("backend.app:app", host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main(sys.argv[1:])
