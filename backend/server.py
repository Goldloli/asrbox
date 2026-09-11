from __future__ import annotations

import argparse
import json
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
    if os.name == "nt":
        # os.kill(pid, 0) is not a liveness probe on Windows (WinError 87);
        # query the process handle instead.
        import ctypes

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        handle = kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not handle:
            return ctypes.get_last_error() == 5  # ERROR_ACCESS_DENIED means it exists
        try:
            code = ctypes.c_ulong()
            if not kernel32.GetExitCodeProcess(handle, ctypes.byref(code)):
                return True
            return code.value == 259  # STILL_ACTIVE
        finally:
            kernel32.CloseHandle(handle)
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


def _maybe_inject_cuda_kit() -> None:
    # Frozen builds are handled earlier by the pyi_rth_cuda_kit runtime hook
    # (it must run before the funasr preload imports torch); this covers the
    # unfrozen/dev entrypoint only.
    if getattr(sys, "frozen", False):
        return
    kit_dir = os.environ.get("ASRBOX_CUDA_KIT_DIR", "").strip()
    if not kit_dir:
        return
    path = Path(kit_dir)
    torch_pkg = path / "torch"
    if not (torch_pkg / "__init__.py").is_file():
        print(f"ASRBOX_CUDA_KIT_DIR ignored (no torch package found): {path}", file=sys.stderr)
        return
    sys.path.insert(0, str(path))
    torch_lib = torch_pkg / "lib"
    if sys.platform == "win32" and torch_lib.is_dir():
        os.add_dll_directory(str(torch_lib))
    print(f"CUDA acceleration kit active: {path}", file=sys.stderr)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the ASRbox backend server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=config.DEFAULT_PORT)
    parser.add_argument("--data-dir", default=None)
    parser.add_argument("--parent-pid", type=int, default=None)
    parser.add_argument("--keep-running-sentinel", default=None)
    parser.add_argument("--local-worker-request", default=None)
    parser.add_argument("--local-worker-result", default=None)
    parser.add_argument("--runtime-check", choices=["mlx", "all"], default=None)
    parser.add_argument("--version", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    multiprocessing.freeze_support()
    _maybe_inject_cuda_kit()
    args = parse_args(argv)
    if args.version:
        print(__version__)
        return
    if args.runtime_check:
        os.environ["ASRBOX_RUNTIME_PROBE_CHILD"] = "1"
        from backend.services.platform import detect_runtime_in_process, mlx_runtime_import_error

        if args.runtime_check == "mlx":
            error = mlx_runtime_import_error()
            if error:
                print(error, file=sys.stderr)
                raise SystemExit(1)
            print("MLX runtime available")
            return
        print(json.dumps(detect_runtime_in_process(), ensure_ascii=False))
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
