## Context

The backend currently derives `models/` from `ASRBOX_DATA_DIR`, and `get_models_dir()` creates that directory whenever it is queried. Model status, downloads, execution, runtime diagnostics, and storage summaries all use this helper. The settings page already displays the model path and aggregate disk figures, while Tauri already exposes native folder selection and path opening. An existing `/models/migrate` helper moves model directories directly, deletes target conflicts, and does not change a persisted storage root.

Docker currently persists `/data` and sets Hugging Face, ModelScope, Torch, and XDG caches under `/data/cache`. Browser code cannot select a host directory or open the host file manager; it can only operate on container paths that the operator mounted and authorized.

The implementation must preserve the desktop loopback/token boundary, Docker's operator-controlled storage boundary, model-download truthfulness, and user data under every failure or cancellation path.

## Goals / Non-Goals

**Goals:**

- Represent the configured root, its current availability, and model download state as separate facts.
- Store all ASRbox-managed models and framework caches below one configurable root.
- Provide safe desktop selection and Docker selection limited to declared mount points.
- Move or adopt model storage without overwriting conflicts or risking loss of the active source.
- Expose accurate space, progress, cancellation, warnings, and recovery behavior through typed APIs and the settings UI.
- Keep online-provider tasks usable when local model storage is unavailable.

**Non-Goals:**

- Moving the SQLite database, uploads, transcripts, exports, or other application data with the model root.
- Browsing arbitrary Docker host or container filesystems from the Web UI.
- Guaranteeing reliability or atomic operations on network filesystems.
- Deduplicating model files across providers or changing the registered model catalog.
- Silently moving or deleting a user's shared global framework caches.

## Decisions

### Persist a storage-root configuration outside the movable root

The effective root defaults to `ASRBOX_DATA_DIR`. A small versioned model-storage configuration file under the stable application data directory records a user-selected root and is written with a temporary file plus atomic replace. It must never be stored inside the movable root. An operator-enforced environment setting may provide a default or lock the root, while the Docker allowlist controls which persisted values are accepted.

The selected root has a fixed layout:

```text
<root>/
  models/
  cache/
    huggingface/
    modelscope/
    torch/
    xdg/
```

A dedicated resolver returns these paths without creating them. Explicit initialization and migration code may create directories only after validating the selected root. This avoids manufacturing an empty directory at a disconnected mount point.

Alternative considered: add the path to the ASR settings database row. That would make low-level configuration and worker startup depend on a database session and complicate cache environment initialization before model libraries are imported.

### Model storage has an explicit availability state

Storage inspection returns the configured root even when unavailable, plus an enum such as `available`, `read_only`, `unavailable`, or `migrating`, a stable reason code, human-readable detail, writability, total/free bytes, model bytes, cache bytes by provider, and the allowed Docker roots. Inspection uses non-mutating filesystem calls and a write probe only when explicitly validating a candidate.

Model inventory is evaluated only when the configured root is available. When unavailable, every registered model reports storage unavailable and its `downloaded` state is `null` rather than false. Downloads, deletion, verification, benchmarking, local transcription, and other local-model operations fail with a dedicated `MODEL_STORAGE_UNAVAILABLE` code before creating directories. Online-provider operations are unaffected. Reconnection is detected by normal polling/refetch and requires no path reset.

Alternative considered: fall back to the default data directory. That could silently duplicate large downloads on the system disk and make reconnection ambiguous.

### Use a central cache resolver and explicit library configuration

ASRbox-owned calls pass resolved cache directories explicitly wherever Hugging Face, ModelScope, Torch, pyannote, or related APIs allow it. Process environment variables (`HF_HOME`, `HUGGINGFACE_HUB_CACHE`, `MODELSCOPE_CACHE`, `TORCH_HOME`, and `XDG_CACHE_HOME`) are initialized from the same resolver as compatibility fallbacks, and Torch's runtime cache directory is refreshed when required. The resolver, not ambient environment, remains the application source of truth.

The relocation planner inventories caches already inside the current ASRbox root automatically. It also detects known default global cache locations outside that root and reports each candidate, size, ownership warning, and whether it is shared. Shared global caches are included only after a separate explicit confirmation; they are never silently deleted. Unknown third-party cache locations remain out of scope.

Alternative considered: rely only on environment variables. Several libraries cache environment-derived constants at import time, which makes a live path switch unreliable.

### Separate planning from starting a relocation

A typed planning endpoint accepts a candidate root and mode (`move` or `adopt`) and returns validation results before mutation: canonical path, platform eligibility, symlink rejection, network-filesystem warning when detectable, root layout, model validity, cache candidates, conflicts, bytes to copy, required temporary headroom, destination free space, and blockers such as active local tasks or downloads.

Desktop candidates originate from Tauri's native directory picker and are still validated by the backend. Docker candidates must equal or be contained by an operator-configured allowlist such as `ASRBOX_MODEL_STORAGE_ROOTS`; the UI lists only those roots. Compose will include commented bind-mount and allowlist examples. The default Docker root remains `/data`. Web displays and copies container paths and does not claim to open a host file manager.

