# Tasks: translation-local-retry-hardening

## 1. 后端实现

- [x] 1.1 `backend/services/translation.py`：`_translate_batch` 的 `chat_completion` 调用按 `llm_compatibility.resolved(provider).protocol == "ollama"` 选择 `timeout=300`，其余协议保持 `timeout=90`。
- [x] 1.2 `SPLIT_RETRYABLE` 增加 `LLM_PROVIDER_TIMEOUT`；`parse_translations` 移入同一 try 块，`TranslationError` 且 `code == "TRANSLATION_INVALID_RESPONSE"` 且目标段数 ≥ 2 时走同一 `_sub_batch` 对半拆分路径，单段直接抛出保留错误码。

## 2. 测试

- [x] 2.1 改写 `backend/tests/test_translation_execution.py::test_invalid_response_does_not_trigger_split`：多段批 INVALID_RESPONSE → 拆分后完成；新增单段 INVALID_RESPONSE → 运行失败且 `error_code == 'TRANSLATION_INVALID_RESPONSE'`。
- [x] 2.2 新增 TIMEOUT 拆分用例（多段批 `LLM_PROVIDER_TIMEOUT` → 对半拆分完成）与 Ollama/非 Ollama 提供商 `chat_completion` 收到的 timeout 值断言（300/90）。
- [x] 2.3 运行 `node scripts/venv-python.mjs -m pytest backend/tests/test_translation_execution.py backend/tests/test_llm_compatibility.py -q` 全绿，再跑 `npm run test:backend`。

## 3. 文档与归档

- [x] 3.1 `CHANGELOG.md` Unreleased → Fixed 增加条目（本地翻译 300 秒时限；超时与响应不完整自动拆批）。
- [ ] 3.2 `openspec validate --changes translation-local-retry-hardening` 通过；实现完成后 `openspec archive translation-local-retry-hardening --yes` 并复核 `openspec validate --specs`。
