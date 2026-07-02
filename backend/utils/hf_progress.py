from __future__ import annotations

import sys
import threading
from contextlib import contextmanager
from typing import Callable, Iterator


ProgressCallback = Callable[[int, int, str | None], None]


class HFProgressTracker:
    def __init__(self, progress_callback: ProgressCallback) -> None:
        self.progress_callback = progress_callback
        self._lock = threading.Lock()
        self._originals: list[tuple[object, str, object]] = []
        self._file_sizes: dict[str, int] = {}
        self._file_downloaded: dict[str, int] = {}

    def _tracked_tqdm(self, original_tqdm):
        tracker = self

        class TrackedTqdm(original_tqdm):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                desc = str(getattr(self, "desc", "") or kwargs.get("desc", "") or "")
                self._asrbox_filename = desc.split(":")[0].strip() or "download"

            def update(self, n=1):
                result = super().update(n)
                filename = self._asrbox_filename
                current = int(getattr(self, "n", 0) or 0)
                total = int(getattr(self, "total", 0) or 0)
                if total <= 0 or "fetching" in filename.lower():
                    return result

                with tracker._lock:
                    tracker._file_sizes[filename] = total
                    tracker._file_downloaded[filename] = current
                    total_size = sum(tracker._file_sizes.values())
                    total_done = sum(tracker._file_downloaded.values())

                if total_size >= 1_000_000:
                    tracker.progress_callback(total_done, total_size, filename)
                return result

        return TrackedTqdm

    @contextmanager
    def patch_download(self) -> Iterator[None]:
        try:
            import tqdm as tqdm_module

            original_tqdm = tqdm_module.tqdm
            tracked = self._tracked_tqdm(original_tqdm)
            tqdm_module.tqdm = tracked
            self._originals.append((tqdm_module, "tqdm", original_tqdm))

            if hasattr(tqdm_module, "auto") and hasattr(tqdm_module.auto, "tqdm"):
                original_auto = tqdm_module.auto.tqdm
                tqdm_module.auto.tqdm = tracked
                self._originals.append((tqdm_module.auto, "tqdm", original_auto))

            for module_name, module in list(sys.modules.items()):
                if "huggingface" not in module_name and not module_name.startswith("tqdm"):
                    continue
                for attr_name in ("tqdm", "base_tqdm"):
                    if not hasattr(module, attr_name):
                        continue
                    attr = getattr(module, attr_name)
                    if attr is original_tqdm:
                        setattr(module, attr_name, tracked)
                        self._originals.append((module, attr_name, attr))
            yield
        except ImportError:
            yield
        finally:
            for module, attr_name, original in reversed(self._originals):
                try:
                    setattr(module, attr_name, original)
                except (AttributeError, TypeError):
                    pass
            self._originals.clear()


@contextmanager
def track_hf_download(model_name: str, progress_manager) -> Iterator[None]:
    def callback(current: int, total: int, filename: str | None) -> None:
        progress_manager.update_progress(
            model_name,
            current,
            total,
            filename=filename,
            status="downloading",
        )

    tracker = HFProgressTracker(callback)
    with tracker.patch_download():
        yield
