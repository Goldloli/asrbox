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

Retry, retranscription, failed-chunk retry, deletion, per-task artifact cleanup, media relink, or transcript mutation of a task in an active status SHALL be rejected with a conflict response instead of re-queueing, removing, relinking, or overwriting it, so a task never executes twice concurrently and active work retains one writer; deleting an active task SHALL require cancellation first. Concurrent terminal-state requests SHALL be linearized so at most one retry, retranscription, or failed-chunk recovery can claim the same task. Failed-chunk recovery SHALL run outside the API event loop, SHALL only execute chunks that are failed when claimed, and SHALL persist exactly one final version only after every chunk is complete. A task worker SHALL contain unexpected execution errors: the affected task becomes `failed` with a diagnostic, the worker survives, and queued tasks continue without restarting the application. If a worker thread itself exits, its count SHALL be reclaimed and a replacement SHALL be started while the configured target still requires one. Storage cleanup of chunk artifacts SHALL skip chunks belonging to active tasks.

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

- **WHEN** two requests concurrently retry, retranscribe, or retry failed chunks for the same terminal task
- **THEN** exactly one request claims the task while the other receives a conflict response

#### Scenario: Retry chunk work remains responsive

- **WHEN** failed-chunk recovery performs slow model inference
- **THEN** unrelated health and API requests remain serviceable while the task exposes one active recovery execution

#### Scenario: Cancel failed-chunk recovery

- **WHEN** the user cancels a task while failed-chunk inference is running
- **THEN** the recovery does not merge a completed transcript version and the task remains cancelled

#### Scenario: Active task artifact mutation is rejected

- **WHEN** cleanup-artifacts or relink targets a task in an active status
- **THEN** the request returns a conflict and no media path, derived file, chunk row, or transcript state changes

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

### Requirement: Optional post-transcription isolation
Optional analysis or post-processing SHALL NOT make a successful base transcription depend on an external or failure-prone service unless a future approved spec explicitly changes that behavior.

#### Scenario: Optional processing fails
- **WHEN** an optional post-transcription operation fails
- **THEN** the successful base transcript and its existing versions remain usable

### Requirement: Cancellable local execution

ASRbox SHALL terminate the active local inference execution when its task is cancelled, SHALL NOT persist a cancelled result, and SHALL release the local worker so subsequent queued tasks can continue without restarting the application. Cancellation SHALL be checked across all pipeline stages, including before and after speaker diarization and before the final completion commit, so a cancelled task is never committed as completed.

#### Scenario: User cancels a running local task

- **WHEN** a local transcription is inside model inference and the user confirms cancellation
- **THEN** the inference process terminates, the task remains cancelled without transcript output, and the next queued local task can start

#### Scenario: User cancels during diarization or post-processing

- **WHEN** a task is cancelled while diarization or post-processing is in progress
- **THEN** the pipeline stops at the next stage boundary and the task finishes in the cancelled state rather than being committed as completed

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

### Requirement: Repetition hallucination guardrails
本地 Whisper 系引擎（faster-whisper、mlx-whisper、transformers-whisper）的转写 SHALL 默认启用防幻觉重复解码：不将上一解码窗口文本作为后续窗口的 prompt，并启用重复抑制参数；任务级选项 SHALL 允许覆盖这些默认值。转写后处理 SHALL 折叠同一 token 的超长连续重复（默认连续 ≥6 次折叠为保留 2 次），且该折叠不得改变 segment 的时间轴与数量。质量报告 SHALL 同时按字符与按词检测重复文本，使英文词级重复也能产生重复警告。

#### Scenario: Whisper 引擎默认阻断重复循环
- **WHEN** 使用 faster-whisper、mlx-whisper 或 transformers-whisper 本地模型转写且任务未显式设置解码覆盖项
- **THEN** 引擎以 `condition_on_previous_text=False` 及重复抑制参数解码，单个 chunk 内不产生跨窗口自我强化的重复文本

