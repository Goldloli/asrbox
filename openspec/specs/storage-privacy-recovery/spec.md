# storage-privacy-recovery Specification

## Purpose
规定本地应用数据边界、本地与在线处理区分、备份恢复安全、敏感数据排除、引用媒体的备份与清理范围、容器存储生命周期、LLM 校对数据边界与模型存储迁移恢复。
## Requirements
### Requirement: Local application data boundary
ASRbox 托管的桌面用户媒体、提取的音频、字幕、设置、模型文件、导出、备份、诊断与 SQLite 数据库 SHALL 存储在文档化的、用户控制的应用数据、导出、显式选择的模型存储或显式选择的媒体存储位置，而不是源码仓库或应用包内。桌面任务 MAY 引用位于用户原始位置的媒体而不复制；此时 ASRbox SHALL NOT 向该位置所在目录写入任何内容，也 SHALL NOT 删除、移动或重命名被引用的文件。

#### Scenario: Desktop task produces data
- **WHEN** the desktop application imports media or creates task artifacts
- **THEN** those artifacts are written to documented application data locations outside the repository and packaged application

#### Scenario: User selects separate model storage
- **WHEN** a user relocates model weights and framework caches to an eligible root
- **THEN** non-model application data remains under the stable application data directory while model data remains within the documented selected root

#### Scenario: 桌面任务引用原始媒体
- **WHEN** 桌面任务引用用户的原始文件而不是托管副本
- **THEN** 派生物留在配置后的 ASRbox 位置内，删除任务不影响原始文件

### Requirement: Local and online processing distinction
The product SHALL distinguish local model processing from online provider processing and SHALL NOT describe online provider data as remaining exclusively on the user's device.

#### Scenario: User reviews privacy behavior
- **WHEN** the user consults product privacy information
- **THEN** local processing, third-party transfer, credential persistence, backups, diagnostics, deletion, and uninstall behavior are described accurately

### Requirement: Safe backup and restore
Backups and restores SHALL preserve supported application state, validate manifests and paths, reject unsafe archive traversal or incompatible input, and document that locally stored credentials may be included.

#### Scenario: Invalid backup is restored
- **WHEN** a backup is missing required metadata, is incompatible, or contains unsafe paths
- **THEN** restore is rejected without writing files outside the permitted data boundary

### Requirement: Sensitive data exclusion
Private media, transcripts, credentials, model weights, local databases, backups, and unredacted diagnostics SHALL be excluded from source control, routine logs, test output, and release artifacts unless an explicitly licensed and sanitized fixture is approved.

#### Scenario: Repository verification runs
- **WHEN** tests, diagnostics, or release packaging complete
- **THEN** real user content and secrets are not added to tracked output or published artifacts

### Requirement: 引用媒体的备份与清理范围
备份、存储清理与孤儿扫描 SHALL 只覆盖应用数据与配置存储位置内的 ASRbox 托管数据；SHALL 在文档中说明外部引用的媒体不包含在备份内；SHALL 绝不把被引用的用户文件归类为孤儿。

#### Scenario: 存在引用外部媒体的任务时创建备份
- **WHEN** 用户导出的备份包含引用托管位置之外原始文件的任务
- **THEN** 备份仅包含托管数据，且其文档说明被引用的媒体仍是备份之外的用户自有文件

#### Scenario: 执行孤儿清理
- **WHEN** 存储清理扫描未被引用的文件
- **THEN** 只扫描配置后的托管目录，任何外部引用的用户文件都不会被移除

### Requirement: Container storage lifecycle
Container application state SHALL reside under the persistent `/data` mount, SHALL survive ordinary container recreation, and SHALL be removed only when the operator explicitly deletes the associated volume or bind-mounted data.

#### Scenario: Compose service is removed without volumes
- **WHEN** an operator runs the documented stop or removal command without requesting volume deletion
- **THEN** the database, media, transcripts, settings, exports, caches, and downloaded models remain available for the next container

#### Scenario: Container data is backed up
- **WHEN** an operator archives or migrates the `/data` volume
- **THEN** the documentation treats the backup as sensitive because it can contain user media, transcripts, diagnostics, and locally stored provider credentials

### Requirement: LLM 字幕校对数据边界
ASRbox SHALL 区分 loopback LLM 处理和第三方 LLM 处理，在启动校对前披露实际提供商、模型、endpoint 和传输字幕文本的边界，并 SHALL 绝不把音频、本地文件路径或提供商凭据作为校对输入发送。

#### Scenario: 用户启动云端校对
- **WHEN** 已配置的 LLM endpoint 不是 loopback
- **THEN** 提供商选择区域用非阻塞的小字将其标识为第三方处理，并说明会传输分段文本和有限的相邻文本，但不会传输音频或本地文件路径，启动时不要求额外确认弹窗

#### Scenario: 用户启动本地 Ollama 校对
- **WHEN** 已配置的 LLM endpoint 解析为 loopback host
- **THEN** 提供商选择区域用非阻塞的小字说明字幕只在本机 endpoint 处理

#### Scenario: Ollama 预设指向远程主机
- **WHEN** Ollama 提供商的实际 endpoint 不是 loopback
- **THEN** 无论预设名称是什么，界面都会将其标识为第三方处理

### Requirement: 持久化 LLM 校对数据的隐私边界
LLM 提供商凭据、校对任务和建议 SHALL 保留在已记录的本地应用数据库与备份边界内；prompt、字幕请求 payload、原始 LLM 响应、建议文本和完整凭据 SHALL 从常规日志和诊断包中排除。

#### Scenario: 用户创建应用备份
- **WHEN** SQLite 数据库包含 LLM 提供商凭据或校对历史
- **THEN** 备份会包含这些敏感数据，并且项目负责维护的隐私文档会相应提醒用户

#### Scenario: 生成诊断包
- **WHEN** 在 LLM 提供商或校对失败后收集诊断信息
- **THEN** 诊断包可以包含经过清理的错误码和脱敏提供商元数据，但不得包含字幕文本、建议、prompt、原始响应或完整凭据

### Requirement: Recoverable model-storage relocation
Model-storage relocation SHALL preserve the configured source and its original data until a verified target is active, SHALL isolate temporary writes, and SHALL provide a recoverable outcome for failure, cancellation, interruption, or post-switch cleanup failure.

#### Scenario: Relocation terminates before target activation
- **WHEN** relocation fails, is cancelled, or is interrupted before the target root becomes active
- **THEN** the original root remains configured and intact and only transaction-owned staging data is eligible for cleanup

#### Scenario: Duplicate source remains after successful activation
- **WHEN** old-root deletion fails after a verified target becomes active
- **THEN** ASRbox identifies both paths and requires explicit cleanup rather than automatically deleting either verified copy

