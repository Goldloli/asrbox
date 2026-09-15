# model-management Specification

## Purpose
Defines the local ASR model catalog, its user-facing presentation, the download lifecycle, pre-execution compatibility, the model data boundary, and engine-native speaker diarization behavior.

## Requirements

### Requirement: Registered local model catalog
ASRbox SHALL expose the maintained local model catalog with its engine, source candidates, compatibility facts, storage estimate, licensing guidance, supported inference device families, and truthful distinction between model-file availability and model-storage availability without bundling model weights in the application release. The catalog SHALL include end-to-end speaker-diarization models alongside conventional ASR engines. Device-family metadata SHALL reflect the device-selection paths maintained by each engine, SHALL distinguish CPU, CUDA, MPS, and MLX where applicable, and SHALL NOT represent static GPU support as the device currently active on the user's machine.

The model management UI SHALL present detailed per-model facts: transcription capabilities (timestamps, word timestamps, diarization, streaming), language coverage, supported inference devices, recommended scenarios, and known limitations, so users can choose a model without consulting external documentation. The transcription model selector and model management UI SHALL both provide a compact CPU/GPU support summary, while the model management details SHALL expose the specific accelerator family and explain that the device actually used depends on the current hardware and runtime.

#### Scenario: User selects a local model
- **WHEN** the user views or selects a registered model while model storage is available
- **THEN** the application identifies whether that model is downloaded and compatible in the configured managed model directory

#### Scenario: Model storage is unavailable
- **WHEN** the configured model storage root cannot be accessed
- **THEN** the catalog reports storage unavailable rather than reporting its managed models as not downloaded

#### Scenario: User inspects model details
- **WHEN** the user expands a model's details in the model management UI
- **THEN** the application shows that model's capabilities, language coverage, supported inference devices, recommended scenarios, and known limitations

#### Scenario: User compares devices in the transcription selector
- **WHEN** the user opens the local model selector before starting a transcription
- **THEN** each model option shows whether the model supports CPU, GPU acceleration, or both without claiming that a supported GPU is currently active

#### Scenario: User compares devices before download
- **WHEN** the user views a model list row or recommendation on the model management page
- **THEN** the application shows a compact CPU/GPU summary and makes the model's CUDA, MPS, or MLX accelerator family available in its detailed explanation

#### Scenario: GPU support depends on the current runtime
- **WHEN** a catalog model supports a GPU family that is absent or unavailable on the current machine
- **THEN** the UI keeps the capability label but explains that the actual device depends on current hardware and runtime availability, while existing compatibility and fallback behavior remains authoritative

### Requirement: Controlled model download lifecycle

Managed model downloads SHALL expose progress and supported pause, resume, stop, retry, redownload, and deletion actions with truthful process-local, storage-location, and on-disk state. Deletion SHALL validate that the model name is registered in the maintained catalog and that the resolved target directory remains inside the configured models root before removing any data; an unregistered or path-escaping name SHALL fail without touching the filesystem. The same lifecycle guarantees (progress, cancellation, retry, truthful state) SHALL apply to the managed CUDA acceleration kit download, and the kit SHALL additionally verify every extracted file against the pinned manifest SHA-256 entries before it may be enabled, rejecting kits from non-allowlisted sources.

#### Scenario: User stops a download

- **WHEN** a user stops an active managed download
- **THEN** the worker is cancelled while reusable completed or partial files remain available to the documented retry or cleanup actions

#### Scenario: Configured storage is unavailable

- **WHEN** a download, retry, resume, redownload, deletion, or cleanup action targets an unavailable configured root
- **THEN** the action fails with a storage-unavailable state without creating or using a fallback model directory

#### Scenario: Deletion rejects an unregistered or escaping model name

- **WHEN** a deletion request carries a model name that is not in the registered catalog, or whose resolved directory would fall outside the models root
- **THEN** the request fails with a not-found state and no directory is removed

#### Scenario: Kit file fails integrity verification

- **WHEN** any extracted CUDA kit file hash differs from the pinned manifest, or the kit source is outside the allowlisted trusted origins
- **THEN** the kit is rejected as a whole, is never injected into the runtime, and the user is offered a clean retry

### Requirement: Compatibility before execution

