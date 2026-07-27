from __future__ import annotations

import threading


# Task lifecycle mutations are process-local today. Keep their check-and-claim
# sections on one shared lock so adjacent services cannot bypass each other.
task_transition_lock = threading.RLock()
