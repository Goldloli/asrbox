# Design: translation-local-retry-hardening

## 背景

现状代码（见 proposal.md 动机）：

- `backend/services/translation.py:217` `_translate_batch` 以固定 `timeout=90` 调用 `llm_providers.chat_completion`。
- 同文件 `SPLIT_RETRYABLE = {"LLM_PROVIDER_TRUNCATED", "LLM_PROVIDER_CONTEXT_TOO_LONG"}`，仅这两类 `LLMProviderError` 触发 `_sub_batch` 对半拆分；`parse_translations` 抛出的 `TRANSLATION_INVALID_RESPONSE`（`TranslationError`）在拆分逻辑之外，直接整批失败。
- 实测依据：本机 Ollama qwen3.5:9b 暖模型 100 段批约 25 秒，冷加载叠加 GPU 争用可超 90 秒（用户安装包实测 `LLM_PROVIDER_TIMEOUT`，0/135 段）；同模型偶发返回重复 segment_id 导致覆盖校验失败（用户实测 74/135 段后第二批 `TRANSLATION_INVALID_RESPONSE`）。

## 目标 / 非目标

**目标：**

- 本地 Ollama 原生协议请求总时限 300 秒，其余协议保持 90 秒；保活不重置时限的既有约束不变。
- `LLM_PROVIDER_TIMEOUT` 与 `TRANSLATION_INVALID_RESPONSE` 纳入多段批的确定性对半拆分触发集合。
- 单段仍失败 → 运行明确失败，保留原始错误码与既有检查点。

**非目标：**

- 不改变检查点、原子发布、续译、取消语义；不做无限/指数退避重试；不改 UI 结构与接口 contract；不为超时错误跨批重发已成功批次。

## 决策

1. **时限按协议区分**：在 `_translate_batch` 内按 `llm_compatibility.resolved(provider).protocol == "ollama"` 选择 300 秒，否则 90 秒。
   - 备选：对所有提供商统一放宽到 300 秒——否决，云端提供商卡死时会无谓推迟失败上报与后续队列。
   - 备选：按 prompt 字符数线性外推时限——否决，冷加载耗时与字符数无关，模型加载才是主导项；协议区分已覆盖主导场景且行为可预测。
   - 300 秒的取值：覆盖 9B 级模型冷加载（数十秒）+ 6000 字符批生成（实测暖机约 25 秒、思考开启时约 205 秒）的叠加上限，仍保持有界。

2. **拆分触发集合扩展**：`SPLIT_RETRYABLE` 增加 `LLM_PROVIDER_TIMEOUT`；`parse_translations` 调用移入同一 try 块，捕获 `TranslationError` 且 `code == "TRANSLATION_INVALID_RESPONSE"` 时走同一 `_sub_batch` 拆分路径（`len(target_ids) < 2` 时直接抛出，保留单段明确失败语义）。
   - 备选：对 INVALID_RESPONSE 原样重发同一批——否决，相同 prompt 大概率重现相同覆盖错误；对半拆分改变任务规模，实测小批覆盖率显著更稳。
   - 备选：TIMEOUT 不拆分仅放宽时限——否决，冷加载叠加争用时 300 秒也可能不够，拆小批既缩短单次生成也让模型逐步暖机，二者互补。

3. **测试行为反转**：`test_invalid_response_does_not_trigger_split` 改写为新行为（多段 INVALID_RESPONSE → 拆分后完成；单段 INVALID_RESPONSE → 明确失败保留错误码），并新增 Ollama/非 Ollama 时限断言与 TIMEOUT 拆分用例。这是对既有设计决策的显式修改，spec 已同步 MODIFIED。

## 风险

- 超时拆分可能把"提供商实际已宕机"的故障拆成多次徒劳请求 → 递归有界（至多拆到单段），总请求数有上限，最终仍明确失败。
- 偶发 INVALID_RESPONSE 在单段上反复失败 → 单段不拆分，直接以原始错误码失败，语义与截断单段失败一致。
- 300 秒仅覆盖 Ollama 原生协议；自定义 OpenAI 兼容端点指向本地服务时仍 90 秒 → 用户可在兼容性设置把协议固定为 ollama 以获得本地时限（文档既有指引）。

## 回滚

纯行为开关级修改：还原 `SPLIT_RETRYABLE` 集合、parse 调用位置与 timeout 取值即可回滚，无持久化结构变更，已保存检查点不受影响。
