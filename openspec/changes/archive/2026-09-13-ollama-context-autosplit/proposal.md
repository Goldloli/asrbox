# Proposal: ollama-context-autosplit

## Why

Ollama 出厂默认上下文为 4096 token（2026 版按显存分档，24GB 显存以下仍为 4k），而 ASRbox 翻译按最多 100 段 / 6000 字符组批，一个满批的 prompt 加结构化译文输出常态超过 4096。默认配置的 Ollama 用户翻译较长字幕时每一批都会以 `finish_reason: length` 失败（`LLM_PROVIDER_TRUNCATED`），连接测试与字幕能力测试只发小样本、无法暴露该问题。ASRbox 目前对 Ollama 也走 OpenAI 兼容接口 `/v1/chat/completions`，该接口没有任何按请求设置上下文大小的字段，应用侧无解，只能要求用户手工配置 Ollama 环境变量。

## What Changes

- Ollama 协议（`protocol` 解析为 `ollama`）的 chat completion 从 OpenAI 兼容接口切换到 Ollama 原生 `/api/chat`：请求携带 `options.num_ctx`（按请求覆盖上下文长度）、思考关闭时携带原生 `think: false`、结构化输出使用原生 `format` 字段（schema 或 `"json"`）、显式 `options.num_predict: -1` 避免 Modelfile 输出上限截断；流式模式解析 NDJSON。**行为变化**：协议为 ollama 的请求不再命中 `/v1/chat/completions`。
- 共享兼容设置新增强类型 `context_length` 字段（可选整数，有界范围）：仅对 ollama 协议生效，未设置时默认 32768；前端兼容设置面板暴露该字段；旧配置无损迁移（缺省即默认）。
- 翻译执行增加确定性自适应分批：单批因 `LLM_PROVIDER_TRUNCATED` 或 `LLM_PROVIDER_CONTEXT_TOO_LONG` 失败时，自动把该批目标段对半拆分、按原顺序分别重试（递归到单段为止）；子批全部成功后合并为该批检查点；单段仍失败才使运行失败。拆分重试有界（深度 ≤ log2(段数)），不违反"不无限自动重试"约束。
- 翻译 `TRUNCATED` 错误文案改为可操作提示（本地提供商调大上下文或更换模型）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `llm-provider-management`: 修改 requirement「经过校验的 LLM 提供商使用」——受维护 contract 从仅 OpenAI-compatible Chat Completions 扩展为「OpenAI-compatible Chat Completions 或 Ollama 原生 Chat API」；修改 requirement「可保存的共享兼容设置」——新增 `context_length` 设置项及其默认值与生效范围。
- `transcript-translation`: 修改 requirement「有界分批和真实进度」——批次在上下文/截断失败时自动对半拆分重试；修改 requirement「翻译请求的有界等待和结构化输出」——Ollama 默认请求改走原生协议（非思考 + JSON Schema + 上下文长度），并为确定性拆分重试开口（原"实际字幕请求不自动重发"的例外）。

## Impact

- 后端：`backend/services/llm_compatibility.py`（原生请求构造 + NDJSON 流解析 + 响应映射）、`backend/services/llm_providers.py`（ollama URL 推导）、`backend/models.py`（`LLMCompatibility.context_length`）、`backend/services/translation.py`（拆分重试执行）、`backend/services/llm_capabilities.py`（能力测试路径随协议切换）、`backend/tests/`（compatibility、translation execution、contract 测试）。
- 前端：`app/src/lib/api.ts`（类型）、`app/src/components/settings/LLMCompatibility.tsx`（字段 UI）、`app/src/lib/translationI18n.ts` 与 `app/src/lib/i18n.ts`（文案）。
- 文档：`docs/ai-proofreading.md` / `docs/ai-proofreading.en.md`（兼容设置与 Ollama 上下文说明）、CHANGELOG（归档时）。
- 不变量保持：凭据脱敏、非 loopback 必须 HTTPS、不跟随 redirect、响应有界、90 秒单请求总时限、事件循环不阻塞、任务转换锁内不做网络等待；`context_length` 只允许有界整数，不允许覆盖 endpoint、凭据或安全边界。
