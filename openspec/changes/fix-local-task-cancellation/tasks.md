## 1. Supervised Local Execution

- [x] 1.1 Add an internal local-transcription worker mode with atomic private result files
- [x] 1.2 Run local model work in a supervised child process and terminate it on task cancellation
- [x] 1.3 Split longer local media into bounded chunks, persist completed-chunk progress, and filter overlap output
- [x] 1.4 Prefer supported CUDA or Apple MPS execution for Transformers Whisper before CPU fallback

## 2. User Workflow

- [x] 2.1 Add a confirmed stop action for active tasks on the primary transcription workspace
- [x] 2.2 Keep cancellation pending, success, error, and refreshed queue states clear and accessible

## 3. Regression Coverage

- [x] 3.1 Add backend tests proving cancellation terminates local work and releases the next queued task
- [x] 3.2 Add worker protocol, chunk progress, overlap, and device-selection tests
- [x] 3.3 Add frontend coverage for the transcription-workspace stop action
- [x] 3.4 Increase the bounded backend cold-start CI test budget while preserving failure diagnostics

## 4. Verification

- [x] 4.1 Validate the OpenSpec change strictly and run focused backend/frontend tests
- [x] 4.2 Run typecheck, Web build, full backend tests, contract tests, and maintained open-source gates
- [ ] 4.3 Push the repair to main and confirm the replacement GitHub Actions run passes
