![ASRbox demo](assets/asrbox-demo.gif)

# ASRbox

[中文](README.md) | English

ASRbox is a local-first audio and video transcription workbench. It converts media into editable text and subtitles with 14 local ASR models, optional online ASR providers, task recovery, transcript history, and multiple export formats.

## Public beta status

The current source version is `0.1.0-beta.1`. It is ready for evaluation, testing, and feedback, but it is not a stable release.

| Area | Current status |
| --- | --- |
| Desktop release target | macOS Apple Silicon |
| Desktop stack | Tauri 2 with a bundled FastAPI sidecar |
| Local models | 14 on-demand downloads; not included in the DMG |
| Media tools | ffmpeg and ffprobe bundled with the desktop package |
| Code signing / notarization | Not available yet |
| Windows / Linux packages | Not available yet |
| Automatic updates | Not available yet |

Keep the original copy of important media. Create a backup in Settings before upgrading. Provider credentials are stored in the local SQLite database and are not protected by macOS Keychain yet.

## What it can do

- Select, batch-select, or drag audio and video files, then preflight format, audio streams, duration, and chunking.
- Transcribe locally with Whisper, Faster Whisper, MLX Whisper, SenseVoice, and Qwen3-ASR.
- Manage model downloads with pause, resume, stop, and retry controls.
- Configure online ASR providers; online mode sends media or audio to the selected third party.
- View, search, replace, edit, copy, and play transcription results.
- Preserve transcription, retranscription, edit, restore, and post-processing versions.
- Export TXT, SRT, VTT, ASS, JSON, and Markdown.
- Inspect task logs, diagnostics, quality data, model compatibility, and storage usage.

## Download and first launch

