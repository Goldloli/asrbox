## Why

Cancelling a running local transcription currently changes only the database state while the in-process model call continues occupying the sole local worker. Subsequent tasks remain queued, the main transcription page has no stop action, and synthetic progress stalls at 88%, making a slow CPU inference look deadlocked.

The main CI workflow also uses a startup-recovery timeout that is too short for a cold macOS runner, causing the validated Docker release commit to fail after all functional Docker checks pass.

## What Changes

- Run each local transcription inference in a supervised child process that can be terminated when its task is cancelled.
- Keep queued work moving after cancellation and prevent cancelled results from being persisted.
- Replace synthetic 60-88% ticking with progress based on completed audio chunks.
- Split local media into bounded chunks so progress advances during normal transcription and cancellation does not wait for an entire long recording.
- Add a visible, confirmed stop action to active tasks on the transcription workspace as well as the task workbench.
- Select Apple MPS for compatible Transformers Whisper inference instead of always forcing CPU, while retaining supported CPU/CUDA fallbacks.
- Make the backend cold-start CI test tolerate slow runners while still failing on process exit or an actual startup timeout.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `transcription-lifecycle`: Running local tasks become genuinely cancellable, queued tasks continue after cancellation, and displayed progress reflects completed work rather than elapsed synthetic ticks.
- `frontend-quality`: Active transcription controls remain available in the primary transcription workflow with clear pending and confirmation states.
- `release-readiness`: Backend process startup checks use a bounded cold-start budget appropriate for maintained CI runners.

## Impact

Affected areas include the local transcription worker lifecycle, task progress and cancellation services, backend server worker mode, Transformers device selection, transcription workspace controls, focused backend/frontend tests, and the macOS CI startup-recovery test. The maintained task cancellation endpoint remains unchanged; no database migration or new dependency is required.