#### Scenario: 任务选项可覆盖防幻觉默认值
- **WHEN** 任务选项中显式设置了 `condition_on_previous_text`、`no_repeat_ngram_size`、`repetition_penalty` 或 `hallucination_silence_threshold`
- **THEN** 引擎使用任务提供的值而非内置默认值

#### Scenario: 后处理折叠超长重复
- **WHEN** 任一引擎返回的 segment 文本中同一 token 连续重复达到折叠阈值
- **THEN** 后处理将该重复折叠为保留 2 次，segment 的时间轴、speaker 与数量保持不变

#### Scenario: 短重复不受影响
- **WHEN** segment 文本中同一 token 连续重复次数低于折叠阈值（如正常强调 "very, very"）
- **THEN** 后处理保持原文不变

#### Scenario: 英文词级重复触发质量警告
- **WHEN** 转写文本中某一空格分词后的词占全部词数的比例超过重复阈值
- **THEN** 质量报告暴露 `REPETITIVE_TRANSCRIPT` 警告，与既有中文字符级检测一致

### Requirement: Duration-aware Qwen3-ASR output budget
Qwen3-ASR 本地转写的 `max_new_tokens` 上限 SHALL 默认按输入音频时长自适应（每分钟至少 320 token、下限 1024、上限 8192），不得使用会导致长音频静默截断的固定默认值；任务选项显式设置 `max_new_tokens` 时 SHALL 使用用户提供的值。

#### Scenario: 长音频默认不被截断
- **WHEN** 使用 Qwen3-ASR 转写转写内容超过 512 token 的音频且未显式设置 `max_new_tokens`
- **THEN** 输出按完整转写内容生成，不因固定 512 token 上限在中途截断

#### Scenario: 显式上限优先
- **WHEN** 任务选项显式设置 `max_new_tokens`
- **THEN** 引擎使用该值而非时长自适应默认值

#### Scenario: 上限有界
- **WHEN** 输入音频极长
- **THEN** 默认 `max_new_tokens` 不超过 8192，防止显存与耗时失控

### Requirement: 转写默认值选择

设置页"转写"板块 SHALL 提供默认模型选择器，合并展示可用本地模型与已启用的线上提供商接口供单选；选择本地模型 SHALL 持久化为本地后端加该模型，选择线上接口 SHALL 持久化为提供商后端加该提供商。默认语言 SHALL 支持各可用语言与"自动识别"。转写页初始化 SHALL 套用已保存的默认模型（或线上接口）与默认语言作为初始选中项；默认值失效时 SHALL 安全兜底到可用项，不得停留在无效选择或产生错误状态。转写页内的手动选择 SHALL NOT 回写设置默认值。

#### Scenario: 设置本地模型为默认

- **WHEN** 用户在设置页将某个可用本地模型（如 qwen3-asr）选为默认模型并保存
- **THEN** 设置持久化为本地后端加该模型，下次打开转写页时初始选中该后端与该模型

#### Scenario: 设置线上接口为默认

- **WHEN** 用户在设置页将某个已启用的线上提供商接口选为默认模型并保存
- **THEN** 设置持久化为提供商后端加该提供商，下次打开转写页时初始选中该接口

#### Scenario: 默认语言套用

- **WHEN** 用户在设置页保存默认语言（各语言或"自动识别"）后打开转写页
- **THEN** 转写页初始语言为该默认值

#### Scenario: 默认值失效时安全兜底

- **WHEN** 已保存的默认模型被删除、未下载或不兼容，或默认提供商被删除或禁用
- **THEN** 转写页初始选中兜底到第一个可用模型或已启用提供商，不显示错误状态

#### Scenario: 手动选择不被覆盖

- **WHEN** 用户在转写页手动改动了模型或语言选择
- **THEN** 该选择不被晚到的设置默认值覆盖，且不回写设置

### Requirement: FunASR 新模型的时间戳与 VAD 行为

