"""Redirect torch imports to an optional CUDA acceleration kit.

The frozen binary ships a CPU-only torch. On Windows, users can install a
separate CUDA kit (torch cu128 wheel tree) into the data directory and enable
it via the settings switch, which sets ASRBOX_CUDA_KIT_DIR for the backend
process. This hook runs before pyi_rth_funasr pre-imports funasr (and with it
torch), so the redirection must happen here: afterwards torch is already in
sys.modules and any later sys.path change is a no-op. The embedded PYZ also
contains a copy of torch that PyiFrozenImporter resolves ahead of sys.path,
so a meta path finder is required to send torch.* imports to the kit.
"""

from __future__ import annotations

import importlib.machinery
import os
import sys


def _install_cuda_kit_finder() -> None:
    kit_dir = os.environ.get("ASRBOX_CUDA_KIT_DIR", "").strip()
    if not kit_dir:
        return
    torch_pkg = os.path.join(kit_dir, "torch")
    if not os.path.isfile(os.path.join(torch_pkg, "__init__.py")):
        print(f"ASRBOX_CUDA_KIT_DIR ignored (no torch package found): {kit_dir}", file=sys.stderr)
        return
    sys.path.insert(0, kit_dir)

    class _CudaKitFinder:
        @staticmethod
        def find_spec(fullname: str, path: object = None, target: object = None):
            if fullname.split(".", 1)[0] != "torch":
                return None
            return importlib.machinery.PathFinder.find_spec(fullname, path)

    sys.meta_path.insert(0, _CudaKitFinder)
    torch_lib = os.path.join(torch_pkg, "lib")
    if sys.platform == "win32" and os.path.isdir(torch_lib):
        os.add_dll_directory(torch_lib)
    print(f"CUDA acceleration kit active: {kit_dir}", file=sys.stderr)


_install_cuda_kit_finder()
