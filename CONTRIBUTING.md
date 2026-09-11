# Contributing to ASRbox

ASRbox is a local-first ASR and subtitle workbench with a React Web UI, FastAPI backend, Tauri desktop app, and Linux CPU Docker deployment. The maintained desktop release target is macOS Apple Silicon.

## Before You Start

- Search existing issues and describe the user-visible behavior you want to change.
- Keep each change focused. Separate product behavior, dependency updates, broad formatting, and unrelated refactors.
- Do not upload private media, transcripts, diagnostic archives, credentials, or downloaded model weights.
- Typo, wording, test-maintenance, and unambiguous localized bug fixes may proceed directly when they preserve accepted behavior and maintained contracts.
- New or changed behavior, APIs, persisted data, privacy or security boundaries, dependencies, packaging, architecture, or multiple subsystems require an OpenSpec change under `openspec/changes/` before implementation.
- Read the relevant accepted capability in `openspec/specs/`; for large or uncertain work, discuss the proposal before investing in implementation.

## Development Setup

The desktop development lock targets Bun `1.3.8`, Python `3.13`, macOS Apple Silicon, and stable Rust. Docker has a separate Linux CPU input/lock and does not install MLX.

```bash
bun install
python -m venv .venv
.venv/bin/python -m pip install pip==25.3
.venv/bin/pip install -r requirements-dev.lock
```

Development commands:

```bash
npm run dev:server
npm run dev:web
npm run dev:desktop
```

Container development:

```bash
cp .env.example .env
npm run build:docker
docker compose up -d
npm run test:docker
```

Development needs ffmpeg and ffprobe. Use a system installation or the verified binaries in `third_party/ffmpeg/`: macOS binaries are committed under `darwin-arm64/`; the Windows x64 executables exceed GitHub's file size limit and are fetched once with `scripts/fetch-ffmpeg-windows.sh` (pinned archive, SHA-256 verified).

## Branches and Commits

- Use a short branch such as `fix/model-download`, `feature/export-option`, or `docs/model-guide`.
- Prefer Conventional Commit prefixes: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `build:`, `chore:`, `refactor:`.
- Make each commit reviewable and do not rewrite unrelated files.
- Never force-push `main`.

## Tests

Run the checks relevant to the change. Before requesting merge, run the unified local gate:

```bash
npm run check:open-source
```

It covers Python package health and compilation, version and release tooling, third-party FFmpeg verification, TypeScript, Web build, backend tests, Cargo checks/tests, the browser smoke test, and AI LLM browser regressions. Docker build/runtime smoke is a separate Linux gate because it is substantially more expensive.

Additional focused commands:

```bash
npm run typecheck
npm run build:web
npm run test:backend
npm run test:backend:contract
npm run test:backend:server
npm run test:e2e:llm
npm run test:docker
bunx playwright test app/e2e/models-download-controls.spec.ts
cd tauri/src-tauri && cargo check --locked && cargo test --locked
```

Run the network dependency audit when changing frontend packages:

```bash
npm run audit:dependencies
```

Real-model tests require large predownloaded model files and legally supplied media, so they are not a normal pull-request gate. If a change touches model loading or transcription, report which models and media characteristics you tested without publishing private filenames or content.

## Pull Requests

A pull request should include:

- The problem and observable behavior after the change.
- A concise list of files or subsystems affected.
- Exact automated commands run and their results.
- Manual verification for desktop startup, ffmpeg, model loading/downloads, storage, or exports when affected.
- Security, privacy, model-license, dependency-license, and release impact.
- Screenshots for visible UI changes when useful.

Backend behavior changes should include tests that fail without the fix. Maintained API changes must update the active OpenSpec change, generated OpenAPI and backend models, typed frontend consumers, and contract tests together.

## Dependencies and Third-Party Code

- Python runtime changes start in the relevant `requirements-*.in` file and include updated macOS Apple Silicon / Python 3.13 lock snapshots. Do not edit only `requirements.txt`.
- Docker Python changes start in `requirements-docker.in`, regenerate `requirements-docker.lock` for Linux/Python 3.13, and must not add Apple-only MLX packages.
- Frontend dependency changes must update `bun.lock` and pass the dependency audit.
- Vendored or bundled software changes must update `THIRD_PARTY_NOTICES.md` and any source, license, or checksum records.
- New model entries must document the upstream repository, license, estimated disk size, runtime, and redistribution constraints.
- Container changes must preserve the non-root runtime, loopback Compose default, `/data` volume contract, health check, and same-origin Web behavior.

## Do Not Commit

- `.venv/`, `node_modules/`, Web build output, PyInstaller output, Tauri `target/`, DMGs, or generated binaries.
- Model files, Hugging Face/ModelScope caches, access tokens, or app data.
- Real user audio/video, private transcripts, local database files, backups, or unredacted diagnostics.
- API keys, secrets, signing credentials, or notarization credentials.

Small fixtures are acceptable only when intentionally licensed, minimal, and necessary for an automated test.

## Reporting Security Issues

Do not use a public issue for sensitive vulnerabilities. Follow [SECURITY.md](SECURITY.md).
