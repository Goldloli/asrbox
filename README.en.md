![ASRbox demo](assets/asrbox-demo.gif)

# ASRbox

[中文](README.md) | English

ASRbox is a local-first transcription workbench. It provides a web UI and a macOS desktop app for turning audio or video files into transcripts and subtitle exports, with support for local ASR models and online provider workflows.

The desktop app is built with Tauri. On startup it launches or reuses a local ASRbox backend, bundles ffmpeg/ffprobe for media inspection, and keeps the familiar Web UI as the main product surface.

## Features

- Local audio and video transcription workflow.
- Batch file selection and drag-and-drop upload.
- Preflight checks for media duration, stream availability, and chunking.
- Local model workflow with model download status and runtime diagnostics.
- Online provider configuration for compatible ASR services.
- Transcript viewer with search, replacement, edit, copy, and audio playback.
- Subtitle and document exports: TXT, SRT, VTT, ASS, JSON, and Markdown.
- Configurable desktop download location for exported files.
- Task center, task history, task cleanup, retry, retranscription, and clear-list actions.
- macOS desktop packaging with bundled backend sidecar and bundled ffmpeg tools.

## Project Status

ASRbox is currently in early desktop MVP development. The macOS build is the primary supported desktop target at this stage. Windows and Linux packaging paths are kept in mind, but they are not the current release gate.

Not included yet:

- Code signing and notarization.
- Auto update.
- System tray or background daemon mode.
- Windows/Linux release artifacts.

## Architecture

```text
ASRbox
|-- app/                 React application source shared by web and desktop
|-- web/                 Vite web entry and static assets
|-- backend/             FastAPI backend, ASR orchestration, exports, storage
|-- tauri/               Tauri desktop shell and Rust sidecar lifecycle code
|-- scripts/             Build helpers for backend binary and dev sidecar
|-- third_party/ffmpeg/  Vendored ffmpeg/ffprobe binaries and notes
`-- assets/              README and project assets
```

Runtime shape:

```text
Tauri app
  ├─ loads Web UI
  ├─ starts bundled asrbox-server on 127.0.0.1:17494
  ├─ injects bundled ffmpeg/ffprobe paths
  └─ saves desktop exports to the configured download directory

Web UI
  └─ connects to an existing backend URL and does not auto-start a backend
```

## Requirements

- macOS on Apple Silicon for the current packaged desktop target.
- Bun 1.3.x.
- Python 3.11+ recommended.
- Rust stable and the Tauri build toolchain.
- A Python virtual environment at `.venv`.
- ffmpeg/ffprobe for development, or the vendored macOS binaries under `third_party/ffmpeg/darwin-arm64/`.

Install frontend dependencies:

```bash
bun install
```

Install backend dependencies:

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Development

Run the backend:

```bash
npm run dev:server
```

Run the Web UI:

```bash
npm run dev:web
```

Run the desktop app in development:

```bash
npm run dev:desktop
```

The desktop development command creates a dev sidecar placeholder when needed and then starts Tauri. In debug builds, the desktop shell prefers `.venv/bin/python -m backend.server` so the backend can be iterated without rebuilding the frozen binary.

## Desktop Build

Build the macOS desktop app and DMG:

```bash
npm run build:desktop
```

The build does three important things:

1. Freezes the backend into an `asrbox-server` sidecar.
2. Copies the platform ffmpeg/ffprobe binaries into Tauri resources.
3. Produces the `.app` and `.dmg` under `tauri/src-tauri/target/release/bundle/`.

Expected DMG path on Apple Silicon:

```text
tauri/src-tauri/target/release/bundle/dmg/ASRbox_0.1.0_aarch64.dmg
```

## GitHub Releases

ASRbox includes an MVP Release CI workflow:

```text
.github/workflows/release.yml
```

Trigger it by pushing a tag:

```bash
git tag v0.1.0
git push origin main --tags
```

You can also run the `Release` workflow manually from GitHub Actions and enter a tag such as `v0.1.0`.

The current workflow builds the macOS Apple Silicon DMG on a macOS runner, creates a GitHub Release, and uploads:

- `ASRbox_*.dmg`
- `SHA256SUMS.txt`

Note: the MVP package is not signed or notarized yet. macOS may warn that the developer cannot be verified when the app is opened for the first time.

## Tests

Core checks:

```bash
npm run typecheck
npm run build:web
```

Backend tests:

```bash
npm run test:backend
npm run test:backend:contract
npm run test:backend:server
npm run test:backend:binary-smoke
```

Tauri checks:

```bash
cd tauri/src-tauri
cargo check
cargo test
```

Before publishing a desktop artifact, also verify:

- Double-click launch from the generated `.app`.
- Backend starts automatically without a manually running server.
- `http://127.0.0.1:17494/health` reports ASRbox health after launch.
- ffmpeg and ffprobe show as available in runtime diagnostics.
- MP4 preflight succeeds.
- TXT/SRT/VTT/ASS/JSON/MD exports save to the configured download location.
- Closing the desktop app releases port `17494`.

## Configuration

Desktop-only preferences are stored in the Web UI local storage and Tauri app data directories.

Useful locations:

- Backend data: Tauri app data directory in desktop builds.
- Default exports: `~/Downloads/ASRbox Exports`.
- Custom exports: set in `Settings -> General -> Download location`.
- Local model files: backend data directory under `models/`.
- Diagnostics and generated files: backend data directory.

Environment variables used by the backend:

- `ASRBOX_DATA_DIR`: backend data root.
- `ASRBOX_FFMPEG_PATH`: explicit ffmpeg binary path.
- `ASRBOX_FFPROBE_PATH`: explicit ffprobe binary path.

## Troubleshooting

### Backend is offline

- In desktop mode, click `Start backend` once to retry the sidecar.
- Check whether another process is using port `17494`.
- Restart the app if the previous backend process did not exit cleanly.

### ffmpeg is missing

- Desktop builds should use bundled ffmpeg/ffprobe automatically.
- In development, install ffmpeg locally or provide binaries under `third_party/ffmpeg/darwin-arm64/`.
- Open `Settings -> Storage and diagnostics` to inspect detected tool paths and versions.

### Downloads do not appear

- Check `Settings -> General -> Download location`.
- If no custom location is set, ASRbox writes exports to `~/Downloads/ASRbox Exports`.
- If a file already exists, ASRbox appends a numeric suffix instead of overwriting it.

### Qwen3-ASR fails to load

The Qwen3-ASR integration depends on Transformers support for the model class. If the installed Transformers version does not include the required module, the backend will report a model load error. Update the backend Python dependencies before treating it as a frontend issue.

## Contributing

Keep changes small and testable:

1. Open an issue or describe the behavior change.
2. Add or update tests for backend behavior when possible.
3. Run typecheck and the relevant backend/Tauri checks.
4. Keep desktop packaging changes isolated from unrelated Web UI refactors.

## License

ASRbox is released under the MIT License. See [LICENSE](LICENSE).
