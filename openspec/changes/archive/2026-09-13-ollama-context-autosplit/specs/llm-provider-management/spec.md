## MODIFIED Requirements

### Requirement: 经过校验的 LLM 提供商使用

系统 SHALL 要求提供商处于启用状态、HTTP endpoint 有效且模型已显式配置，才能执行连接测试、启动校对或启动／继续翻译；系统 SHALL 只使用受维护的 contract：OpenAI-compatible Chat Completions（JSON 或 SSE），或当协议解析为 ollama 时使用同一 endpoint 主机的 Ollama 原生 Chat API（JSON 或 NDJSON 流式）。翻译 SHALL 复用现有 LLM 提供商配置与传输安全边界，不要求用户重复创建翻译专用凭据。

#### Scenario: 提供商配置不完整
- **WHEN** 连接测试、校对或翻译请求引用了已禁用的提供商，或提供商缺少可用 endpoint、必需凭据或模型
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

#### Scenario: 已配置提供商用于翻译
- **WHEN** 用户在翻译工作区选择已启用且配置有效的 LLM 提供商
- **THEN** 系统使用相同 endpoint、凭据和已配置模型执行翻译，并沿用分类且脱敏的错误反馈

#### Scenario: Ollama 协议使用原生 Chat API
- **WHEN** 提供商协议解析为 ollama 并发起 chat completion（翻译、校对、对话或连接测试）
- **THEN** 请求使用同一 endpoint 主机的 Ollama 原生 Chat API 并按已配置上下文长度覆盖本地上下文，不再使用该主机的 OpenAI-compatible Chat Completions 路径

### Requirement: 可保存的共享兼容设置
系统 SHALL 为预设和自定义提供商暴露强类型协议、思考、输出约束、传输及上下文长度设置，供翻译和校对共同使用；未知自定义服务以基础兼容协议处理，显式设置优先。上下文长度 SHALL 仅对协议解析为 ollama 的提供商生效，未设置时按默认值 32768 发送，取值 SHALL 限制在有界整数范围内。旧配置 SHALL 无损迁移，设置不得允许覆盖 endpoint、凭据或安全边界。

#### Scenario: 自定义平台需要专用参数
- **WHEN** 用户为自定义提供商选择协议和兼容选项并保存
- **THEN** 后续翻译与校对使用该设置，不要求按模型名称修改代码；不能支持的能力明确失败

#### Scenario: 旧数据库升级
- **WHEN** 旧 LLM 提供商没有兼容配置
- **THEN** 返回有效默认设置，原凭据与字幕版本保留，重复迁移不出错

#### Scenario: 用户调整 Ollama 上下文长度
- **WHEN** 用户为协议解析为 ollama 的提供商设置有界范围内的上下文长度并保存
- **THEN** 后续翻译、校对与对话请求按该值覆盖本地模型上下文；未显式设置时按默认值 32768 发送

#### Scenario: 上下文长度越界或协议不适用
- **WHEN** 用户提交超出有界范围的上下文长度
- **THEN** 配置被拒绝且不改变已保存设置；协议非 ollama 时该字段不向上游发送任何额外参数
