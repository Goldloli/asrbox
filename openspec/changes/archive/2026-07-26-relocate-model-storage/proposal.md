## Why

ASRbox currently fixes managed models under the application data directory and treats a missing model directory as an empty one. Users cannot relocate large model and framework-cache data safely, and a disconnected external disk can therefore be misreported as models not being downloaded, risking an unintended download to the system disk.

## What Changes

- Add a model storage section under Settings > Storage and diagnostics that reports the effective full path, availability, managed-model and cache usage, and free space on the backing filesystem.
- Let desktop users reveal the available storage root in the native file manager and choose a local or mounted external directory. Let Docker Web users copy the container path and choose only from operator-configured, allowlisted mount points.
- Persist a unified storage root containing `models/` and framework-specific `cache/` subdirectories, and route ASRbox Hugging Face, ModelScope, Torch, and XDG cache writes into that root.
- Support either safely moving current model data and eligible caches or adopting validated models already present at the target. Conflicting target entries are never overwritten.
- Run relocation as a cancellable copy-verify-switch-cleanup transaction. A failed or cancelled relocation keeps the original path active and preserves all original data.
- Distinguish an unavailable configured storage location from models that are genuinely not downloaded. While unavailable, block local-model operations and downloads without falling back or downloading elsewhere; online-provider work remains available.
- Document optional Docker bind mounts and allowed storage roots in Compose comments and maintained Chinese and English deployment documentation.

## Capabilities

### New Capabilities

- `model-storage-location`: Define storage-root selection, desktop and Docker presentation, relocation/adoption transactions, cache ownership, and unavailable-location behavior.

### Modified Capabilities

- `model-management`: Make model availability and local-model operations depend on a distinct, truthful storage-location state.
- `storage-privacy-recovery`: Allow model data outside the primary application data directory while preserving user control and transactional no-loss recovery guarantees.
- `documentation-governance`: Require maintained desktop and Docker documentation for model-storage configuration, migration, unavailable locations, and recovery.

## Impact

- Backend configuration and persistence, model/cache path resolution, download and local-execution guards, migration jobs, diagnostics, typed API models/routes, OpenAPI contract tests, and filesystem tests.
- React settings UI, query invalidation, migration progress/cancel flows, desktop-versus-Web capability handling, translations, and Playwright coverage.
- Tauri directory selection and file-manager reveal integration, plus sidecar cache environment initialization or restart behavior.
- `compose.yaml`, Docker environment and mount policy, Docker smoke coverage, `README.md`, `README.en.md`, `docs/docker.md`, `docs/docker.en.md`, and troubleshooting/privacy documentation where affected.
- No new third-party dependency or bundled model weight is planned.
