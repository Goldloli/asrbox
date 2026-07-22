## Context

Local transcription currently runs inside the backend's only local worker thread. The cancellation endpoint records `cancelled`, but Python cannot safely interrupt a model call executing native Torch/MLX/CTranslate2 code, so the thread and worker slot remain occupied. A second local task therefore stays queued until the cancelled inference eventually returns. The same path advances progress from 60 to 88 on a timer, independent of processed audio.

The desktop and Docker runtimes both use the same backend service and need cancellation that releases compute without terminating unrelated provider or proofreading work. Packaged desktop execution uses a PyInstaller onedir server, while development and Docker use `python -m backend.server`.

## Goals / Non-Goals

**Goals:**

- Terminate the actual local inference process when a running task is cancelled.
- Release the local queue slot promptly so the next task can start.
- Preserve the existing `/tasks/{id}/cancel` contract and cancelled-result isolation.
- Report progress from completed bounded audio chunks instead of elapsed synthetic ticks.
- Expose the stop action in the primary transcription workspace.
- Use a maintained GPU device for Transformers Whisper when available.
- Remove the observed cold-runner CI flake without hiding backend startup failures.

**Non-Goals:**

- Pausing and resuming inside a model inference operation.
- Persisting a loaded model across separate task processes.
- Automatically retrying a cancelled task or retaining a partial transcript from it.
- Changing online provider or LLM proofreading cancellation behavior.

## Decisions

### Supervise local inference in a child process

The backend SHALL launch the same server executable in an internal local-worker mode for each local task. Development and Docker invoke `python -m backend.server`; a frozen desktop build invokes its current executable. A private request/result file protocol below the application cache carries model, audio-chunk, options, progress, results, and sanitized failure state.

The parent worker polls this process and terminates it when `task_runtime` records cancellation. This releases native model compute and lets the existing queue worker return normally. Running inference in another thread was rejected because native extension calls cannot be interrupted safely. Restarting the whole backend was rejected because it would interrupt unrelated provider and proofreading work.

### Bound local work and derive progress from completed chunks

Local media longer than two minutes SHALL be split into two-minute chunks with a short overlap before launching the child. The child loads the selected model once, processes all chunks sequentially, and atomically publishes completed chunk results. The parent maps completed chunks into persisted chunk progress and task progress. Overlap output is filtered at the previous chunk boundary before final segment assembly.

Short media remains one inference operation and displays its stage progress until completion. The timer that increments every five seconds to 88 SHALL be removed.

### Preserve an inline test seam

Focused service tests that replace the local transcriber SHALL use an explicit inline-test environment switch. Production desktop, Docker, and normal development execution default to the supervised process path. Worker protocol behavior and cancellation receive dedicated tests rather than relying only on mocked queue tests.

### Select the best supported Transformers device

Transformers Whisper SHALL prefer CUDA, then Apple MPS, then CPU, with half precision only on supported accelerated devices. This decision affects only the Transformers Whisper engine; MLX and Faster Whisper keep their own runtime selection.

### Keep the existing API and add controls at the consumer

The cancellation route and response schema remain stable. The transcription workspace adds a confirmed stop command for the selected active task and disables it while the request is pending. Existing task-workbench cancellation continues to use the same endpoint.

### Use a bounded but realistic CI cold-start budget

The subprocess startup-recovery test SHALL wait up to 60 seconds, continue to fail immediately if the process exits, and include captured output on timeout. This accommodates dependency import variance on fresh hosted macOS runners without weakening the recovery assertions.

## Risks / Trade-offs

- [Each task reloads its selected model] -> Accept the startup cost to gain reliable process termination and deterministic memory release; future work may introduce a persistent supervised model worker with IPC.
- [Chunk boundaries can duplicate or omit words] -> Use a short overlap, timestamp-offset segments, and filter overlap output against the prior boundary; retain focused long-audio tests.
- [Worker result files contain transcript text briefly] -> Store them only under the private application cache and delete the worker directory in a `finally` block.
- [Termination differs across operating systems] -> Use `terminate`, bounded wait, then `kill`, and test command construction for source and frozen execution.
- [Unexpected worker death] -> Record a diagnosable local-transcription failure with a bounded stderr excerpt and never persist a partial result as completed.

## Migration Plan

No schema migration is required. Existing queued, cancelled, completed, and interrupted rows retain their meanings. Rollback restores in-process inference; no persisted worker protocol files are required after a task ends.

## Open Questions

None for this repair. Persistent cross-task model workers and resumable partial local transcripts remain possible later optimizations.
