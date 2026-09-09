# Changelog

All notable ASRbox changes are documented here. The format follows Keep a Changelog, and versions follow Semantic Versioning while the project is pre-1.0.

## [0.1.7] - 2026-09-09

### Fixed

- Qwen3-ASR local transcription no longer silently truncates output at a fixed 512-token budget; the default output budget now scales with audio duration (320 tokens per minute, floored at 1024, capped at 8192) and can still be overridden per task.
- Local Whisper-family engines (faster-whisper, mlx-whisper, transformers-whisper) now default to anti-hallucination decoding (no cross-window prompt carry-over plus repeat suppression), and subtitle post-processing collapses long repeated-token runs, so low-quality or silent audio no longer produces hundreds of repeated words such as "par par par ...". Quality reports now also flag English word-level repetition as `REPETITIVE_TRANSCRIPT`.

### Added

- Local model selectors and download guidance now show whether each maintained ASR model supports CPU and/or GPU inference, with specific CUDA, MPS, and MLX labels and a reminder that the active device depends on the current hardware and runtime.

## [0.1.6] - 2026-09-08

### Added

- Configurable Chat Completions protocol, thinking, output constraints and JSON/SSE transport for both translation and proofreading, including custom providers. Explicit built-in subtitle tests find usable output settings with bounded requests and protect against applying stale recommendations.

- AI subtitle translation between preset or custom languages, preserving source snapshots with independent immutable translation revisions, explicit cancellation/resumption, saved batch progress, and TXT/SRT/VTT/ASS/JSON/Markdown translated or bilingual exports.

### Fixed

- Updated the transitive Nano ID dependency to 3.3.18 to address GHSA-2v37-7h3g-55p8 while preserving the existing dependency audit gate.
- Ollama subtitle translation now requests non-thinking mode and a JSON Schema with required subtitle fields, IDs and count, supporting local thinking models. Both subtitle workflows now use the shared compatibility settings.
- Subtitle translation now enforces a 90-second total request deadline even during provider keep-alives, shows batch waiting time, requests JSON without V4 thinking from DeepSeek, and explicitly requires every segment including the last one. Complete JSON code fences are accepted without weakening alignment validation.

## [0.1.5] - 2026-07-27

### Changed

- Desktop and Web API credentials now use Authorization headers; native audio playback receives a path-scoped ticket with a 30-minute idle timeout and a non-renewable 24-hour maximum lifetime, SSE reconnects after startup races, and server connection settings apply only on explicit Save.
- Runtime compatibility imports run in a bounded short-lived probe process, media tools and desktop/update networking have explicit deadlines, and online SQLite backups use a transaction-consistent snapshot.

### Fixed

- Hardened MCP path access, model deletion, task worker replacement, concurrent retry/retranscribe/delete transitions, and atomic transcript/version writes without changing successful transcription, editing, export, or restore contracts.
- Failed-chunk retry now has one-writer claiming, cancellation-safe finalization, and non-blocking API execution; active cleanup/relink and concurrent proofreading application share the same lifecycle guard, while partial chunk files and nested orphan WAV files are cleaned safely.
- Rejected executable-bundle symlink aliases and broad WebView shell opening, sanitized ZIP entry names, bounded large transcript diffs, and prevented global shortcuts from firing inside editable controls.

### Security

- Tokenless containers now fail closed when their declared published address is non-loopback; query credentials are stripped before routine access logging, and packaged desktop instances no longer adopt an already-running backend they do not own.

## [0.1.4] - 2026-07-26

### Added

- Settings now includes an About tab with build/platform identity, author and support links, stable/prerelease selection, optional background checks, in-app notifications, and settings import/export coverage.
- macOS desktop can check the fixed official GitHub Releases source and download the matching Apple Silicon DMG with global progress, cancel/retry controls, and same-release SHA-256 verification. Installation remains a manual, unsigned and unnotarized replacement; Web builds provide a Releases link only.

## [0.1.3] - 2026-07-26

首个 0.1.1 之后的稳定版，包含 0.1.2-rc.1 与 0.1.2-rc.2 的全部内容及以下新增修复。

### Added

- MOSS-Transcribe-Diarize 0.9B local model (Apache 2.0): end-to-end transcription, segment timestamps, and `[S01]`-style speaker diarization in a single pass, with 50+ languages and up to roughly 90 minutes of audio per run. Speaker labels are produced natively by the engine and need no `HF_TOKEN` or separate diarization model; `max_new_tokens` scales with audio duration so long recordings are not truncated.
- Detailed per-model introductions on the Models page: every registered model now has an expandable intro with capabilities, language coverage, recommended scenarios, and known limitations in Chinese and English, plus a "Speaker diarization" category filter.
- README: unsigned-build guidance for the macOS "ASRbox.app is damaged" Gatekeeper dialog, with the one-time `xattr -cr /Applications/ASRbox.app` fix and a screenshot (Chinese and English).

