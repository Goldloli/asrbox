## ADDED Requirements

### Requirement: 派生音频失败清理完整性

媒体切片与 orphan 清理 SHALL 只删除本次失败操作拥有或数据库未引用的派生 WAV；活动或终态任务仍由 task/chunk 行引用的文件 SHALL 保留。桌面 relink SHALL 只在任务非活动时以一个状态转换完成旧派生文件失效和新源路径提交。

#### Scenario: 第 N 个切片失败

- **WHEN** ffmpeg 在一次切片调用已经生成前几个 chunk 后失败或超时
- **THEN** 本次调用已经生成的全部 chunk 被删除，任务源媒体和其他任务文件保持不变

#### Scenario: 递归清理派生目录

- **WHEN** orphan 清理扫描 task-id chunk 子目录
- **THEN** 数据库仍引用的 task/chunk 文件被保留，未引用 WAV 被删除

#### Scenario: 活动任务 relink

- **WHEN** 桌面用户尝试为活动任务选择新的源文件
- **THEN** relink 返回冲突，旧路径、派生文件和 chunk 行全部保持不变
