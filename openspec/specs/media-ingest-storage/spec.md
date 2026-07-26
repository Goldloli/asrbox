# media-ingest-storage Specification

## Purpose
规定桌面端媒体摄取模式选择、任务级媒体所有权与删除安全、可配置的媒体存储位置、任务持有的派生音频，以及明确的源缺失状态与桌面端 relink。
## Requirements
### Requirement: 可选择的桌面端媒体摄取模式
桌面端媒体摄取 SHALL 提供持久化的 `reference` 模式（默认）：任务直接引用原文件路径、不产生复制；以及 `copy` 模式：保留托管复制管线及其 `importing` 进度状态。浏览器与移动端 Web 摄取 SHALL 保持托管复制，不受该设置影响。

#### Scenario: 桌面用户以默认设置导入媒体
- **WHEN** 桌面用户在摄取模式为 `reference` 时从本地文件路径创建转写
- **THEN** 任务不经 `importing` 阶段直接入队，不创建源文件副本，且任务记录其媒体为外部所有

#### Scenario: 桌面用户选择托管复制
- **WHEN** 摄取模式为 `copy` 且桌面用户导入本地文件路径
- **THEN** 任务经过 `importing` 状态，并在配置后的 uploads 目录中创建托管副本，行为与之前完全一致

#### Scenario: 浏览器客户端导入媒体
- **WHEN** 浏览器或 Docker Web 客户端上传媒体
- **THEN** 内容被存储为托管副本，摄取模式设置不产生影响

### Requirement: 按任务的媒体所有权与删除安全
每个任务 SHALL 记录其媒体是由 ASRbox 托管还是外部引用，任务响应 SHALL 以带类型字段暴露该所有权，删除任务、批量删除与存储清理 SHALL 只移除托管文件。所有权记录之前创建的任务 SHALL 按托管处理。

#### Scenario: 删除引用任务
- **WHEN** 用户删除媒体为外部引用的任务
- **THEN** 原始文件在其路径上保持不动，派生音频、chunk 与数据库行被移除

#### Scenario: 删除旧任务
- **WHEN** 用户删除所有权记录之前创建的任务
- **THEN** 其位于 uploads 目录下的托管文件按之前的行为被移除

### Requirement: 可配置的媒体存储位置
uploads 目录与派生音频目录 SHALL 在桌面端通过持久化设置可配置，写入必须是原子的，并支持环境变量锁定，默认位于应用数据目录下。位置变更 SHALL 仅对新摄取与新派生文件生效；已有文件 SHALL 在其持久化路径上保持可播放、可删除。Docker 部署 SHALL 只读呈现这些路径，并依赖 operator 控制的挂载。

#### Scenario: 用户调整 uploads 目录
- **WHEN** 桌面用户选择新的 uploads 目录
- **THEN** 新的托管摄取落入新位置，已有文件保留在原路径并继续完全可用

#### Scenario: operator 锁定位置
- **WHEN** 环境变量强制了 uploads 或派生音频目录
- **THEN** 设置 UI 报告被锁定的有效路径并拒绝修改它

### Requirement: 任务持有的派生音频
normalized 音频与 chunk 文件 SHALL 写入配置后的派生音频目录，以 task id 命名且由唯一任务持有；SHALL 绝不写入外部引用源文件旁边；SHALL 可在重试时从源文件重新生成。可选设置 SHALL 在转写成功后删除派生音频，且绝不触碰任务的源媒体。

#### Scenario: 转写被引用的源文件
- **WHEN** 引用任务进入媒体准备阶段
- **THEN** 其 normalized 音频与 chunk 在派生音频目录下创建，源文件所在目录保持不被修改

#### Scenario: 开启自动删除
- **WHEN** 转写成功完成且自动删除设置已开启
- **THEN** 派生音频与 chunk 文件被移除，源媒体与转写结果保持完整

### Requirement: 明确的源缺失状态与桌面端 relink
当外部引用的源文件不可用时，播放、重试与重转写 SHALL 以明确的源缺失状态失败；桌面用户 SHALL 能通过带类型的端点把任务 relink 到替代文件路径，该端点校验文件并使失效派生音频作废。

#### Scenario: 被引用的源文件被移动
- **WHEN** 引用任务的源文件不在其记录路径上，且桌面用户在新位置选择了该文件
- **THEN** 任务指向新路径，失效派生音频被丢弃，播放与重试基于新源工作

#### Scenario: relink 被拒绝
- **WHEN** relink 请求给出不存在或非文件的路径，或来自非桌面运行时
- **THEN** 请求明确失败，任务保留其先前记录的路径

