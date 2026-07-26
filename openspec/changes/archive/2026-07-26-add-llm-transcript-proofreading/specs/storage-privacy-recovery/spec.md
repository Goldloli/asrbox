## ADDED Requirements

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
