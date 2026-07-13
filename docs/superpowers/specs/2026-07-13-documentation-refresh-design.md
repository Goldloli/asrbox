# ASRbox 0.1.0-beta.1 Documentation Refresh Design

## Objective

Rewrite the repository-owned public documentation so that it accurately describes ASRbox `0.1.0-beta.1`, the supported macOS Apple Silicon release, the current 14-model catalog, model download controls, local storage behavior, verified test coverage, and known public-beta limitations.

The documentation refresh is complete when a new user can determine what ASRbox does, install or build it, download and manage a model, transcribe real media, find local data, troubleshoot common failures, and understand the project's security and release boundaries without reading source code.

## Scope

Rewrite or substantially update these maintained documents:

- `README.md` and `README.en.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `.github/ABOUT.md`
- `.github/pull_request_template.md`
- `docs/ci.md`
- `docs/labels.md`
- `docs/models.md`
- `docs/privacy.md`
- `docs/release.md`
- `docs/troubleshooting.md`
- `backend/API_FREEZE.md`
- `backend/MATURITY_REPORT.md`

Do not rewrite immutable or historical records:

- `LICENSE`, `THIRD_PARTY_NOTICES.md`, and files under `third_party/`
- Earlier design specifications and implementation plans under `docs/superpowers/`
- Generated real-model result reports under `backend/real_tests/results/`
- Frontend audit notes and screenshots

Historical records may be linked from current documentation, but their past results must not be silently changed.

## Language Strategy

`README.md` remains the primary Chinese landing page and `README.en.md` remains its English mirror. They use the same section order and communicate the same product boundaries.

Contributor, governance, release, API, and detailed reference documents remain in concise English so each policy has one canonical maintained copy. The Chinese README links to them with Chinese descriptions.

## Information Architecture

The two README files provide the shortest complete path for users:

1. Product purpose and beta status.
2. Supported platform and current limitations.
3. Feature overview.
4. Download, first launch, model download, transcription, and export workflow.
5. Model and application data locations.
6. Development, verification, and desktop packaging commands.
7. Links to focused reference documents.

Detailed information stays in dedicated documents:

- `docs/models.md`: all 14 models, engines, approximate sizes, source behavior, download controls, storage layout, selection guidance, and model licensing caveats.
- `docs/troubleshooting.md`: startup, unsigned macOS builds, ffmpeg, TorchCodec, model download, disk usage, Qwen3-ASR, and diagnostic steps.
- `docs/privacy.md`: local processing, online-provider transfer boundary, stored files, plaintext provider keys, backups, deletion, and complete uninstall.
- `docs/ci.md` and `docs/release.md`: commands that match package scripts and GitHub workflows, release assets, verification, and signing limitations.
- `CONTRIBUTING.md`, `SECURITY.md`, `.github/ABOUT.md`, `.github/pull_request_template.md`, and `docs/labels.md`: current contribution and repository governance workflow.
- `backend/API_FREEZE.md` and `backend/MATURITY_REPORT.md`: current model download endpoints, status semantics, test counts, and real-model verification evidence.

## Product Facts to Document

- Current version: `0.1.0-beta.1`.
- Published desktop target: macOS Apple Silicon.
- The desktop app includes the frozen backend and ffmpeg/ffprobe, but model weights are downloaded separately.
- The default desktop data root is `~/Library/Application Support/com.goldloli.asrbox/`.
- Local models are stored under `~/Library/Application Support/com.goldloli.asrbox/models/<model-name>/`.
- Uploads, extracted audio, exports, backups, diagnostics, and `asrbox.db` live under the data root according to backend configuration and user actions.
- Default user-facing exports go to `~/Downloads/ASRbox Exports/` unless changed in Settings.
- Model downloads support pause, resume, stop, and retry. Stop preserves already downloaded resumable files; deleting a model removes its ASRbox-managed model directory.
- The catalog contains 14 local models across Transformers Whisper, Faster Whisper, MLX Whisper, SenseVoice, and Qwen3-ASR.
- All 14 models have passed a real-media transcription run on the maintainer's Apple Silicon test environment. This is compatibility evidence, not a guarantee for every machine or media file.
- The current DMG is not signed or notarized, Windows and Linux artifacts are not published, automatic updates are not implemented, and provider API keys are not stored in the system keychain.

## Accuracy Rules

- Derive commands from `package.json` and workflows rather than memory.
- Derive model names, runtimes, sources, and estimated sizes from `backend/backends/registry.py`.
- Derive paths from Tauri's application identifier and `backend/config.py`.
- Distinguish installed model size from registry estimates; interrupted caches and upstream file changes can increase actual disk use.
- Do not claim that models are bundled with the application or that online providers are local/private.
- Do not describe the beta as stable, signed, notarized, cross-platform, or automatically updating.
- Do not publish private local filenames from the maintainer's real test media in public-facing documentation.

## Verification

Documentation verification will include:

- Confirming the Chinese and English README section structure stays aligned.
- Checking Markdown links and referenced repository paths.
- Searching for stale versions, obsolete model limitations, outdated test counts, and removed endpoint descriptions.
- Running `git diff --check`.
- Running `npm run check:open-source` after the documentation and pending product fixes are complete.
- Reviewing the final diff before committing, merging to `main`, and pushing `origin/main`.

## Delivery

Documentation changes will be committed with the pending model-management fixes on the existing `codex/open-source-mvp-hardening` branch. After all verification gates pass, the branch will be merged into local `main`, the merged state will be verified, and `main` will be pushed to GitHub.

Release amendment (2026-07-13): after the initial merge, the user explicitly authorized creation of the annotated `v0.1.0-beta.1` tag and public GitHub Release. Delivery therefore also includes monitoring the Release workflow and independently verifying the published DMG, FFmpeg source archive, and `SHA256SUMS.txt`.
