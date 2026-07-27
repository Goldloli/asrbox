## MODIFIED Requirements

### Requirement: Recoverable task lifecycle

The system SHALL expose enough persisted task, import, chunk, log, diagnostic, and active-work state to recover or retry supported interrupted and failed workflows without corrupting completed results. A failed media import SHALL remove only its managed partial destination and SHALL NOT modify or delete the selected source file. 经由托管复制摄取的任务 SHALL 在复制完成前暴露 `importing` 状态；引用原文件的任务 SHALL 直接入队，没有 `importing` 阶段。

Retry, retranscription, deletion, or transcript mutation of a task in an active status SHALL be rejected with a conflict response instead of re-queueing, removing, or overwriting it, so a task never executes twice concurrently and active work retains one writer; deleting an active task SHALL require cancellation first. Concurrent terminal-state requests SHALL be linearized so at most one retry or retranscription can transition and enqueue the same task. A task worker SHALL contain unexpected execution errors: the affected task becomes `failed` with a diagnostic, the worker survives, and queued tasks continue without restarting the application. If a worker thread itself exits, its count SHALL be reclaimed and a replacement SHALL be started while the configured target still requires one. Storage cleanup of chunk artifacts SHALL skip chunks belonging to active tasks.

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

#### Scenario: Concurrent retry of a terminal task

- **WHEN** two requests concurrently retry or retranscribe the same terminal task
- **THEN** exactly one request transitions and enqueues it while the other receives a conflict response

#### Scenario: Delete an active task

- **WHEN** a delete request targets a task in an active status
- **THEN** the request fails with a conflict response, no files or rows are removed, and the user can cancel the task before deleting it

#### Scenario: Worker survives an unexpected execution error

- **WHEN** running a task raises an error that escapes the normal failure handling
- **THEN** the task is marked `failed` with a diagnostic, the worker keeps processing the queue, and later tasks complete without an application restart

#### Scenario: Worker thread exits

- **WHEN** a task worker exits outside the normal per-task exception path while its configured queue still requires workers
- **THEN** its live count is decremented and a replacement worker becomes available without restarting the application

#### Scenario: Chunk cleanup spares active tasks

- **WHEN** storage cleanup deletes chunk artifacts while a task is active
- **THEN** only chunks of terminal or untracked tasks are removed and the active task keeps its chunk state

#### Scenario: All failed chunks recover

- **WHEN** every failed chunk of one task succeeds through the retry-all action
- **THEN** the task clears its stale error, becomes completed, and persists exactly one final retranscription version after all chunks are complete
