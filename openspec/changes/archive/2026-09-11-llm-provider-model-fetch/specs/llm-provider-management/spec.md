# llm-provider-management Delta: llm-provider-model-fetch

## ADDED Requirements

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
