# transcription-lifecycle Specification Delta

## MODIFIED Requirements

### Requirement: Recoverable task lifecycle

The system SHALL expose enough persisted task, import, chunk, log, diagnostic, and active-work state to recover or retry supported interrupted and failed workflows without corrupting completed results. A failed media import SHALL remove only its managed partial destination and SHALL NOT modify or delete the selected source file. 经由托管复制摄取的任务 SHALL 在复制完成前暴露 `importing` 状态；引用原文件的任务 SHALL 直接入队，没有 `importing` 阶段。

Retry, retranscription, or deletion of a task in an active status SHALL be rejected with a conflict response instead of re-queueing or removing it, so a task never executes twice concurrently and active work is never deleted mid-flight; deleting an active task SHALL require cancellation first. A task worker SHALL contain unexpected execution errors: the affected task becomes `failed` with a diagnostic, the worker survives, and queued tasks continue without restarting the application. Storage cleanup of chunk artifacts SHALL skip chunks belonging to active tasks.

#### Scenario: Recoverable work is interrupted

- **WHEN** the application restarts or a retryable chunk fails
- **THEN** the user can identify and resume or retry the supported work from its recorded state

#### Scenario: Managed import fails

- **WHEN** cloning or copying a desktop source into managed storage fails
- **THEN** the task fails with an import-stage diagnostic, its incomplete destination is removed, and the original source remains unchanged

#### Scenario: 重试时被引用的源文件缺失

- **WHEN** 重试或重转写需要的媒体，其外部引用源文件已不存在
- **THEN** 任务以明确的源缺失状态失败，并保留其已完成的结果与记录的路径

#### Scenario: Retry or retranscribe an active task

- **WHEN** a retry or retranscribe request targets a task in an active status
- **THEN** the request fails with a conflict response and the running execution continues untouched as the only execution of that task

#### Scenario: Delete an active task

- **WHEN** a delete request targets a task in an active status
- **THEN** the request fails with a conflict response, no files or rows are removed, and the user can cancel the task before deleting it

#### Scenario: Worker survives an unexpected execution error

- **WHEN** running a task raises an error that escapes the normal failure handling
- **THEN** the task is marked `failed` with a diagnostic, the worker keeps processing the queue, and later tasks complete without an application restart

#### Scenario: Chunk cleanup spares active tasks

- **WHEN** storage cleanup deletes chunk artifacts while a task is active
- **THEN** only chunks of terminal or untracked tasks are removed and the active task keeps its chunk state

### Requirement: Cancellable local execution

ASRbox SHALL terminate the active local inference execution when its task is cancelled, SHALL NOT persist a cancelled result, and SHALL release the local worker so subsequent queued tasks can continue without restarting the application. Cancellation SHALL be checked across all pipeline stages, including before and after speaker diarization and before the final completion commit, so a cancelled task is never committed as completed.

#### Scenario: User cancels a running local task

- **WHEN** a local transcription is inside model inference and the user confirms cancellation
- **THEN** the inference process terminates, the task remains cancelled without transcript output, and the next queued local task can start

#### Scenario: User cancels during diarization or post-processing

- **WHEN** a task is cancelled while diarization or post-processing is in progress
- **THEN** the pipeline stops at the next stage boundary and the task finishes in the cancelled state rather than being committed as completed
