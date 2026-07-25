## MODIFIED Requirements

### Requirement: Recoverable task lifecycle
The system SHALL expose enough persisted task, chunk, log, diagnostic, and active-work state to recover or retry supported interrupted and failed workflows without corrupting completed results. 经由托管复制摄取的任务 SHALL 在复制完成前暴露 `importing` 状态；引用原文件的任务 SHALL 直接入队，没有 `importing` 阶段。

#### Scenario: Recoverable work is interrupted
- **WHEN** the application restarts or a retryable chunk fails
- **THEN** the user can identify and resume or retry the supported work from its recorded state

#### Scenario: 重试时被引用的源文件缺失
- **WHEN** 重试或重转写需要的媒体，其外部引用源文件已不存在
- **THEN** 任务以明确的源缺失状态失败，并保留其已完成的结果与记录的路径
