# llm-provider-management Specification

## Purpose
规定 LLM 提供商的独立配置与校验使用、独立设置入口、endpoint 传输边界与凭据保护。
## Requirements
### Requirement: 独立的 LLM 提供商配置
ASRbox SHALL 独立于 ASR 转写提供商管理 LLM 提供商，并 SHALL 为 MiniMax、Kimi、DeepSeek、Qwen、GLM、Ollama 和自定义 OpenAI-compatible endpoint 提供带类型的预设。

#### Scenario: 用户从预设创建云端 LLM 提供商
- **WHEN** 用户选择受支持的云端预设
- **THEN** 配置会预填该预设的 OpenAI-compatible base URL，并要求用户在使用前提供 API key 和模型

#### Scenario: 用户创建本地 Ollama 提供商
- **WHEN** 用户选择 Ollama 预设
- **THEN** 配置会预填 loopback Ollama base URL，且不要求 API key

### Requirement: 经过校验的 LLM 提供商使用
系统 SHALL 要求提供商处于启用状态、HTTP endpoint 有效且模型已显式配置，才能执行连接测试或启动校对；系统 SHALL 只使用受维护的非流式 OpenAI-compatible Chat Completions contract。

#### Scenario: 提供商配置不完整
- **WHEN** 连接测试或校对请求引用了已禁用的提供商，或提供商缺少可用 endpoint、必需凭据或模型
- **THEN** 请求会在发送字幕文本前明确失败

#### Scenario: 测试提供商连接
- **WHEN** 用户测试一个有效的 LLM 提供商
- **THEN** 系统发送不包含用户内容的模型请求，并返回经过清理的成功结果或提供商错误，且不发送字幕内容

#### Scenario: 保存并测试提供商
- **WHEN** 用户保存新增或编辑后的 LLM 提供商
- **THEN** 配置会先被保留并自动执行一次连接测试；即使测试失败，用户仍可继续修改该配置

#### Scenario: 用户重新测试已保存的提供商
- **WHEN** 用户点击提供商卡片上持续可用的“测试连接”操作
- **THEN** 界面显示测试中状态，并明确显示成功或按错误类型区分的失败结果，而不进行提供商测速排名

### Requirement: 独立的 LLM 设置入口
ASRbox SHALL 在设置页使用一级 `AI LLM提供商` tab 管理 LLM 提供商，并 SHALL 与现有 ASR 在线提供商设置保持分离。

#### Scenario: 用户管理 LLM 提供商
- **WHEN** 用户打开设置页的 `AI LLM提供商` tab
- **THEN** 用户可以从预设或自定义 OpenAI-compatible endpoint 新增、编辑、启用、停用、删除和测试 LLM 提供商

### Requirement: LLM endpoint 传输边界
系统 SHALL 要求非 loopback LLM endpoint 使用 HTTPS，SHALL 只允许 loopback endpoint 使用明文 HTTP，并 SHALL NOT 通过 HTTP redirect 转发提供商凭据。

#### Scenario: 配置了不安全的远程 endpoint
- **WHEN** 用户尝试保存或使用采用明文 HTTP 的非 loopback LLM endpoint
- **THEN** 系统会在发送凭据或字幕文本前拒绝该 endpoint

### Requirement: LLM 凭据保护
LLM 提供商 secret SHALL 在 API 和用户界面响应中脱敏，并从日志、诊断、错误 payload 和原始提供商输出中排除，同时仍受已记录的本地数据库与备份边界约束。

#### Scenario: 获取 LLM 提供商配置
- **WHEN** 前端或诊断操作获取 LLM 提供商信息
- **THEN** 完整 API key 和任何包含字幕内容的提供商响应都不会被暴露