Local transcription SHALL verify that the configured model storage is available and that the selected registered model has usable managed files and executable runtime support before execution. Runtime support SHALL require importing the engine's executable module rather than only discovering module metadata, and failures SHALL retain an actionable import reason. Status and compatibility inspection SHALL perform heavy framework imports in a bounded short-lived probe process and cache its small structured result, so the long-running API process does not retain Torch, FunASR, MLX, or equivalent framework memory solely because a status endpoint was viewed. API routes that wait for the bounded probe SHALL execute that synchronous wait outside the application event loop so unrelated requests remain responsive.

#### Scenario: Model files are incomplete or incompatible

- **WHEN** the selected model cannot run in the current environment
- **THEN** transcription fails with an actionable compatibility state instead of being reported as successful

#### Scenario: Packaged MLX native dependency is missing

- **WHEN** the Apple Silicon package cannot import `mlx.core` or `mlx_whisper`
- **THEN** the MLX model is marked incompatible before task execution and the native loader error is shown as the reason

#### Scenario: Model storage disconnects before execution

- **WHEN** a local transcription reaches model readiness while the configured storage is unavailable
- **THEN** it fails with `MODEL_STORAGE_UNAVAILABLE` and does not reinterpret the model as never downloaded

#### Scenario: User opens model or runtime status

- **WHEN** compatibility inspection requires real imports of installed heavy runtimes
- **THEN** those imports execute in one bounded probe process whose exit releases framework memory while the API process retains only the cached result

#### Scenario: Runtime probe stalls

- **WHEN** the first runtime status or health request waits on a slow probe process
- **THEN** unrelated API requests continue on the event loop and the probe still returns or fails within its maintained total timeout

### Requirement: Model data boundary
Downloaded weights, upstream caches, and incomplete model data SHALL remain outside the repository and packaged application artifacts. A macOS Apple Silicon release that advertises MLX support SHALL include all runtime libraries and Metal resources required for a successful MLX import and SHALL verify that import during package smoke validation. The optional CUDA acceleration kit SHALL be downloaded into the application data directory at runtime and SHALL NOT be bundled into the installer, the repository, or release application artifacts; a kit whose pinned torch version does not match the running backend SHALL be marked outdated and excluded from injection until redownloaded.

#### Scenario: Desktop release is built
- **WHEN** release artifacts are assembled
- **THEN** registered model metadata and required runtime libraries may be included, downloaded model weights and caches are excluded, and the packaged MLX runtime import check passes

#### Scenario: Backend upgrade outdates the kit
- **WHEN** the backend torch version no longer matches the installed kit manifest
- **THEN** the kit state becomes outdated, local execution stays on CPU, and the settings surface prompts a kit redownload

### Requirement: Engine-native speaker diarization
Models registered with native diarization capability SHALL produce speaker-labelled transcript segments directly from the engine, without requiring a diarization token or a separate diarization model. When a transcription result already carries speaker labels, the task pipeline SHALL preserve those native labels and SHALL NOT apply task-level diarization post-processing over them.

#### Scenario: Native diarization without token configuration
- **WHEN** a transcription runs with a registered natively-diarizing model and no diarization token is configured
- **THEN** the task completes with engine-native speaker labels on the stored segments instead of failing for a missing token

#### Scenario: Native labels are not overwritten
- **WHEN** a transcription result's segments already carry speaker labels and task-level diarization is enabled
- **THEN** the pipeline skips diarization post-processing and keeps the engine-native labels

### Requirement: Honest local acceleration state
Local inference SHALL execute on CUDA automatically when the CUDA acceleration kit is enabled and a compatible GPU is present, and SHALL fall back to CPU execution otherwise. A bounded probe SHALL validate at startup that an enabled kit is importable and CUDA-capable before it is used; probe failure SHALL keep execution on CPU and surface the reason honestly. The backend health surface SHALL report GPU availability truthfully for the running build and host.

#### Scenario: Enabled kit on a CUDA-capable host
- **WHEN** the CUDA kit is enabled and verified on a host with a compatible NVIDIA GPU
- **THEN** local transcription executes on CUDA and the health surface reports GPU availability as true

#### Scenario: Kit probe fails or no GPU is present
- **WHEN** the kit is enabled but the bounded probe cannot import it or no compatible GPU exists
- **THEN** execution falls back to CPU, the health surface reports GPU availability as false, and the failure reason is visible to the user

#### Scenario: Kit disabled or not downloaded
- **WHEN** the CUDA acceleration setting is off or no kit is installed
- **THEN** local execution uses CPU and the health surface reports GPU availability as false

### Requirement: 模型目录分类视图

