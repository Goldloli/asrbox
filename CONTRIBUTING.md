# Contributing to ASRbox

Thanks for helping improve ASRbox. This project is a local-first ASR workbench with a Web UI, FastAPI backend, and Tauri desktop app. Keep changes focused, tested, and easy to review.

## Development Setup

```bash
bun install
python -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Run the app in development:

```bash
npm run dev:server
npm run dev:web
npm run dev:desktop
```

## Branches and Commits

- Use short feature branches such as `feature/model-settings`, `fix/desktop-startup`, or `docs/release-notes`.
- Prefer Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`, `refactor:`.
- Keep commits reviewable. Do not mix product behavior, formatting, and docs churn in one change.

## Pull Request Checklist

Before opening a PR:

```bash
npm run typecheck
npm run build:web
npm run test:backend
cd tauri/src-tauri && cargo check && cargo test
```

Also verify the affected workflow manually when the change touches:

- Desktop startup or packaging.
- Backend sidecar lifecycle.
- ffmpeg/ffprobe paths.
- Local model loading or downloads.
- Export formats or task storage.

## What Not to Commit

Do not commit:

- `.venv/`, `node_modules/`, `dist/`, `build/`, Tauri target output, or generated binaries.
- Test audio/video files unless they are intentionally small fixtures.
- Model files, model caches, private tokens, API keys, or local app data.

## Third-Party Dependencies

If a change adds or vendors a dependency, update `THIRD_PARTY_NOTICES.md` and mention any license impact in the PR.
