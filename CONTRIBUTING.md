# Contributing to ASRbox

ASRbox is a local-first ASR workbench with a React Web UI, FastAPI backend, and Tauri desktop app. The current supported release target is macOS Apple Silicon.

## Before You Start

- Search existing issues and describe the user-visible behavior you want to change.
- Keep each change focused. Separate product behavior, dependency updates, broad formatting, and unrelated refactors.
- Do not upload private media, transcripts, diagnostic archives, credentials, or downloaded model weights.
- For large behavior or architecture changes, open an issue before investing in implementation.

## Development Setup

The locked environment targets Bun `1.3.8`, Python `3.13`, macOS Apple Silicon, and stable Rust.

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

Development needs ffmpeg and ffprobe. Use a system installation or the verified binaries in `third_party/ffmpeg/darwin-arm64/`.

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

It covers Python package health and compilation, version and release tooling, third-party FFmpeg verification, TypeScript, Web build, backend tests, Cargo checks/tests, and the browser smoke test.

Additional focused commands:

```bash
npm run typecheck
npm run build:web
npm run test:backend
npm run test:backend:contract
npm run test:backend:server
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

Backend behavior changes should include tests that fail without the fix. API changes must update `backend/API_FREEZE.md` and contract tests when they affect a stable route or field.

## Dependencies and Third-Party Code

- Python runtime changes start in the relevant `requirements-*.in` file and include updated macOS Apple Silicon / Python 3.13 lock snapshots. Do not edit only `requirements.txt`.
- Frontend dependency changes must update `bun.lock` and pass the dependency audit.
- Vendored or bundled software changes must update `THIRD_PARTY_NOTICES.md` and any source, license, or checksum records.
- New model entries must document the upstream repository, license, estimated disk size, runtime, and redistribution constraints.

## Do Not Commit

- `.venv/`, `node_modules/`, Web build output, PyInstaller output, Tauri `target/`, DMGs, or generated binaries.
- Model files, Hugging Face/ModelScope caches, access tokens, or app data.
- Real user audio/video, private transcripts, local database files, backups, or unredacted diagnostics.
- API keys, secrets, signing credentials, or notarization credentials.

Small fixtures are acceptable only when intentionally licensed, minimal, and necessary for an automated test.

## Reporting Security Issues

Do not use a public issue for sensitive vulnerabilities. Follow [SECURITY.md](SECURITY.md).