模型管理页 SHALL 默认展示全部模型，并在分类选项中把「全部」放在第一位、「推荐」放在第二位；其余分类选项 SHALL 保持既定相对顺序。用户在引导卡片中主动选择用途时，视图 SHALL 切换到对应分类，不受默认视图影响。

#### Scenario: 用户打开模型管理页

- **WHEN** 用户进入模型管理页且未主动选择分类
- **THEN** 列表展示目录中的全部模型，当前分类为「全部」

#### Scenario: 用户查看分类选项

- **WHEN** 用户查看模型管理页的分类选项
- **THEN** 「全部」位于第一位，「推荐」位于第二位

#### Scenario: 用户通过引导卡片选择用途

- **WHEN** 用户在引导卡片点击某个用途（如「通用」）
- **THEN** 视图切换到该用途对应的分类（「通用」对应「推荐」）

### Requirement: 本地化模型状态文案

模型状态负载 SHALL 为未下载、文件不完整、未知模型、运行时不兼容四类状态提供机器可读的原因码；模型管理 UI SHALL 按当前界面语言渲染这些状态的本地化描述，不得原样展示后端硬编码英文句子。未下载状态 SHALL NOT 使模型归入「需要处理」分组；文件不完整、未知模型、运行时不兼容或下载错误 SHALL 仍归入该分组。运行时不兼容与文件不完整的原始原因 SHALL 保留在模型详情中供诊断。接口 SHALL 保留原有错误文本字段以兼容旧消费者。

#### Scenario: 中文界面查看未下载模型

- **WHEN** 中文界面下模型未下载且存储可用
- **THEN** 模型行显示本地化中文描述（如「模型文件未下载」），不出现 `Model ... is not downloaded` 英文句子

#### Scenario: 英文界面查看未下载模型

- **WHEN** 英文界面下模型未下载且存储可用
- **THEN** 模型行显示本地化英文描述

#### Scenario: 未下载模型不进入问题分组

- **WHEN** 模型仅处于未下载状态（无下载错误、运行时可兼容）
- **THEN** 该模型不出现在「需要处理」分组中

#### Scenario: 运行时不兼容仍进入问题分组

- **WHEN** 模型因运行时原因不兼容（如 MLX 原生依赖缺失）
- **THEN** 该模型归入「需要处理」分组，显示本地化描述，且原始原因可在详情中查看

### Requirement: 显卡检测可按需重新探测

CUDA 加速设置面板的显卡探测结果 SHALL NOT 在进程生命周期内被一次性钉死：面板 SHALL 提供用户可触发的重新探测动作，该动作重新执行硬件探测并刷新状态；探测未出结果期间 UI SHALL 显示「检测中」并可继续等待；探测失败或未检测到显卡时，UI SHALL 提示用户可以重新检测，而不是仅声明不可用。加速套件下载完成或启用状态变化后，系统 SHALL 自动重新探测一次。启用失败等状态 SHALL 附带机器可读原因码，UI SHALL 按当前界面语言渲染本地化描述并保留原始原因供诊断。

#### Scenario: 用户触发重新检测

- **WHEN** 用户在显卡加速面板点击刷新
- **THEN** 后端重新执行显卡探测，面板显示检测中并在探测结束后呈现最新结果

#### Scenario: 初次探测未检测到显卡

- **WHEN** 首次探测因临时原因未检测到 NVIDIA 显卡
- **THEN** 面板提示暂未检测到、建议重新检测，且用户重新检测后能恢复为已检测到

#### Scenario: 套件下载完成后自动重探

- **WHEN** 加速套件下载任务完成
- **THEN** 系统自动重新探测显卡与运行时，无需用户重启软件

#### Scenario: 启用失败原因本地化

- **WHEN** 启用 CUDA 加速失败（如套件未注入当前进程）
- **THEN** 状态负载携带机器可读原因码，中文界面显示中文描述、英文界面显示英文描述，原始原因可在详情中查看

### Requirement: 加速设置按平台呈现

「显卡加速」设置页签 SHALL 按当前平台呈现对应内容：Windows 桌面端显示 CUDA 加速控制；macOS 桌面端显示 Apple GPU 状态面板，包含 MPS/MLX 可用性与会自动使用 Apple GPU 的本地模型，并说明加速自动生效、无需设置，SHALL NOT 显示 CUDA 控制或永久「检测中」的卡片；其它平台与 Web 运行时 SHALL 显示加速设置仅桌面端可用的说明。