Paths containing symbolic-link components are rejected. Local and mounted removable filesystems are supported. Detectable network filesystems produce a warning and require acknowledgement but are not guaranteed.

### Relocation is a single cancellable transaction

Only one relocation may run at a time. Starting it revalidates the plan, requires no active local transcription, model download, benchmark, or other model mutation, and unloads idle loaded models. New local-model work is blocked for the transaction duration.

For `move`, data is copied into an ASRbox-owned staging directory under the target root. Existing target entries are never removed or overwritten: equivalent validated entries may be reused, while any content conflict aborts before configuration changes. Copied files are verified against source metadata and streamed hashes. The implementation checks destination headroom before copying but treats that as advisory because free space can change.

After all selected model and cache data verifies, the target layout is finalized, the persisted root is switched atomically, cache configuration is refreshed, and a final readiness check runs. Only then may the old ASRbox-owned source data be deleted. Failure to delete old data is reported as a successful switch with cleanup required; it is not treated as data loss. A failure before or during the switch rolls the configuration back to the original root while the original data still exists.

Cancellation is cooperative between files and copy chunks. It leaves the original configuration and source untouched and removes only the uniquely named staging directory created by that job. Progress reports phase, current item, copied and total bytes, percent, warnings, cleanup status, and terminal error details. Interrupted jobs are marked failed at startup and their staging directories are eligible for explicit cleanup.

For `adopt`, the planner validates target models using the same compatibility rules. Valid models become available after the atomic root switch; invalid or incomplete entries are listed and remain unavailable. No source data is copied or deleted, and the previous root remains intact.

Alternative considered: `shutil.move` each model and switch incrementally. Cross-filesystem moves degrade to copy/delete and can leave a mixture of old and new state after one item fails.

### Extend the maintained API without removing the legacy route

`GET /models/storage` gains typed availability, root layout, cache usage, and platform capability fields. New typed endpoints provide candidate planning, job creation, job status, and cancellation. Model status and local-operation errors use stable storage-unavailable codes consumed by the React client and contract tests.

The existing `/models/migrate` route remains for compatibility but is changed internally to avoid overwrite and source deletion before verification. The new settings workflow uses the job API rather than the legacy route.

### Keep platform-specific controls honest

The settings panel always shows the configured full root, availability, model bytes, cache bytes, and backing-filesystem free space. Desktop shows native "Open in file manager" and "Change location" actions. Docker Web shows "Copy path" and a selector containing only allowed mounted roots. Migration choice, cache warnings, conflict results, progress, cancellation, and cleanup-required states are shared UI behavior.

## Risks / Trade-offs

- **Migration temporarily requires space for two copies** -> calculate required bytes and free space before starting, explain the requirement, and never delete source early.
- **Hashing large models increases migration time** -> stream hashes with progress and cancellation; correctness takes priority over speed for destructive cleanup.
- **Removable storage can disconnect mid-copy or after switching** -> retain source until verification and switch complete, expose unavailable state afterward, and never fall back automatically.
- **Shared caches may belong to other tools** -> list them separately, require an explicit warning acknowledgement, and default them out of the plan.
- **Filesystem type detection is platform-dependent** -> treat network detection as advisory and maintain the same no-overwrite/no-loss transaction on every filesystem.
- **A Docker path may exist without a persistent mount** -> selection is limited to operator-declared roots and documentation explains bind mounts, persistence, container paths, and restart/recreation behavior.
- **A process may retain library cache globals** -> use explicit cache arguments and refresh supported runtime cache setters; tests cover switching after prior model-library use.

## Migration Plan

1. Introduce the side-effect-free storage resolver and versioned configuration with the existing application data directory as the default root.
2. Route model and cache consumers through the resolver, add unavailable-state guards, and prove that inspection cannot create a missing root.
3. Add typed status, planning, relocation, progress, and cancellation APIs while retaining the legacy migration route safely.
4. Add the settings UI and Tauri/Docker capability differences.
5. Add optional Compose bind-mount and allowlist examples plus maintained Chinese and English documentation.
6. Verify default-path compatibility, move/adopt success, conflicts, cancellation, injected copy/verification/switch failures, disconnection/reconnection, desktop controls, and Docker mount selection.

Rollback before a successful switch removes only job staging data and keeps the original configuration. Rollback after a configuration-switch failure atomically restores the previous root while its source data is still present. A completed switch with undeleted old data is recoverable by selecting or adopting either verified root; automated cleanup never guesses which duplicate to delete.

## Open Questions

None. The user confirmed desktop and Docker support, unified layout, shared-cache confirmation, target validation, no-overwrite conflicts, copy-verify-switch cleanup, unavailable-location behavior, progress/cancellation, symlink rejection, and network-filesystem warnings.
