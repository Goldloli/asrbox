![ASRbox demo](assets/asrbox-demo.gif)

# ASRbox

[中文](README.md) | English

ASRbox is a local-first audio/video transcription and subtitle workspace. It turns media into editable subtitles with local or online ASR, recoverable tasks, immutable transcript history, multiple export formats, and LLM-powered checks for typos, omissions, and obvious recognition errors.

## Status

The current source version is `0.1.2-rc.1`. It is suitable for evaluation and feedback, not a stable release.

| Runtime | Supported scope |
| --- | --- |
| macOS desktop | Apple Silicon, Tauri 2 with a bundled FastAPI sidecar |
| Docker Web | Linux CPU container, same-origin UI/API, persistent `/data` |
| Native Windows/Linux desktop | Not available |
| Signing, notarization, auto-update | Not available |
| Model weights | Downloaded on demand; not included in the DMG or image |

Keep originals of important media and back up before upgrades. Provider secrets are currently stored in local SQLite rather than an OS keychain. Docker binds to host loopback by default and must not be exposed directly to the public Internet.

## Highlights

- Preflight and transcribe one or many audio/video files.
- Use Whisper, Faster Whisper, MLX Whisper, SenseVoice, Qwen3-ASR, or an online ASR provider.
- Pause, resume, stop, retry, and remove model downloads while inspecting compatibility and storage.
- Search, replace, edit, play, and copy transcript content.
- Preserve transcription, retranscription, manual edit, restore, post-processing, and AI-applied versions.
- Export TXT, SRT, VTT, ASS, JSON, and Markdown.
- Configure Ollama, MiniMax, Kimi, DeepSeek, Qwen, GLM, or another OpenAI-compatible LLM.
- Review suggestions in the dedicated AI workspace; only explicitly selected suggestions create a new subtitle version.

### LLM proofreading

Connect Ollama or any OpenAI-compatible LLM to automatically check subtitles for typos, omissions, and obvious recognition errors, with ready-to-apply fix suggestions:

![LLM proofreading demo](assets/asrbox-llm-proofread.gif)

## Docker deployment

Docker Engine 24+ and Docker Compose v2 are required. Allow at least 8 GB RAM and 15 GB free space; larger models need more.

```bash
git clone https://github.com/Goldloli/asrbox.git
cd asrbox
cp .env.example .env
docker compose up -d --build
```

