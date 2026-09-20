from __future__ import annotations

import os

# Keeps frozen startup imports cheap. Inference must not inherit this pin:
# the local transcription worker spawns with its own OMP_NUM_THREADS
# (backend/services/tasks.py::_local_worker_environment), because CPU engines
# such as CTranslate2 otherwise run single-threaded.
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
