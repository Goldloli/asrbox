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

系统 SHALL 要求提供商处于启用状态、HTTP endpoint 有效且模型已显式配置，才能执行连接测试、启动校对或启动／继续翻译；系统 SHALL 只使用受维护的 JSON 或 SSE OpenAI-compatible Chat Completions contract。翻译 SHALL 复用现有 LLM 提供商配置与传输安全边界，不要求用户重复创建翻译专用凭据。

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

### Requirement: 可保存的共享兼容设置
系统 SHALL 为预设和自定义提供商暴露强类型协议、思考、输出约束及传输设置，供翻译和校对共同使用；未知自定义服务以基础兼容协议处理，显式设置优先。旧配置 SHALL 无损迁移，设置不得允许覆盖 endpoint、凭据或安全边界。

#### Scenario: 自定义平台需要专用参数
- **WHEN** 用户为自定义提供商选择协议和兼容选项并保存
- **THEN** 后续翻译与校对使用该设置，不要求按模型名称修改代码；不能支持的能力明确失败

#### Scenario: 旧数据库升级
- **WHEN** 旧 LLM 提供商没有兼容配置
- **THEN** 返回有效默认设置，原凭据与字幕版本保留，重复迁移不出错

### Requirement: 显式的字幕能力测试
系统 SHALL 提供与连接测试分离的翻译与校对能力测试，仅发送内置示例。测试 SHALL 分别使用实际业务输出校验，最多尝试三档输出约束、六次请求和 180 秒总限；鉴权、限流、连接或超时失败不得触发候选重试。界面 SHALL 说明请求预算、可能计费和示例通过不代表长任务或语义质量保证。

#### Scenario: 自定义平台不支持结构化输出
- **WHEN** 用户显式测试提供商且服务明确拒绝输出约束或示例格式无效
- **THEN** 在预算内尝试更弱的输出约束，分别返回翻译与校对验证结果和可用建议，不发送用户字幕也不自动保存候选

#### Scenario: 应用测试建议
- **WHEN** 两项示例测试通过后用户选择应用建议
- **THEN** 设置仅在提供商未被更新时保存；并发更新后旧建议被拒绝，界面不能把旧测试显示为当前配置已验证

#### Scenario: 模型响应缓慢或不能完成
- **WHEN** 测试遇到超时、鉴权或其他非格式错误
- **THEN** 停止测试并返回经过清理的错误和实际请求数，等待期间后端其他请求仍能响应

### Requirement: LLM 流式增量输出

系统的 LLM 传输层 SHALL 在保持现有整段聚合调用模式不变的前提下，支持可选的流式模式：当调用方请求流式输出时，系统 SHALL 把上游 SSE 响应的增量 token 逐个透传给调用方回调，并在流结束时提供完整聚合结果。校对、翻译等现有功能 SHALL 继续使用整段聚合模式，行为不变。

#### Scenario: 调用方请求流式输出
- **WHEN** 调用方以流式模式发起 chat completion，且提供商以 SSE 响应
- **THEN** 每个增量 token 到达时调用方回调被触发，流结束后调用方获得完整聚合文本

#### Scenario: 上游不支持流式或回退
- **WHEN** 提供商以非 SSE 的 JSON 整段响应作答
- **THEN** 系统将完整结果作为单次增量交付给调用方回调，调用方无需区分两种上游传输

#### Scenario: 流式传输中断
- **WHEN** 流式响应中途因网络或提供商错误中断
- **THEN** 调用方收到按错误类型分类的错误，已收到的增量内容仍可由调用方决定保留

#### Scenario: 现有整段模式不受影响
- **WHEN** 校对或翻译发起 chat completion
- **THEN** 仍获得完整聚合响应，与流式能力引入前的行为一致

### Requirement: 模型 ID 一键拉取

LLM 提供商表单 SHALL 提供从当前填写的 base URL 与凭据一键拉取可用模型 ID 的动作，无需先保存提供商；拉取成功后用户 SHALL 能从列表中点选模型填入默认模型字段，且 SHALL 保留手工输入任意模型 ID 的能力。系统 SHALL 通过专用探测端点执行拉取：端点 SHALL 复用与保存时相同的 base URL 校验与有界传输约束（超时、响应体积上限、不跟随 redirect），SHALL NOT 持久化表单内容，SHALL NOT 在响应、日志或错误详情中回显 API key。Ollama 预设 SHALL 在 OpenAI 风格模型列表不可用时回退到 Ollama 原生模型列表接口。探测失败 SHALL 按既有 LLM 错误分类（鉴权、超时、连接失败、HTTP 错误、非法响应）返回机器可读错误码。

#### Scenario: 表单内拉取云端提供商模型

- **WHEN** 用户在新增或编辑 LLM 提供商对话框中填写 base URL 与 API key 后点击拉取模型
- **THEN** 系统向该 endpoint 请求模型列表并以下拉选项呈现，用户点选后填入默认模型字段，全程无需先保存提供商

#### Scenario: Ollama 回退原生模型列表

- **WHEN** 用户对 Ollama 预设执行拉取，且 OpenAI 风格模型列表接口不可用
- **THEN** 系统回退请求 Ollama 原生模型列表接口并呈现本地已下载模型

#### Scenario: 编辑场景使用已保存凭据

- **WHEN** 用户编辑已有提供商、API key 字段留空（沿用已保存 key）时执行拉取
- **THEN** 后端使用该提供商已保存的 key 发起探测，key 不出现在响应中

#### Scenario: 探测失败分类提示

- **WHEN** 拉取因鉴权失败、超时、连接失败或非法响应而失败
- **THEN** 界面按错误分类给出本地化提示，表单内容不丢失，用户仍可手工输入模型 ID

#### Scenario: 不安全 endpoint 被拒绝

- **WHEN** 用户对采用明文 HTTP 的非 loopback endpoint 执行拉取
- **THEN** 系统在发起任何携带凭据的请求前拒绝该 base URL
