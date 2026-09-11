# Proposal: llm-provider-model-fetch

## Why

配置 LLM 提供商时，用户必须手工填写具体的模型 ID——这对普通用户要求过高：模型 ID 需要到提供商文档里翻找、容易拼错，Ollama 用户更是只想从本地已下载的模型里挑一个。Cherry Studio 等同类产品已验证「填好 base URL + API key 后一键拉取可选模型」是成熟交互。

## What Changes

- 新增 `POST /llm-providers/models` 探测端点：接收表单内联的 `{preset, base_url, api_key?, provider_id?}`（不落盘、不回显 key），以有界传输从提供商拉取可用模型 ID 列表返回；Ollama 预设在 OpenAI 风格 `/models` 不可用时回退原生 `/api/tags`。
- LLM 提供商表单（新增/编辑对话框）的默认模型字段从纯手输改为：手输输入框 + 「拉取模型」按钮 + 拉取成功后的下拉选择；仍允许手工输入未列出的模型 ID。
- 编辑已有提供商且未重新输入 API key 时，探测可经 `provider_id` 使用服务端已保存的 key（不离开后端、不出现在响应里）。
- 探测失败按既有 LLM 错误码分类返回（鉴权/超时/连接/HTTP/响应非法），前端按类型提示。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `llm-provider-management`: 新增 requirement——模型 ID 一键拉取（探测端点行为、Ollama 回退、凭据保护、前端表单交互）。

## Impact

- 后端：`backend/services/llm_providers.py`（fetch_models 服务）、`backend/services/llm_compatibility.py`（有界 GET 辅助）、`backend/routes/llm_providers.py`、`backend/models.py`（请求/响应模型）、`backend/tests/test_contract.py`（冻结路由清单）与新增测试。
- 前端：`app/src/lib/api.ts`（类型+client）、`app/src/components/settings/LLMProvidersPanel.tsx`（表单交互）、`app/src/lib/i18n.ts`（双语 key）、新增 e2e 场景并接入 `test:e2e:maintained`。
- 文档：`docs/ai-proofreading.md` / `docs/ai-chat.md` 中提供商配置段落（如提及手填模型 ID）。
- 不变量保持：key 不脱敏外泄、非 loopback 必须 HTTPS、不follow redirect、响应有界；不改动 chat completion 主链路。
