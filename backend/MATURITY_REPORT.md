# ASRbox Backend Maturity Report

Assessment date: 2026-07-13

Target: public-beta backend on macOS Apple Silicon

Current assessment: 96/100

## Verification Gates

| Gate | Command / Evidence | Current result |
| --- | --- | --- |
| Python compilation | `.venv/bin/python -m compileall backend` | Passed |
| Backend API/unit suite | `npm run test:backend` | Passed: 81 tests |
| TypeScript | `npm run typecheck` | Passed |
| Web production build | `npm run build:web` | Passed |
| API contract | `npm run test:backend:contract` | Covered by backend suite; focused command available |
| Frozen backend | `npm run test:backend:binary-smoke` | Passed against the packaged sidecar |
| Rust | `cargo check --locked` and `cargo test --locked` | Passed |
| Browser smoke | `npm run test:e2e:smoke` | Passed |
| Model controls UI | `playwright test app/e2e/models-download-controls.spec.ts` | Passed |
| Real local models | Real MP4 excerpt on Apple Silicon | Passed: 14/14 with non-empty text and segments |
| Desktop artifacts | `.app` launch, frozen transcription, DMG integrity | Passed locally |

`npm run check:open-source` is the maintained aggregate local gate. The network dependency audit is run separately and enforced in CI/Release.

## Current Capabilities

- Ordered Hugging Face and ModelScope source candidates with installed-source markers.
- Managed download queue with progress, pause, resume, stop, retry, redownload, and deletion.
- Cooperative download checkpoints and disabled Hugging Face Xet for controllable transfers.
- Duplicate PyTorch/FP32 weight filtering for accepted runtime model downloads.
- Complete-model detection that ignores stale `.incomplete` files inside the internal Hugging Face `.cache`.
- Storage API with model root, per-model bytes, used bytes, and free/total filesystem capacity.
- Compatibility verification before local transcription.
- Transformers Whisper and Qwen3-ASR audio decoding through `librosa`, avoiding a packaged TorchCodec dependency.
- Faster Whisper, MLX Whisper, FunASR/SenseVoice, Transformers Whisper, and Qwen3-ASR runtime paths.
- Task queue recovery, resumable failures, chunk state, diagnostics, logs, quality data, and transcript version history.
- Retranscribe/edit/postprocess/restore audit versions and six export formats.
- Frozen backend version reporting, parent-process watchdog, loopback token, and bundled ffmpeg/ffprobe resolution.
- Bounded upload size, batch count, and batch total size.

## Real-Model Matrix

The maintained registry contains:

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

On 2026-07-13 all 14 completed transcription of the same short real MP4 excerpt in the maintainer's macOS Apple Silicon environment. Runtime per model was approximately 2–16 seconds after model availability, and every result contained text and segments.

This is a local compatibility matrix, not a CI promise. Model downloads are large, upstream repositories can change, and the test media cannot be redistributed. The existing reproducible test harness remains under `backend/real_tests/`.

## Public-Beta Boundaries

- Only macOS Apple Silicon packaging is maintained.
- DMGs are not signed or notarized.
- Models are downloaded after installation and can require substantial disk, RAM, and network bandwidth.
- Pause state is process-local; quitting stops the worker, while reusable downloaded files remain.
- Real-model tests are not part of default CI.
- Provider credentials are plaintext in `asrbox.db` and backups.
- The loopback token is not protection against malicious software running as the same OS user.
- Accuracy, diarization, word timestamps, and language support vary by model.

## Remaining Work for a Stable Release

- Add Developer ID signing and Apple notarization.
- Protect provider secrets with the platform credential store and define migration/backup behavior.
- Add a redistributable licensed media fixture or opt-in CI environment for repeatable packaged real-model smoke tests.
- Add Windows and Linux runtime/packaging matrices before claiming cross-platform support.
- Add automatic update design, rollback, and signed update metadata.
- Continue measuring long-media memory, cancellation latency, disk cleanup, and model-source drift.

These items do not block an explicitly labeled public beta, but signing and credential storage are high priority before a stable `1.0` claim.