### Changed

- Task pipeline preserves engine-native speaker labels: when a transcription result already carries speakers, pyannote post-processing (and its token requirement) is skipped instead of overwriting native labels.
- Runtime status now exposes `moss_transcribe_diarize_available`; the field is declared on the response model, asserted in API tests, and typed in the frontend client.

### Fixed

- Model loading after model-storage relocation: snapshot paths recorded as absolute went stale after a move, so Qwen3-ASR failed with "Unrecognized processing class" and FunASR received an unloadable path. Snapshot paths are now re-anchored under the current storage root.
- FunASR models (SenseVoice) failed in the packaged app because its model registry stayed empty under PyInstaller. The frozen backend now bundles all funasr submodules and pre-imports them at startup.
- A hung local transcription worker no longer pins a task in transcribing forever: it is terminated after a configurable no-progress window (`ASRBOX_LOCAL_WORKER_STALL_SECONDS`, default 20 minutes) and the task fails as `LOCAL_WORKER_STALLED` with completed chunks kept retryable.
- Settings Storage & Diagnostics tab: the two-column grid lost its right rail because both storage panels forced full-width spans, leaving empty holes; the recent-error card now clamps long errors to three lines with the full text on hover.

### Chore

- Privacy: `.beads/interactions.jsonl` (agent interaction records) removed from version control and ignored going forward; commit history scrubbed of personal paths and the author's personal email.
- Committed frontend-audit screenshots removed; the audit output directory is now ignored.
- OpenSpec: five shipped changes archived into the main specs (stale deltas refreshed as unions), and all specs now carry a one-line Purpose.

## [0.1.2-rc.2] - 2026-07-25

### Added

- MOSS-Transcribe-Diarize 0.9B local model (Apache 2.0): end-to-end transcription, segment timestamps, and `[S01]`-style speaker diarization in a single pass, with 50+ languages and up to roughly 90 minutes of audio per run. Speaker labels are produced natively by the engine and need no `HF_TOKEN` or separate diarization model; `max_new_tokens` scales with audio duration so long recordings are not truncated.
- Detailed per-model introductions on the Models page: every registered model now has an expandable intro with capabilities, language coverage, recommended scenarios, and known limitations in Chinese and English, plus a "Speaker diarization" category filter.

### Changed

- Task pipeline preserves engine-native speaker labels: when a transcription result already carries speakers, pyannote post-processing (and its token requirement) is skipped instead of overwriting native labels.

### Fixed

- Privacy: `.beads/interactions.jsonl` (agent interaction records) is removed from version control and ignored going forward.

## [0.1.2-rc.1] - 2026-07-25

### Fixed

- Model loading after model-storage relocation: markers recorded absolute snapshot paths that went stale after a move, so Qwen3-ASR failed with "Unrecognized processing class" and FunASR received an unloadable path. Snapshot paths are now re-anchored under the current storage root.
- FunASR models (SenseVoice) failed in the packaged app because its model registry stayed empty under PyInstaller. The frozen backend now bundles all funasr submodules and pre-imports them at startup, with a source-inspection stub for frozen modules.
- A hung local transcription worker no longer pins a task in transcribing forever and stalls the local queue: it is terminated after a configurable no-progress window (`ASRBOX_LOCAL_WORKER_STALL_SECONDS`, default 20 minutes) and the task fails as `LOCAL_WORKER_STALLED` with completed chunks kept retryable.

## [0.1.1] - 2026-07-25

### Added

- Desktop media ingest modes: reference the original file in place (new default, no copy, no importing wait) or keep managed copies in the uploads folder. Browser and Docker uploads remain managed copies.
- Configurable uploads and derived-audio directories with environment-variable locks, availability reporting, and Docker read-only presentation. Location changes apply to new work only; existing files keep working.
- Per-task media ownership: task deletion, bulk deletion, and storage cleanup only remove ASRbox-managed files and never touch referenced originals.
- Desktop relink: when a referenced source is moved or deleted, point the task at the file's new path and regenerate derived audio.
- Optional automatic deletion of derived audio (normalized wav and chunks) after a successful transcription.
- Optional documented Compose bind mount for `/data/uploads`, with external-disk examples for macOS and Windows.

### Changed

- Desktop drag-and-drop import now uses native Tauri drag events with real file paths, so dropped media follows the same reference/copy ingest mode as the file picker.
- Derived audio is task-named and written under the configurable derived-audio directory instead of beside the source file.
- Task responses expose a typed `source_kind` field; new typed media-storage settings routes and a desktop relink endpoint extend the maintained API.

## [0.1.0-rc.2] - 2026-07-22

### Added

