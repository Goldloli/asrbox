# Proposal: translation-local-retry-hardening

## 为什么

现行 spec 规定翻译的每个提供商请求固定 90 秒总时限，且仅上下文容量不足/输出截断（`LLM_PROVIDER_TRUNCATED`/`LLM_PROVIDER_CONTEXT_TOO_LONG`）触发确定性对半拆分重试，其余错误整批失败。v0.2.0 修复 Ollama 上下文问题后，真实用户在本机 Ollama（qwen3.5:9b）上依旧无法完成翻译，实测暴露两个新失败模式：

1. `LLM_PROVIDER_TIMEOUT`：本地模型冷加载 + 大批次（74 段/6000 字符）生成，超过固定 90 秒时限（本机实测暖模型约 25 秒，冷加载叠加 GPU 争用可超过 90 秒）。
2. `TRANSLATION_INVALID_RESPONSE`：本地模型偶发返回重复 segment_id 的覆盖不全响应（JSON Schema 约束无法保证跨项唯一性），当前不重试直接整批失败，用户实测 74/135 段保存后第二批失败。

## 变更内容

- 翻译单批请求总时限从固定 90 秒改为按提供商协议区分：本地 Ollama（原生协议）300 秒，其余协议保持 90 秒。
- 确定性对半拆分重试的触发条件扩展：`LLM_PROVIDER_TIMEOUT` 与 `TRANSLATION_INVALID_RESPONSE` 纳入可拆分错误（仅限多段批）。
- 既有语义保持不变（非目标）：单段仍失败则运行明确失败、拆分有界递归、子批不单独成为持久化检查点、已成功批次不重发、完整结果仍原子发布、不做无限自动重试、不改 UI 结构。

## 能力（Capabilities）

### New Capabilities

（无）

### Modified Capabilities

- `transcript-translation`: 修改"单批 90 秒总时限"为按提供商区分的时限（Ollama 300 秒）；修改确定性拆分重试的触发错误集合，纳入超时与响应完整性错误。

## 影响

- `backend/services/translation.py`：`_translate_batch` 的 timeout 参数与 `SPLIT_RETRYABLE` 触发逻辑。
- `backend/tests/test_translation_execution.py`：`test_invalid_response_does_not_trigger_split` 行为反转（改为拆分后完成/单段仍失败）；新增本地提供商时限与超时拆分用例。
- `openspec/specs/transcript-translation/spec.md`：两条 requirement 的措辞与 scenario 更新。
- `CHANGELOG.md`：Fixed 条目。
- 不影响：API 路由与响应字段、持久化结构、检查点/发布语义、前端 UI。
