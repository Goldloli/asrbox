# transcription-lifecycle Specification

## Purpose
规定转写任务生命周期：创建前校验、结果真实性、可恢复的中断与重试、可选后处理隔离、可取消的本地执行、基于工作量的进度，以及 Transformers 加速设备选择。
## Requirements
### Requirement: Validated task creation
ASRbox SHALL validate the selected transcription backend, local model or enabled online provider, and accepted media constraints before treating a transcription task as valid. Desktop local-path ingestion SHALL be available only to the desktop sidecar and SHALL expose an importing task before managed media copying completes; Web media transfer SHALL expose truthful client-side upload progress.

#### Scenario: Invalid transcription selection
- **WHEN** a request lacks a usable model or enabled provider for its selected backend
- **THEN** the request fails explicitly without reporting a successful transcription

#### Scenario: Desktop starts a large local file
- **WHEN** the desktop user starts transcription for a local media path
- **THEN** one task is created without loopback media upload, import progress becomes observable, and preprocessing starts only after an atomic managed copy exists

#### Scenario: Web uploads media
- **WHEN** a Web client starts transcription with a multipart media file
- **THEN** the client shows upload progress and does not perform an additional automatic preflight upload

#### Scenario: Desktop path API is called outside desktop mode
- **WHEN** a Web or Docker client attempts to submit a server filesystem path
- **THEN** the backend rejects the path operation without disclosing host filesystem contents

### Requirement: Truthful task outcome
A completed transcription SHALL contain the actual provider or local-engine result; missing engines, provider failures, empty invalid output, cancellation, and runtime failures SHALL remain explicit non-success states.

#### Scenario: Transcription engine fails
- **WHEN** the selected engine cannot produce a valid result
- **THEN** the task exposes a diagnosable failure and does not fabricate transcript text

### Requirement: Recoverable task lifecycle
The system SHALL expose enough persisted task, import, chunk, log, diagnostic, and active-work state to recover or retry supported interrupted and failed workflows without corrupting completed results. A failed media import SHALL remove only its managed partial destination and SHALL NOT modify or delete the selected source file. 经由托管复制摄取的任务 SHALL 在复制完成前暴露 `importing` 状态；引用原文件的任务 SHALL 直接入队，没有 `importing` 阶段。

#### Scenario: Recoverable work is interrupted
- **WHEN** the application restarts or a retryable chunk fails
- **THEN** the user can identify and resume or retry the supported work from its recorded state

#### Scenario: Managed import fails
- **WHEN** cloning or copying a desktop source into managed storage fails
- **THEN** the task fails with an import-stage diagnostic, its incomplete destination is removed, and the original source remains unchanged

#### Scenario: 重试时被引用的源文件缺失
- **WHEN** 重试或重转写需要的媒体，其外部引用源文件已不存在
- **THEN** 任务以明确的源缺失状态失败，并保留其已完成的结果与记录的路径

### Requirement: Optional post-transcription isolation
Optional analysis or post-processing SHALL NOT make a successful base transcription depend on an external or failure-prone service unless a future approved spec explicitly changes that behavior.

#### Scenario: Optional processing fails
- **WHEN** an optional post-transcription operation fails
- **THEN** the successful base transcript and its existing versions remain usable

### Requirement: Cancellable local execution
ASRbox SHALL terminate the active local inference execution when its task is cancelled, SHALL NOT persist a cancelled result, and SHALL release the local worker so subsequent queued tasks can continue without restarting the application.

#### Scenario: User cancels a running local task
- **WHEN** a local transcription is inside model inference and the user confirms cancellation
- **THEN** the inference process terminates, the task remains cancelled without transcript output, and the next queued local task can start

### Requirement: Work-based local progress
ASRbox SHALL derive local transcription progress from lifecycle stages and completed bounded audio chunks rather than incrementing a percentage solely from elapsed wall-clock time.

#### Scenario: Local inference is slower than expected
- **WHEN** a local model spends an extended period processing the current audio chunk
- **THEN** the interface does not advance to an invented near-complete percentage and later progress advances when bounded work completes

### Requirement: Accelerated Transformers selection
On a supported runtime, Transformers Whisper SHALL use an available maintained acceleration device before falling back to CPU and SHALL expose failures instead of silently reporting acceleration that was not used.

#### Scenario: Apple MPS is available
- **WHEN** Transformers Whisper starts on a compatible Apple Silicon desktop runtime
- **THEN** the model pipeline selects MPS rather than forcing CPU execution