Open [http://127.0.0.1:17494](http://127.0.0.1:17494). Inspect the service with:

```bash
docker compose ps
docker compose logs -f asrbox
```

The `asrbox-data` volume contains the database, media, transcripts, settings, models, and caches. `docker compose down` preserves it; `docker compose down -v` permanently removes it.

Models and Hugging Face, ModelScope, and Torch caches can be moved as one storage root from Settings > Storage and diagnostics. Desktop can select a local or mounted removable disk. Docker operators must first mount a host directory in `compose.yaml` and declare its container mount point with `ASRBOX_MODEL_STORAGE_ROOTS`; the Web UI displays container paths only. See the [Docker guide](docs/docker.en.md) for configuration and recovery.

For a phone or another trusted LAN device, set these values in `.env`:

```dotenv
ASRBOX_BIND_ADDRESS=0.0.0.0
ASRBOX_API_TOKEN=a-long-random-value-from-openssl-rand-hex-32
```

Restart, open `http://HOST_LAN_IP:17494`, and enter the same token under Settings → General → API token. ASRbox has no built-in TLS, multi-user accounts, or role authorization. Outside a trusted LAN, use a trusted VPN or an authenticated HTTPS reverse proxy.

See the [Docker guide](docs/docker.en.md) for upgrades, backups, Ollama connectivity, removal, and troubleshooting.

## macOS desktop

Download the Apple Silicon DMG from the [`v0.1.2-rc.1` Release](https://github.com/Goldloli/asrbox/releases/tag/v0.1.2-rc.1) and verify `SHA256SUMS.txt`. The package is unsigned and unnotarized, so first launch requires right-clicking the app and choosing Open, or allowing it under System Settings → Privacy & Security.

Desktop starts its bundled backend on `127.0.0.1:17494` with a per-launch in-memory API token. Removing the app does not remove tasks, models, or backups.

## First transcription

1. Download a model. Apple Silicon desktop users can start with `mlx-whisper-turbo`; Docker users should start with `faster-whisper-base` or `faster-whisper-small`.
2. Select media under New Transcription.
3. Choose a local model or online platform and configure language, timestamps, and chunking.
4. Follow progress, logs, and results under Tasks.
5. Edit or export SRT, VTT, ASS, TXT, JSON, or Markdown.

ASRbox registers 14 local models. Docker is a Linux CPU runtime and does not support Apple-only MLX; the Models page marks MLX as incompatible and blocks its download. See the [model guide](docs/models.md).

## AI subtitle proofreading

1. Add and test a provider under Settings → AI LLM providers.
2. Ollama needs no API key. From Docker, connect to host Ollama at `http://host.docker.internal:11434/v1`.
3. Open AI and select a completed task with a subtitle version.
4. Select the provider and start Subtitle proofreading.
5. Suggestions are expanded; correct neighboring ranges remain individually collapsible.
6. Select the suggestions to apply. Applying creates a new version; unselected suggestions never change the transcript.

Connection, authentication, server, context-length, and malformed-response failures have distinct feedback. “No changes needed” appears only after a successful LLM response with no suggestions. LLM failure never invalidates a completed transcription. See the [AI proofreading guide](docs/ai-proofreading.en.md).

## Data and privacy

Desktop data defaults to:

```text
~/Library/Application Support/com.goldloli.asrbox/
```

Docker keeps all managed state under `/data` in the `asrbox-data` volume. Treat backups as sensitive: they may contain media, transcripts, exports, logs, models, and provider credentials.

Local ASR does not send media to an ASR service, although model downloads contact Hugging Face or ModelScope. Online ASR sends media or extracted audio to the selected third party. LLM proofreading sends segment text, identifiers, and limited neighboring context, never audio or file paths; remote LLMs are still third-party processing.

Read [privacy and local data](docs/privacy.md) and the [security policy](SECURITY.md).

## Development

Desktop development uses Bun `1.3.8`, Python `3.13`, stable Rust, and macOS Apple Silicon. Docker has a separate Linux CPU dependency lock.

```bash
bun install
python -m venv .venv
.venv/bin/python -m pip install pip==25.3
.venv/bin/pip install -r requirements-dev.lock
npm run dev:server
npm run dev:web
```

Use `npm run dev:desktop` for Tauri and `npm run build:docker` for the container. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Build and verify

```bash
npm run typecheck
npm run build:web
npm run test:backend
npm run test:e2e:llm
npm run test:docker
npm run check:open-source
```

Build the desktop package with:

```bash
.venv/bin/pip install -r requirements-build.lock
npm run build:desktop
```

The DMG is written under `tauri/src-tauri/target/release/bundle/dmg/`. Real-model tests require legally supplied media and downloaded weights and are not part of default CI.

## Project layout

```text
app/                 Shared React routes, components, state, and UI
web/                 Vite Web entry point
backend/             FastAPI, tasks, ASR, LLM, versions, storage, exports
tauri/               macOS shell and sidecar lifecycle
Dockerfile           Linux CPU single-container build
compose.yaml         Persistent deployment and network defaults
scripts/             Build, test, audit, and release gates
openspec/            Accepted specifications and active changes
third_party/ffmpeg/  Desktop FFmpeg license and source records
```

## Documentation

- [Docker deployment](docs/docker.en.md)
- [AI subtitle proofreading](docs/ai-proofreading.en.md)
- [Model guide](docs/models.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Privacy and local data](docs/privacy.md)
- [Continuous integration](docs/ci.md)
- [Release process](docs/release.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [Changelog](CHANGELOG.md)

## License

ASRbox source is licensed under the [MIT License](LICENSE). FFmpeg, models, Python/JavaScript runtimes, and other third-party components retain their own licenses. Model weights are not redistributed in the repository, DMG, or Docker image.