- Source-built Linux CPU Docker deployment with a multi-stage non-root image, same-origin Web UI/API, ffmpeg, health checks, and persistent `/data` volume.
- Model storage relocation settings with selectable target roots, adopt mode, shared-cache handling, and progress polling.
- Loopback-only Compose defaults with configurable host port, bind address, API token, and host-Ollama connectivity.
- Docker image, health, persistence, token, deep-link, desktop-browser, and mobile-browser smoke coverage in CI and Release verification.
- Dedicated AI workspace for LLM subtitle proofreading, provider presets/testing, ordered suggestions, individually collapsible correct ranges, and explicit versioned application.
- Docker and AI proofreading guides in Chinese and English.

### Changed

- Container-built Web UI connects to its browser origin; desktop and Vite development keep the loopback default.
- Web API tokens are kept only in browser session storage and excluded from settings export/persistent local storage.
- Packaged frontend owns `/`; API metadata is available at `/api-info`, while source backend development retains its JSON root.
- Linux containers identify and reject the Apple-only MLX model before download.
- README, privacy, security, model, troubleshooting, contribution, CI, release, and third-party documentation now distinguish desktop, Docker, local ASR, online providers, and LLM text processing.

### Security

- Docker binds to `127.0.0.1` by default; LAN exposure is explicit and documented with token, VPN, and authenticated HTTPS proxy requirements.
- Container state and backups are documented as sensitive because `/data` can contain media, transcripts, and plaintext provider credentials.

## [0.1.0-beta.1] - 2026-07-13

### Added

- Pause, resume, stop, and retry controls for managed model downloads.
- Model storage responses and UI metrics for the resolved directory, per-model bytes, used bytes, and free/total filesystem capacity.
- Browser coverage for model storage layout and download controls.
- Per-launch token protection for the desktop loopback API.
- Bounded streaming uploads and batch limits.
- Exact Python runtime, development, and build lock snapshots.
- FFmpeg GPLv3 license, checksums, source records, and Release source archive.
- Version/tag consistency and release-asset gates.

### Changed

- Positioned the MVP as a macOS Apple Silicon public beta.
- Model downloads retain reusable partial files after stop or failure and can retry without deleting the directory.
- Hugging Face managed downloads disable Xet so pause/stop checkpoints remain controllable.
- Hugging Face downloads ignore duplicate PyTorch and FP32 weight variants when accepted runtime weights are available.
- Completed models are no longer invalidated solely by `.incomplete` files inside their internal Hugging Face `.cache`.
- Transformers Whisper and Qwen3-ASR decode audio through the Transformers `librosa` path before inference.
- The frozen backend excludes TorchCodec and includes the runtime modules needed by the supported ASR engines.
- Tauri CSP, capabilities, shell scope, backend CORS, and desktop runtime checks were tightened.
- Frontend build dependencies were updated and the vulnerability audit restored to a clean state.

### Fixed

- The Model Storage panel now renders stable rows and real capacity values instead of collapsed entries and unavailable totals.
- Real MP4 transcription no longer fails because the installed PyTorch and TorchCodec binary versions do not match.
- Timestamp-free single-segment results now span the detected media duration instead of producing a zero-length subtitle.
- Invalid local-model and online-provider requests are rejected before uploads are saved.
- Production tasks no longer return placeholder transcripts for invalid backend selections.

### Verified

- All 14 registered local models completed non-empty transcription of a real MP4 excerpt on macOS Apple Silicon.
- The frozen backend, `.app`, and generated DMG passed local smoke and integrity checks.
- The repository open-source gate passed backend, TypeScript, Web, Cargo, third-party, version, and browser checks.

### Security

- Documented that provider credentials are plaintext in the local SQLite database and included in backups.
- Documented the limits of loopback token protection and the unsigned/unnotarized beta package.

## [0.1.0-rc.1] - 2026-07-08

### Added

- Initial macOS Apple Silicon prerelease generated by GitHub Release CI.
- Tauri desktop MVP with bundled backend sidecar.
- Bundled ffmpeg/ffprobe for desktop media inspection.
- Shared Web UI for desktop transcription workflows.

### Known Issues

- The macOS package is not signed or notarized.
- Windows and Linux packages are not published.

[Unreleased]: https://github.com/Goldloli/asrbox/compare/v0.1.6...HEAD
[0.1.6]: https://github.com/Goldloli/asrbox/compare/v0.1.5...v0.1.6
[0.1.0-rc.2]: https://github.com/Goldloli/asrbox/compare/v0.1.0-beta.1...v0.1.0-rc.2
[0.1.0-beta.1]: https://github.com/Goldloli/asrbox/releases/tag/v0.1.0-beta.1
[0.1.0-rc.1]: https://github.com/Goldloli/asrbox/releases/tag/v0.1.0-rc.1
