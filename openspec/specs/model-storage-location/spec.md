# model-storage-location Specification

## Purpose
规定统一可配置的模型存储根、位置选择的平台适配、迁移规划与冲突安全、可取消的事务化迁移、目标模型接管、框架缓存协调，以及存储不可用时的目录语义。
## Requirements
### Requirement: Unified configurable model storage root
ASRbox SHALL maintain one configured model storage root containing managed models and framework-specific cache directories, SHALL expose its full effective path and current availability separately from model download state, and SHALL default to the existing application data location until a user or operator selects another root.

#### Scenario: User views available model storage
- **WHEN** the configured model storage root is available
- **THEN** Settings > Storage and diagnostics shows its full path, managed-model usage, cache usage, backing-filesystem free space, and available platform actions

#### Scenario: Existing installation upgrades
- **WHEN** an installation has no explicit model storage configuration
- **THEN** ASRbox continues using the existing models and cache locations under the application data directory without requiring a migration

### Requirement: Platform-appropriate location selection
ASRbox SHALL let desktop users select an eligible local or mounted directory with the native folder picker, and SHALL let Docker Web users select only container mount points explicitly allowed by the operator without exposing arbitrary server or host filesystem browsing.

#### Scenario: Desktop user selects a directory
- **WHEN** a desktop user requests a model storage location change
- **THEN** the native folder picker supplies a candidate that the backend validates before offering migration actions

#### Scenario: Docker user changes location
- **WHEN** a Docker Web user requests a model storage location change
- **THEN** the interface lists only configured container mount points and presents their container paths

#### Scenario: User requests path access
- **WHEN** model storage is available and the user invokes the path action
- **THEN** desktop opens the root in the native file manager while Docker Web copies the container path without claiming access to the Docker host file manager

#### Scenario: Candidate contains a symbolic link
- **WHEN** any component of a candidate storage root resolves through a symbolic link
- **THEN** ASRbox rejects the candidate without writing model data

#### Scenario: Candidate is on a detected network filesystem
- **WHEN** ASRbox detects that a candidate root uses a network filesystem
- **THEN** it warns that reliability is not guaranteed and requires acknowledgement before relocation

### Requirement: Relocation planning and conflict safety
ASRbox SHALL inspect a candidate before mutation and report its validated models, incomplete entries, cache candidates, conflicts, bytes to copy, destination capacity, warnings, and active-work blockers. It SHALL NOT overwrite or delete a conflicting target entry.

#### Scenario: Target has conflicting model data
- **WHEN** a move plan finds a target entry with the same managed name but different content
- **THEN** ASRbox blocks relocation and identifies the conflict for user resolution

#### Scenario: Local model work is active
- **WHEN** a download, local transcription, benchmark, or another model mutation is active
- **THEN** ASRbox refuses to start relocation and reports the blocking work

#### Scenario: Destination lacks temporary capacity
- **WHEN** the destination free space is less than the planned copy size and required safety headroom
- **THEN** ASRbox blocks the move before copying and reports the required and available bytes

### Requirement: Transactional move with cancellation
Moving model storage SHALL copy into an isolated target staging area, verify copied data, atomically switch the configured root, and only then remove eligible source data. Failure or cancellation before a successful switch MUST leave the original root configured and all original data intact.

#### Scenario: Move succeeds
- **WHEN** every selected model and cache file is copied and verified and the target readiness check succeeds
- **THEN** ASRbox switches to the target root before deleting eligible source data and reports completion

#### Scenario: Copy or verification fails
- **WHEN** copying, hashing, target finalization, or the readiness check fails
- **THEN** ASRbox retains the original configuration and source data, reports the failed phase, and removes only staging data created by that job

#### Scenario: User cancels a move
- **WHEN** the user cancels an active relocation
- **THEN** ASRbox stops cooperatively, preserves the original configuration and source, cleans its staging data, and reports a cancelled terminal state

#### Scenario: Old-root cleanup fails after switch
- **WHEN** the target is active and verified but deleting old ASRbox-owned data fails
- **THEN** ASRbox keeps the target active, preserves the old copy, and reports that manual cleanup is required

#### Scenario: User monitors a move
- **WHEN** relocation is running
- **THEN** the interface reports its phase, current item, copied and total bytes, progress, warnings, and cancellation action

### Requirement: Adoption of target models
ASRbox SHALL support adopting an eligible target root without copying or deleting the current root, and SHALL evaluate each target model independently using maintained model validation rules.

#### Scenario: Target contains valid and incomplete models
- **WHEN** the user adopts a target containing both valid and incomplete registered model entries
- **THEN** ASRbox switches to the target, marks valid entries available, lists incomplete entries as unusable, and leaves the previous root untouched

### Requirement: Coordinated framework caches
ASRbox SHALL route its Hugging Face, ModelScope, Torch, XDG, and other maintained model-download caches under the configured root, SHALL include ASRbox-owned caches in move planning, and SHALL require separate informed confirmation before including detected global shared caches.

#### Scenario: Model library downloads cache data
- **WHEN** ASRbox invokes a maintained model or diarization library after a storage switch
- **THEN** library downloads and reusable cache artifacts are directed to the configured root rather than the system-disk defaults

#### Scenario: Shared global cache is detected
- **WHEN** planning discovers a known framework cache outside the ASRbox-managed root
- **THEN** the plan lists its path, size, and shared-ownership warning and excludes it unless the user explicitly opts in

### Requirement: Unavailable storage does not become an empty model catalog
ASRbox SHALL preserve an unavailable configured root and report `MODEL_STORAGE_UNAVAILABLE` without creating a fallback root, marking its models as not downloaded, or starting replacement downloads.

#### Scenario: External storage disconnects
- **WHEN** the configured removable storage root cannot be accessed
- **THEN** the settings and model interfaces show “模型存储位置不可用”, retain the configured full path, and disable local-model mutations and execution

#### Scenario: Download is requested while storage is unavailable
- **WHEN** a user or retry path requests a model download while the configured root is unavailable
- **THEN** ASRbox rejects it with `MODEL_STORAGE_UNAVAILABLE` before creating any model or cache directory elsewhere

#### Scenario: Storage reconnects
- **WHEN** the same configured root becomes accessible again
- **THEN** ASRbox redetects its models and enables valid local-model operations without requiring a new path selection

#### Scenario: Online provider is used while storage is unavailable
- **WHEN** local model storage is unavailable and a user starts an online-provider transcription
- **THEN** the provider workflow remains available unless it independently requires the unavailable path

