## MODIFIED Requirements

### Requirement: Local application data boundary
ASRbox 托管的桌面用户媒体、提取的音频、字幕、设置、模型文件、导出、备份、诊断与 SQLite 数据库 SHALL 存储在文档化的、用户控制的应用数据、导出、显式选择的模型存储或显式选择的媒体存储位置，而不是源码仓库或应用包内。桌面任务 MAY 引用位于用户原始位置的媒体而不复制；此时 ASRbox SHALL NOT 向该位置所在目录写入任何内容，也 SHALL NOT 删除、移动或重命名被引用的文件。

#### Scenario: Desktop task produces data
- **WHEN** the desktop application imports media or creates task artifacts
- **THEN** those artifacts are written to documented application data locations outside the repository and packaged application

#### Scenario: 桌面任务引用原始媒体
- **WHEN** 桌面任务引用用户的原始文件而不是托管副本
- **THEN** 派生物留在配置后的 ASRbox 位置内，删除任务不影响原始文件

## ADDED Requirements

### Requirement: 引用媒体的备份与清理范围
备份、存储清理与孤儿扫描 SHALL 只覆盖应用数据与配置存储位置内的 ASRbox 托管数据；SHALL 在文档中说明外部引用的媒体不包含在备份内；SHALL 绝不把被引用的用户文件归类为孤儿。

#### Scenario: 存在引用外部媒体的任务时创建备份
- **WHEN** 用户导出的备份包含引用托管位置之外原始文件的任务
- **THEN** 备份仅包含托管数据，且其文档说明被引用的媒体仍是备份之外的用户自有文件

#### Scenario: 执行孤儿清理
- **WHEN** 存储清理扫描未被引用的文件
- **THEN** 只扫描配置后的托管目录，任何外部引用的用户文件都不会被移除
