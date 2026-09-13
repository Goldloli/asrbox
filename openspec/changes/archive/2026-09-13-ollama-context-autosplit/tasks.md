# Tasks: ollama-context-autosplit

## 1. 后端：Ollama 原生协议与 context_length

- [x] 1.1 `backend/models.py` 的 `LLMCompatibility` 新增 `context_length: int | None = None`（含 2048–1048576 范围校验），新增/更新模型单测，验证越界值 422、缺省解析为 None
- [x] 1.2 `backend/services/llm_compatibility.py` 新增原生请求构造（`model/messages/stream/think/format/options.num_ctx/num_predict:-1`，`resolved()` 协议为 ollama 且 thinking=disabled 时 `think:false`，context_length 缺省取 32768）与 URL 推导（base_url 去尾 `/v1` 拼 `/api/chat`），单测断言请求体各字段
- [x] 1.3 `bounded_completion` 增加流格式分派：新增 `_NDJSON` 解析器（逐行 JSON、`message.content` 增量回调 `on_delta`、`done`+`done_reason` 收尾、`length`→`LLM_PROVIDER_TRUNCATED`、`{"error"}`→INVALID_RESPONSE），非流式原生响应解析（`message.content` + `done_reason`），单测覆盖流式/非流式/截断/错误行
- [x] 1.4 `backend/services/llm_providers.py` 的 `chat_completion` 按 `resolved()` 协议选择原生或 OpenAI 路径（HTTP 状态码分类两路复用），验证既有 OpenAI 路径测试不红
- [x] 1.5 运行 `pytest backend/tests/test_llm_compatibility.py backend/tests/test_llm_streaming.py backend/tests/test_llm_model_list.py` 全绿

## 2. 后端：翻译批次自动拆分重试

- [x] 2.1 `backend/services/translation.py` 批循环接入有界递归拆分：仅 `LLM_PROVIDER_TRUNCATED`/`LLM_PROVIDER_CONTEXT_TOO_LONG` 且目标段数 >1 时对半拆分、保序合并、逐子批 schema 与完整性校验、合并后一次写检查点；每个子请求前在 `task_transition_lock` 内 `_current` 重读代次
- [x] 2.2 `backend/tests/test_translation_execution.py` 新增：mock 满批返回 `done_reason: length`/拆分后成功 → 运行完成且译文保序；单段仍 length → 运行失败保留检查点；拆分途中取消 → 不发后续子请求；`TRANSLATION_INVALID_RESPONSE` 不触发拆分
- [x] 2.3 运行 `pytest backend/tests/test_translation_execution.py` 全绿

## 3. Contract 与能力测试路径

- [x] 3.1 `backend/tests/test_contract.py` 同步 `context_length` 响应字段断言（兼容设置在提供商响应中原样返回），运行 `npm run test:backend:contract` 通过
- [x] 3.2 能力测试（`llm_capabilities.py`）与连接测试经 ollama 原生路径回归：mock 原生响应跑 `pytest backend/tests/test_llm_capabilities.py`（或既有对应文件）全绿

## 4. 前端

- [x] 4.1 `app/src/lib/api.ts` 的 `LLMCompatibility` 类型加 `context_length: number | null`，`LLMCompatibility.tsx` 的 `defaultCompatibility` 同步，并在兼容设置面板加固定档位 Select（`auto` 哨兵映射 null；8192/16384/32768/65536/131072），双语注明仅 Ollama 协议生效与大上下文显存占用
- [x] 4.2 `app/src/lib/translationI18n.ts` 的 `translation.errorIncomplete` 中英文案改为可操作提示（调大上下文长度或更换模型）
- [x] 4.3 `npm run typecheck && npm run build:web` 通过；涉及面板行为的既有 Playwright 场景（llm-provider-models.spec.ts 等）不红

## 5. 文档与收尾

- [x] 5.1 `docs/ai-proofreading.md` / `docs/ai-proofreading.en.md` 兼容设置段落补充 `context_length`（默认 32768、显存权衡、建议 Ollama ≥0.5、回退 protocol=openai）
- [x] 5.2 `npm run test:backend` 全量绿；按 AGENTS.md 评估并运行 `npm run check:open-source`
- [x] 5.3 勾选全部任务，`openspec validate --changes ollama-context-autosplit` 通过后归档（`openspec archive ollama-context-autosplit --yes`），归档后 `openspec validate --specs` 通过
