# Changelog

All notable ASRbox changes are documented here. The format follows Keep a Changelog, and versions follow Semantic Versioning while the project is pre-1.0.

## [Unreleased]

## [0.2.1] - 2026-09-13
### Added

- The models page now opens with a full-width model ladder: every local catalog model gets one row with S/A/B/C grades for speed, accuracy, and language coverage plus GPU/CPU, precise-timeline, and speaker-diarization capability marks and its download status. Speed and accuracy grades come from the Windows + RTX 5080 measurement run (90-second Chinese clip, agreement with large-v3) and are labeled as reference values; unmeasured models fall back to engine/size estimates marked with `*`. The ladder replaces the old estimated benchmark panel.

### Changed

- Ollama providers now use the Ollama native chat API instead of the OpenAI-compatible shim: every request carries a per-request context size (default 32768, adjustable in the provider's compatibility settings as "Context length"), explicit non-thinking mode, native JSON Schema output constraints and unlimited output length. Default-configured Ollama installs (4k context) no longer truncate real translation batches, and thinking models stop burning context on hidden reasoning. Gateways that only speak the OpenAI-compatible API can pin the protocol back to OpenAI in compatibility settings.

### Fixed

- Translation batches sent to local Ollama providers are now capped at 16 segments / 1600 source characters (other protocols keep 100 / 6000): small local models visibly misplace content in larger structured batches, returning sliding-window translations that overlap neighbouring segments. Batches whose translations share long substrings their sources do not share, or whose total length implausibly exceeds the source, are now halved and retried through the same deterministic split path as invalid responses instead of being saved as misaligned checkpoints; single-segment results are accepted as-is. The translation prompt now also states explicitly that each text must translate only its own segment.
- The translation waiting and timeout messages now show the request limit that actually applies to the run's provider (300 seconds for Ollama, 90 for other protocols) instead of a hardcoded 90 seconds.
- Translation requests to local Ollama providers now get a 300-second total deadline (other protocols keep 90 seconds), covering cold model loads plus large batches; batches that fail with `LLM_PROVIDER_TIMEOUT` or with an incomplete/duplicated provider response (`TRANSLATION_INVALID_RESPONSE`) are now halved and retried deterministically like context/truncation failures, instead of failing the whole run. Single-segment failures still fail explicitly with the original error code.
- The models page and model-status metadata no longer claim segment/word timestamps for `sensevoice-small` (its FunASR integration emits none, like Qwen3-ASR): both SenseVoice and Qwen3-ASR entries are now marked as producing an approximate timeline whose cue times are spread across the audio, and `docs/models.md` matches. The task detail output panel now shows the same approximate-timeline note for tasks transcribed with these models, so exported subtitles are not mistaken for measured timings.
- Subtitle line splitting no longer cuts English words in half: when a segment exceeds the per-line character budget the splitter now prefers the last space inside the window, falling back to a hard cut only for text without spaces (e.g. Chinese).
- Local models whose backends return no timestamps (Qwen3-ASR family, SenseVoice) no longer lose every chunk after the first on media longer than two minutes: the chunk combiner treated their single zero-length segment as overlap and discarded it, so an 18-minute video collapsed to the first chunk's ~14 subtitle lines. Timestamp-less segments now span their chunk window before overlap filtering, keeping the full text from every chunk.
- Translation batches that still exceed a provider's context or output capacity are now halved and retried deterministically (recursively down to a single segment, merged back in order into the same persisted checkpoint) instead of failing the whole run with `LLM_PROVIDER_TRUNCATED`; single-segment failures still fail explicitly and completed batches are never resent.
- The translation truncation error now tells local-provider users to raise the context length or switch models instead of a generic "check settings" message.

## [0.2.0] - 2026-09-11
### Added

- LLM provider setup can now pull the available model IDs straight from the configured endpoint: the add/edit dialog has a "Fetch models" action that works before saving (reusing the stored key when editing), Ollama falls back to its native model listing, and the result is a pick-list that fills the default model field while manual entry stays available. Backed by a new `POST /llm-providers/models` probe endpoint with the same bounded-transport and credential-protection rules as the connection test.
- Maintainer tooling: `npm run version:bump -- <X.Y.Z>` updates every maintained version source, the README/release-guide anchors, and the CHANGELOG links in one step (promoting the Unreleased section and scaffolding the release-notes file), then re-proves consistency via `check:versions`, which now also enforces CHANGELOG section and link consistency for the current version.
- GPU acceleration status now carries a machine-readable `reason_code` and the panel offers an explicit "Detect again" action (`POST /settings/cuda-acceleration/redetect`) that re-runs hardware detection; detection caches are also reset automatically on kit lifecycle events, so a GPU that appears after installing a driver no longer stays stuck on "unavailable".
- On macOS the acceleration settings tab now shows an Apple GPU panel (Metal/MPS and MLX availability plus the models that accelerate automatically) instead of the Windows-only CUDA controls; web and other platforms see a desktop-only explanation.

### Removed

- Global keyboard shortcuts (mod+n / mod+f / mod+, / mod+k), the settings shortcuts card, and the command palette are removed as product decisions; global search remains available from its top-bar button, and settings export/import no longer carries a shortcuts field.

### Changed

- The models page now defaults to the "All" category with "Recommended" as the second filter option, so the full catalog is visible on entry.
- Not-downloaded model rows now show a localized status description (Chinese/English) instead of the raw backend English sentence, powered by a new machine-readable `compatibility_error_code` field in `GET /models/status`; merely not-downloaded models no longer clutter the "Needs attention" group, and nearby hardcoded English (download status badges, category field, missing-model notice) is localized.
- The CUDA acceleration panel is now a compact two-card layout, localized failure reasons replace raw backend sentences (with the original text kept as diagnostic detail), and restart-related copy says "restart the app" instead of referring to an internal backend.

### Fixed

- The Windows NSIS installer and uninstaller now use the ASRbox application icon instead of the default NSIS icon.
- CHANGELOG comparison links for 0.1.7–0.1.9 and the Unreleased baseline now point at the correct tags.

## [0.1.9] - 2026-09-10

### Added

- Windows x64 desktop edition with the same Tauri 2 + bundled FastAPI sidecar architecture as macOS, shipped as an NSIS per-user installer (`ASRbox_<version>_x64-setup.exe`).
- Vendored Windows ffmpeg/ffprobe 8.1.2 (gyan.dev GPL build) with full provenance, checksums, and GPL source-offer coverage matching the macOS binaries.
- Desktop updater now recognizes and verifies the Windows NSIS asset from the official GitHub Release; install guidance in Settings → About is platform-aware (Gatekeeper on macOS, SmartScreen on Windows).
- CI gains a Windows backend regression job; the Release workflow builds the Windows installer in a dedicated job and publishes both desktop installers with a combined `SHA256SUMS.txt` from a single publish job.
- Windows desktop gains optional CUDA acceleration: Settings → GPU acceleration downloads a byte-verified PyTorch cu128 kit (multi-part Release assets) on demand and enables GPU transcription on NVIDIA hardware; without the kit or the toggle, behavior stays CPU-only. macOS and web deployments are unaffected.
- Settings → Transcription defaults gains a default-model selector covering local models and enabled online providers, and the transcribe page now preselects the saved default model/provider and default language (including auto-detect) on open; unavailable defaults fall back to the first usable option.

### Fixed

- Windows desktop no longer flashes console windows: the release shell executable is now built GUI-subsystem (`windows_subsystem = "windows"`), and backend child processes (runtime probe, transcription worker, ffmpeg/ffprobe, GPU detection) spawn with `CREATE_NO_WINDOW`.
- Backend test suite is fully green on Windows (423 passed): platform-aware ffmpeg tool fixtures, symlink-privilege probing, Windows socket error codes, process-exit detection, and timing budgets; no assertion semantics were weakened and macOS behavior is unchanged.
- Build and test scripts no longer hardcode `.venv/bin/python`; a shared resolver picks `.venv/Scripts/python.exe` on Windows, so `npm run test:backend`, `npm run build:desktop`, and the readiness gates work identically on both platforms.

## [0.1.8] - 2026-09-09

### Added

- AI chat assistant in a new Chat tab on the AI page: answers app-usage questions from a built-in offline knowledge base distilled from the user docs (keyword retrieval with canonical-question weighting, no vector model or external service), and answers questions about the current subtitle version of a bound transcription task (summaries, whether a line appears, mm:ss time positions). Replies stream token by token over per-request SSE and can be stopped with partial content kept; sessions and messages persist locally with cascade delete. Prompt-injection guarding refuses to reveal system instructions and treats injected knowledge/subtitle text as data. The privacy boundary matches proofreading: only session messages, the bound transcript, and matched knowledge passages are sent.

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

[Unreleased]: https://github.com/Goldloli/asrbox/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/Goldloli/asrbox/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Goldloli/asrbox/compare/v0.1.9...v0.2.0
[0.1.9]: https://github.com/Goldloli/asrbox/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/Goldloli/asrbox/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/Goldloli/asrbox/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/Goldloli/asrbox/compare/v0.1.5...v0.1.6
[0.1.0-rc.2]: https://github.com/Goldloli/asrbox/compare/v0.1.0-beta.1...v0.1.0-rc.2
[0.1.0-beta.1]: https://github.com/Goldloli/asrbox/releases/tag/v0.1.0-beta.1
[0.1.0-rc.1]: https://github.com/Goldloli/asrbox/releases/tag/v0.1.0-rc.1
