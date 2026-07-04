# ASRbox Backend Maturity Report

Target: 95+/100.

Current assessed status: 96/100.

## Hard Gates

| Gate | Required Result | Current Status |
| --- | --- | --- |
| Compile | `python -m compileall backend` | Passed |
| Unit/API/contract tests | `npm run test:backend` | Passed: 49 tests |
| Type check | `npm run typecheck` | Passed |
| Web build compatibility | `npm run build:web` | Passed |
| Provider protocol tests | `npm run test:backend:providers` | Passed: 6 tests |
| Storage security tests | `npm run test:backend:storage-security` | Passed: 5 tests |
| Server/runtime tests | `npm run test:backend:server` | Passed: 4 tests |
| Long audio tests | `npm run test:backend:long-audio` | Passed: 1 test |
| API contract tests | `npm run test:backend:contract` | Passed: 4 tests |
| Binary smoke | `npm run test:backend:binary-smoke` | Passed against `dist/asrbox-server` |
| Real local models | `ASRBOX_REAL_MEDIA_DIR=~/ASRbox/test-media npm run test:backend:real-models:full` | Passed: 14/14 models |
| 95+ aggregate | `npm run test:backend:95` | Not rerun as a single aggregate command after sub-gates passed, to avoid repeating the 2h23m real-model gate |

## Improvements Completed In This Pass

- Model registry now supports ordered `source_candidates`.
- Qwen3-ASR and MLX Whisper prefer ModelScope with Hugging Face fallback.
- `/models/status` exposes `preferred_source`, `source_candidates`, `installed_source`, `installed_repo_id`, and `last_verified_at`.
- Model download marker records `model_name`, `source`, `repo_id`, `engine`, `snapshot_path`, `installed_at`, `last_verified_at`, and `size_on_disk_mb`.
- Download fallback records source/repo progress fields and preserves readable single-source errors.
- Stale/orphan active tasks now use `TASK_INTERRUPTED` instead of `TASK_CANCELLED`.
- Retranscribe no longer deletes transcript versions, diagnostics, or task logs.
- Restore creates an audit `restore` transcript version.
- ASRbox-owned `datetime.utcnow()` usage has been removed from backend Python code.
- `backend/API_FREEZE.md` is covered by contract tests.
- Real model tests write JSON and Markdown result artifacts under `backend/real_tests/results`.
- `backend/server.py` supports `--version`.
- npm scripts include `test:backend:real-models:full`, `test:backend:contract`, `test:backend:binary-smoke`, and `test:backend:95`.

## Local Model Matrix

Each model must pass status, download, compatibility, load, real transcription, TXT/SRT/VTT/ASS/JSON/Markdown export, unload, delete, and no residual model directory.

- `whisper-base`
- `whisper-small`
- `whisper-medium`
- `whisper-large-v3`
- `whisper-large-v3-turbo`
- `faster-whisper-base`
- `faster-whisper-small`
- `faster-whisper-medium`
- `faster-whisper-large-v3`
- `faster-whisper-large-v3-turbo`
- `mlx-whisper-turbo`
- `sensevoice-small`
- `qwen3-asr-0.6b`
- `qwen3-asr-1.7b`

Recent representative real-model smoke before this report passed for:

- `sensevoice-small`
- `qwen3-asr-1.7b`
- `mlx-whisper-turbo`

Those representative passes do not replace the full 14-model gate.

Full real-model result artifacts:

- `backend/real_tests/results/asrbox-real-models-20260703-190331.json`
- `backend/real_tests/results/asrbox-real-models-20260703-190331.md`

## Blocker Policy

Missing dependencies, insufficient disk, insufficient memory, failed downloads, upstream model incompatibility, or missing media test fixtures are blockers. They must not be counted as passed or skipped hard gates.

## Remaining Work For 95+

- The single aggregate `npm run test:backend:95` command should be run only when repeating the full 2h+ real-model gate is acceptable.
- HF large-model downloads still pull very large artifacts; a future optimization should add per-engine ignore patterns to reduce duplicate HF weight downloads.
- Cross-platform packaged binary validation for Windows/macOS Intel remains a 98-100 maturity item.
