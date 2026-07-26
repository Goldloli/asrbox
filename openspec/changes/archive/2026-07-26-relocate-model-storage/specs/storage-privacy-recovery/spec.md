## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Recoverable model-storage relocation
Model-storage relocation SHALL preserve the configured source and its original data until a verified target is active, SHALL isolate temporary writes, and SHALL provide a recoverable outcome for failure, cancellation, interruption, or post-switch cleanup failure.

#### Scenario: Relocation terminates before target activation
- **WHEN** relocation fails, is cancelled, or is interrupted before the target root becomes active
- **THEN** the original root remains configured and intact and only transaction-owned staging data is eligible for cleanup

#### Scenario: Duplicate source remains after successful activation
- **WHEN** old-root deletion fails after a verified target becomes active
- **THEN** ASRbox identifies both paths and requires explicit cleanup rather than automatically deleting either verified copy
