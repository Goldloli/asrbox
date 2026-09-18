"""Pre-import funasr submodules in the frozen binary.

funasr builds its model registry by walking package paths with
pkgutil.walk_packages at import time. PyInstaller's frozen importer exposes
nothing to that walk, so the registry stays empty and every FunASR model fails
to load. Import each submodule recorded in funasr-modules.json (generated at
build time) so the registration decorators run here as well.
"""

from __future__ import annotations

import importlib
import builtins
import json
import os
import sys

_PRELOAD_COMPLETE = False


def _preload_funasr_submodules() -> None:
    global _PRELOAD_COMPLETE
    if _PRELOAD_COMPLETE:
        return
    meipass = getattr(sys, "_MEIPASS", None)
    if not meipass:
        return
    manifest_path = os.path.join(meipass, "funasr-modules.json")
    try:
        with open(manifest_path, encoding="utf-8") as handle:
            names = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return
    _patch_inspect_for_frozen_registry()
    debug = os.environ.get("FUNASR_IMPORT_DEBUG") == "1"
    for name in names:
        try:
            importlib.import_module(name)
        except Exception as exc:  # noqa: BLE001 - optional backends may fail; funasr records those itself
            if debug:
                print(f"funasr preload failed: {name}: {exc.__class__.__name__}: {exc}", file=sys.stderr)
            continue
    _PRELOAD_COMPLETE = True


def _patch_inspect_for_frozen_registry() -> None:
    """funasr's register decorator calls inspect.getsourcelines for metadata;
    frozen modules have no source files, so stub the fallback instead of
    letting the decorator abort every model-class import."""
    import inspect

    original = inspect.getsourcelines

    def safe_getsourcelines(obj: object) -> tuple[list[str], int]:
        try:
            return original(obj)
        except (OSError, TypeError):
            return (["# frozen module\n"], 0)

    inspect.getsourcelines = safe_getsourcelines


# Importing every FunASR registration module can take minutes in a frozen
# build. Expose the loader to the application and run it only when a FunASR
# model is actually selected, so the desktop health endpoint starts promptly.
setattr(builtins, "_asrbox_preload_funasr_submodules", _preload_funasr_submodules)