`paraformer-zh` 与 `fun-asr-nano` 的本地转写 SHALL 默认启用 VAD 长音频切分（含受维护的最大单片时长约束），任务选项 SHALL 允许覆盖该默认值。`paraformer-zh` SHALL 将模型原生字级时间戳聚合为带起止时间的句段时间轴，输出不得退化为无时间轴的整段文本；词级时间戳 SHALL NOT 透出（与目录声明一致）。`fun-asr-nano` 无原生时间戳时 SHALL 以完整文本成功产出结果，且 SHALL NOT 伪造句段时间轴。既有 SenseVoice Small 的转写行为 SHALL 保持不变（不默认启用 VAD 切分、清洗与时间轴产出与现状一致）。

#### Scenario: Paraformer 长音频产出句段时间轴

- **WHEN** 使用 `paraformer-zh` 转写超过单片时长上限的音频且未显式覆盖 VAD 选项
- **THEN** 结果按 VAD 切分转写，句段携带单调、落在音频时长内的起止时间，全文由句段文本组成

#### Scenario: 任务选项覆盖 VAD 默认值

- **WHEN** 任务选项显式设置 VAD 开关或最大单片时长
- **THEN** 引擎使用任务提供的值而非默认值

#### Scenario: Fun-ASR-Nano 不伪造时间轴

- **WHEN** 使用 `fun-asr-nano` 转写音频
- **THEN** 任务成功完成、全文完整，时间轴呈现方式与模型真实输出一致，不出现虚构的句段起止时间

#### Scenario: SenseVoice 行为不回归

- **WHEN** 使用既有 SenseVoice Small 模型转写
- **THEN** 转写行为与本变更前一致：不默认启用 VAD 切分，文本清洗与结果结构与现状相同

### Requirement: speech-LM 引擎的长音频切分与语言约束

对目录条目声明了单条输入时长上限的 speech-LM 模型，本地转写 SHALL 默认经维护的 VAD 切分路径把长音频分为不超过该上限的片段逐块转写并合并结果；句段时间戳与词级时间戳 SHALL 按各块在整条音频中的起点偏移，形成连续正确的整条时间轴。VAD 不可用或切分失败时 SHALL 以可操作的错误状态失败，不得静默截断音频或丢弃尾部内容。

对目录条目声明"需显式语言"的模型，当转写请求未选择语言或语言为 auto 时，任务 SHALL 以机器可读原因码的可操作错误失败并附本地化描述（指引选择具体语言），不得静默替用户猜测语言。

模型输出中带取模回绕的时间标签（如毫秒/厘秒计数溢出回绕）SHALL 正确解回绕后再映射到时间轴，多块结果合并时词级时间轴保持单调。

Qwen3-ASR 与 MOSS-Transcribe-Diarize 模型迁移到统一 speech-LM 引擎后，既有可观察行为 SHALL 保持不变：时长感知的输出预算、重复幻觉护栏、原生说话人标签的产出与保留、以及转写结果契约字段。

#### Scenario: 输入受限模型转写长音频

- **WHEN** 用户用声明单条输入上限的模型（如 30 秒级上限）转写超过上限的长音频
- **THEN** 任务按 VAD 切分逐块完成转写，产出的句段覆盖整条音频且时间轴按块起点正确偏移，不出现内容截断

#### Scenario: 显式语言缺失时失败可理解

- **WHEN** 用户用声明"需显式语言"的模型发起转写且语言未选或为 auto
- **THEN** 任务以机器可读原因码失败，界面按当前语言提示需要选择具体语言，不产出猜测语言的结果

#### Scenario: 回绕时间标签正确解算

- **WHEN** 模型输出的词级时间标签发生取模回绕（标签值小于前一词标签）
- **THEN** 引擎按回绕规则解算真实时间并映射到词级时间轴，合并多块输出后词级时间保持单调不回跳

#### Scenario: 既有模型迁移行为等价

- **WHEN** 用户用 Qwen3-ASR 或 MOSS-Transcribe-Diarize 模型完成转写
- **THEN** 转写结果字段、时长感知输出预算行为、重复幻觉护栏行为与说话人标签保留行为与统一引擎引入前一致，相关既有测试不因迁移而削弱或改写断言语义