#### Scenario: Windows 桌面端打开加速页签

- **WHEN** Windows 桌面端用户打开「显卡加速」页签
- **THEN** 显示 CUDA 加速控制（开关、套件下载与状态）

#### Scenario: macOS 桌面端打开加速页签

- **WHEN** macOS 桌面端用户打开「显卡加速」页签
- **THEN** 显示 Apple GPU 状态面板（MPS/MLX 可用性与自动加速模型列表），不出现 CUDA 控制或持续旋转的检测卡片

#### Scenario: Web 或其它平台打开加速页签

- **WHEN** 非桌面或未知平台用户打开「显卡加速」页签
- **THEN** 显示加速设置仅桌面端可用的说明，不显示任何探测控制

### Requirement: 加速设置文案使用用户语言

显卡加速设置的用户可见文案 SHALL 使用用户语言表述，不得出现「后端」等未解释的内部术语；需要重启时 SHALL 表述为「重启软件」。中英双语界面 SHALL 分别提供对应文案。

#### Scenario: 切换加速开关提示重启

- **WHEN** 用户切换 CUDA 加速开关且变更需要重启生效
- **THEN** 界面文案表述为「软件将自动重启」（英文界面为 app 表述），不出现「后端」字样

### Requirement: 模型天梯对比视图

模型管理页 SHALL 在顶部提供覆盖目录全部本地模型的天梯对比视图，并 SHALL 默认折叠该区域，仅保留可识别的标题、说明和展开控制。用户展开后，视图 SHALL 按行展示每个模型在速度、准确率、语言覆盖三个维度的 S/A/B/C 等级，以及 GPU 支持、CPU 支持、精确时间轴、说话人分离三项能力的有无。速度与准确率等级 SHALL 来自维护的实测分档数据并标注为参考值与测量口径；未实测模型 SHALL 按引擎／体量回退估算并明确标注为估算。GPU/CPU/时间轴/说话人分离 SHALL 直接反映模型状态接口的 `supported_devices`、`supports_timestamps`、`supports_diarization` 字段，不得静态硬编。天梯视图 SHALL 显示各模型的下载状态，并提供图例说明等级含义；原按体积估算的跑分面板由该视图取代，不再展示。

展开状态下 SHALL 提供明确的排序选择，至少覆盖综合等级、模型名称、速度、准确率、语言覆盖、GPU、CPU、精确时间轴、说话人分离和下载状态。等级维度 SHALL 以 S 到 C 排列，能力与下载状态 SHALL 优先显示支持或已下载项，模型名称 SHALL 按可读名称排序；相同值 SHALL 使用稳定的模型名称回退，使重复选择和数据刷新后的顺序可预测。排序只改变呈现顺序，不得修改目录数据、下载状态或能力事实。

#### Scenario: 用户初次打开模型管理页

- **WHEN** 用户打开模型管理页且本会话尚未主动展开天梯
- **THEN** 顶部显示折叠的模型天梯标题、说明和展开控制，完整表格与图例不占用页面高度

#### Scenario: 用户查看模型天梯

- **WHEN** 用户激活模型天梯的展开控制
- **THEN** 天梯板块列出目录全部本地模型，逐行显示速度／准确率／语言覆盖等级与 GPU／CPU／时间轴／说话人分离能力，并显示每个模型的下载状态

#### Scenario: 用户按天梯维度排序

- **WHEN** 用户选择模型名称、任一等级、任一能力或下载状态作为排序维度
- **THEN** 当前排序选择清晰可见，模型行按该维度及稳定回退规则立即重排，模型事实不改变

#### Scenario: 用户了解等级口径

- **WHEN** 用户展开并查看天梯板块末尾
- **THEN** 可见图例与口径说明：速度与准确率为参考值（测量平台与片段），估算项有明确标注，不把参考值表述为绝对性能保证

#### Scenario: 未实测模型的等级

- **WHEN** 目录中出现没有实测分档的模型（如新增模型或本机不可测的 MLX 模型）
- **THEN** 该模型仍显示完整行，速度／准确率／语言等级按引擎／体量回退估算并标注为估算，视图不破缺

#### Scenario: 能力列随运行时不硬编

- **WHEN** 某模型在当前运行时不支持 CUDA（如未安装加速套件）
- **THEN** GPU 列按模型状态接口的 `supported_devices` 如实显示，而不是静态宣称支持