See [GitHub Releases](https://github.com/Goldloli/asrbox/releases) for published packages. Repository source can be newer than the latest Release; if a `0.1.0-beta.1` DMG is not published, build it from source using the instructions below.

The current DMG is unsigned and not notarized. On first launch:

1. Move `ASRbox.app` to Applications.
2. Right-click the app and choose Open, or allow it in macOS System Settings → Privacy & Security.
3. Wait while the desktop app starts the local backend. Create a task only after the UI reports that the backend is online.
4. Open Models and download one local model.

Download packages only from this project's Releases and verify `SHA256SUMS.txt`. Do not run an artifact whose checksum does not match.

## First transcription

1. Download a model from Models. On Apple Silicon, start with `mlx-whisper-turbo`; for a smaller functional check, use `faster-whisper-base`.
2. Select an audio or video file in New Task.
3. Choose Local Model and an installed model, then set language, timestamps, and chunking as needed.
4. Submit the task and inspect progress, logs, and results on the task page.
5. Review the text and export SRT, VTT, ASS, TXT, JSON, or Markdown.

Larger models usually need more disk space, memory, and cold-start time. All 14 models completed real-video transcription in the maintainer's Apple Silicon test environment. This is compatibility evidence, not a guarantee for every machine, file, or upstream model revision.

## Local models

ASRbox currently registers 14 local models:

- Transformers Whisper: `whisper-base`, `whisper-small`, `whisper-medium`, `whisper-large-v3`, `whisper-large-v3-turbo`
- Faster Whisper: `faster-whisper-base`, `faster-whisper-small`, `faster-whisper-medium`, `faster-whisper-large-v3`, `faster-whisper-large-v3-turbo`
- Apple MLX: `mlx-whisper-turbo`
- FunASR: `sensevoice-small`
- Qwen3-ASR: `qwen3-asr-0.6b`, `qwen3-asr-1.7b`

Models are downloaded on demand from Hugging Face or ModelScope into the ASRbox data directory. Pause affects the current app process; stop ends the task while retaining reusable downloaded files; retry reuses the existing directory; deleting a model removes its ASRbox-managed model directory.

See the [model guide](docs/models.md) for selection guidance, estimated sizes, sources, and license notes.

## Where data is stored

The default macOS desktop data root is:

```text
~/Library/Application Support/com.goldloli.asrbox/
```

Important contents:

```text
asrbox.db                 Tasks, settings, versions, and provider configuration
models/<model-name>/      Final model files and model download caches
uploads/                  Media managed by ASRbox
audio/                    Extracted or normalized audio
cache/                    Task cache
exports/                  Backend exports and diagnostic files
backups/                  Backups created in the app
```

Desktop saves go to `~/Downloads/ASRbox Exports/` by default. Change this under Settings → General → Download location. Models do not live in the repository, `.app`, or DMG. Removing the application does not remove the data directory or downloaded models.

The development backend uses the repository's `data/` directory by default; override it with `ASRBOX_DATA_DIR`. See [privacy and local data](docs/privacy.md) for the full data boundary and uninstall steps.

## Architecture

```text
app/                 React components, routes, state, and shared UI
web/                 Vite Web entry point
backend/             FastAPI API, task scheduler, ASR backends, storage, and exports
tauri/               Tauri shell, sidecar lifecycle, and system integration
scripts/             Build, version, audit, and release gates
third_party/ffmpeg/  Bundled ffmpeg/ffprobe and compliance material
```

The desktop app starts the bundled `asrbox-server` on `127.0.0.1:17494`, creates an in-memory API token for each launch, and passes the Tauri app data directory to the backend. The Web UI connects to an existing backend and does not start one. Exposing a development backend to a LAN or the public internet is unsupported.

## Development

Requirements: macOS Apple Silicon, Bun `1.3.8`, Python `3.13`, and stable Rust. The current Python lock snapshots target macOS Apple Silicon and Python 3.13.

```bash
bun install
python -m venv .venv
.venv/bin/python -m pip install pip==25.3
.venv/bin/pip install -r requirements-dev.lock
```

Run the backend and Web UI separately:

```bash
npm run dev:server
npm run dev:web
```

Run desktop development mode:

```bash
npm run dev:desktop
```

Development needs ffmpeg and ffprobe. Install a system build or use the binaries in `third_party/ffmpeg/darwin-arm64/`.

## Build and release

Install frozen-backend dependencies and build the `.app` and DMG:

```bash
.venv/bin/pip install -r requirements-build.lock
npm run build:desktop
```

Expected Apple Silicon DMG path:

```text
tauri/src-tauri/target/release/bundle/dmg/ASRbox_0.1.0-beta.1_aarch64.dmg
```

The Release workflow requires a `v*` tag that exactly matches the application version. It produces the DMG, an FFmpeg source archive, and `SHA256SUMS.txt`. See the [release process](docs/release.md). Merging code does not create a tag or GitHub Release.

## Verification

Run the repository gate before submitting changes:

```bash
npm run check:open-source
```

It checks locked dependencies, Python packages, version consistency, release tools, third-party compliance, TypeScript, the Web build, backend tests, Cargo, and browser smoke coverage. The network dependency audit is enforced by CI and Release and can also be run directly:

```bash
npm run audit:dependencies
```

Real-model tests need predownloaded models and legally supplied test media, so they are not part of default CI:

```bash
ASRBOX_REAL_MEDIA_DIR="/path/to/media" npm run test:backend:real-models:full
```

## Documentation

- [Model guide](docs/models.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Privacy and local data](docs/privacy.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Continuous integration](docs/ci.md)
- [Release process](docs/release.md)
- [Backend API stability boundary](backend/API_FREEZE.md)
- [Backend maturity report](backend/MATURITY_REPORT.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [Changelog](CHANGELOG.md)

## Security and privacy

Local-model mode processes media on the machine. Online-provider mode sends media, extracted audio, text, or metadata to the configured third party. Provider API keys are currently stored in plaintext in local `asrbox.db` and are included in application backups.

The desktop backend listens only on loopback and uses a per-launch token. This does not protect against malicious software running as the same macOS user and is not disk encryption. Report sensitive vulnerabilities privately using the [security policy](SECURITY.md).

## Contributing

Reproducible issues and small, verifiable changes are welcome. Changes to backend behavior, model downloads, desktop packaging, storage, or exports should include relevant automated tests and manual verification notes. Read [CONTRIBUTING.md](CONTRIBUTING.md) before starting.

## License

ASRbox source code is available under the [MIT License](LICENSE). Bundled FFmpeg, models, runtimes, and other third-party components remain under their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Model weights are not redistributed in the ASRbox repository or DMG.
