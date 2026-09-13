# Design: ollama-context-autosplit

## 背景

关键代码事实（已核实）：

- 请求构造：`llm_compatibility.py:69-87` `request_body` 对所有提供商（含 Ollama）构造 OpenAI Chat Completions 请求体；`llm_providers.py:265` URL 固定为 `{base_url}/chat/completions`。OpenAI 兼容层没有上下文长度字段，多传字段被忽略。
- 兼容设置：`backend/models.py:254-259` `LLMCompatibility`（`extra="forbid"`，protocol/thinking/output_format/transport）；`resolved()`（`llm_compatibility.py:46-66`）把 auto 解析成具体值（ollama → thinking=disabled、output_format=json_schema）。
- 传输纪律：`llm_compatibility.py:162-200` `bounded_completion`：`httpx.AsyncClient(follow_redirects=False)` + `asyncio.timeout` + 字节上限；SSE 按 `text/event-stream` content-type 判定，`_SSE` 类（`:114-159`）逐行解析；错误分类 TIMEOUT/UNAVAILABLE/RESPONSE_TOO_LARGE。测试用 `mock_transport`（`test_translation_execution.py:30-35`）monkeypatch `llm_compatibility.httpx.AsyncClient`。
- Ollama 原生 URL 已有先例：`llm_providers.py:401` `_fetch_ollama_model_names` 把 base_url 尾部 `/v1` 去掉拼 `/api/tags`。
- 翻译分批：`translation.py:27-28` 单批上限 100 段 / 6000 字符；`execute_run`（`:308-367`）逐批在 `task_transition_lock` 内重读代次、锁外发请求（`:336` timeout=90）、批成功后写 `TranslationBatch` 检查点；`batch_payload`（`:97-109`）按字符预算取前后各 ≤2 段邻段上下文。
- Ollama 原生 Chat API 能力（文档已核实）：`/api/chat` 支持 `options.num_ctx` 按请求覆盖上下文（优先级最高，与已加载值不同会重载模型）、`think: false`、`format`（schema 对象或 `"json"`）、流式为 NDJSON（每行一个 JSON 对象，`done`/`done_reason` 收尾，`done_reason: "length"` 表示长度截断）。
- 前端兼容设置 UI：`LLMCompatibility.tsx:7` `defaultCompatibility`、`:22-33` 通用 Select 渲染（遍历 `choices` 的 key，新增非枚举字段不会自动出现）。
- contract 冻结：`backend/tests/test_contract.py` 冻结路由与响应字段；AGENTS.md 要求新增响应字段必须进 response_model 并在 API 测试断言。

## 目标 / 非目标

**目标：**

- ollama 协议的 chat completion 走原生 `/api/chat`，按请求携带 `num_ctx`（默认 32768，可在兼容设置中调整）、思考关闭时 `think: false`、结构化输出用原生 `format`、`num_predict: -1`；非流式与 NDJSON 流式（AI 对话 `on_delta`）都可用。
- `LLMCompatibility` 新增可选 `context_length`，前端面板可调，旧配置无损。
- 翻译单批遇 `LLM_PROVIDER_TRUNCATED` / `LLM_PROVIDER_CONTEXT_TOO_LONG` 自动对半拆分重试（有界、保序、批级检查点语义不变），取消/删除/代次语义不变。

**非目标：**

- 不改动其他协议的请求路径（DeepSeek/Qwen/GLM/OpenAI/custom 仍走 `/v1/chat/completions`）。
- 不对 `TRANSLATION_INVALID_RESPONSE` / `LLM_PROVIDER_INVALID_RESPONSE` 做拆分或重试（模型行为失败非确定性，重发会放大计费）；不对 `UNAVAILABLE`/`TIMEOUT` 自动重试。
- 不做 `/api/ps` 上下文探测或启动前预警；不做 Ollama 版本探测与自动升降级；不为用户自动 `ollama create` 派生模型。
- 不改变批次持久化粒度（`TranslationBatch` 一行一批，子批不单独落库）与进度展示口径。

## 决策

### D1: ollama 协议整体切换原生 `/api/chat`，不做 /v1 私有扩展

`resolved()` 协议为 `ollama` 时，`chat_completion` 的 URL 由 base_url 去尾 `/v1` 拼 `/api/chat`（复用 `_fetch_ollama_model_names` 的推导），请求体与响应解析走原生格式。备选「继续在 /v1 上传 `options`/`num_ctx`」：字段被静默忽略，等于没做，否决。备选「提示用户设 `OLLAMA_CONTEXT_LENGTH`」：把配置负担推给全部默认用户，否决（仅保留为文档补充）。备选「自动 `ollama create` 派生带 num_ctx 的模型」：侵入用户模型库、命名冲突与清理责任不清，否决。

### D2: 传输层按响应 content-type 分派，NDJSON 与 SSE 并列

`bounded_completion` 增加流格式参数（调用方按协议声明 `ollama-ndjson` 或默认 `openai-sse`）：非流式分支不变；流式分支按声明格式逐行解析——新增 `_NDJSON` 解析器，每行一个 JSON 对象，累加 `message.content` 增量并回调 `on_delta`，`done:true` 收尾并校验 `done_reason`；`{"error": ...}` 行 → `LLM_PROVIDER_INVALID_RESPONSE`。复用同一 `AsyncClient` 工厂（`mock_transport` 测试模式不变）、`asyncio.timeout`、字节上限与错误分类。`done_reason` 映射：`length` → `LLM_PROVIDER_TRUNCATED`（与 `check_finish` 同语义），`stop` → 正常，其它 → invalid。备选「NDJSON 伪装成 SSE 进现有解析器」：行格式不同（无 `data:` 前缀、无 `[DONE]`），强塞会把两种 contract 搅在一起，否决。

### D3: `context_length` 落在共享兼容设置，有界可选整数

`LLMCompatibility` 新增 `context_length: int | None = None`，校验范围 2048–1048576（超出即 422，不保存）。仅当 `resolved()` 协议为 ollama 时生效：`None` → 发送 32768，显式值 → 发送该值；其它协议不发送任何相关参数。`extra="forbid"` 模型加可选字段对存量 JSON 无损（缺省即 None）。前端：兼容设置 `<details>` 内增加固定档位 Select（`auto` 哨兵映射 None；8192/16384/32768/65536/131072），遵守 weiui 非空 value 约束，文案注明「仅 Ollama 协议生效、大上下文占显存」。备选「免费数字输入」：无档位引导、易填出显存炸弹，否决；备选「独立 provider 字段而非兼容设置」：它与 protocol 强耦合，放兼容设置内语义最集中，否决。

### D4: 原生请求体固定三个保护参数

- `options.num_predict: -1`：覆盖用户 Modelfile 可能设置的输出上限（不覆盖就会以 length 截断复发）。
- `think: false`：仅当 `resolved().thinking == "disabled"`（ollama auto 的默认值）时发送；`thinking == "default"` 时省略 `think` 字段。旧版 Ollama 忽略未知字段，行为退化等同现状。
- `format`：`output_format == "json_schema"` 且有 schema → `format: <schema 对象>`；`"json_object"` → `format: "json"`；`"prompt"` → 省略。

### D5: 拆分重试收敛在翻译执行层，批级检查点语义不变

`execute_run` 的批循环内，把单次 `chat_completion` 换成有界递归：

1. 失败码为 `LLM_PROVIDER_TRUNCATED` 或 `LLM_PROVIDER_CONTEXT_TOO_LONG` 且目标段数 > 1 → 把该批目标段对半分（保序），递归处理两半；两半译文按原序合并后一次性写 `TranslationBatch` 检查点。
2. 单段仍失败 → 原错误上抛，运行失败（保留此前检查点，可显式续译）。
3. 子批上下文邻段沿用 `batch_payload` 规则（字符预算内前后各 ≤2 段，取自该批原 targets 与邻段），schema 与 `required_segment_ids` 按子批目标生成，完整性校验逐子批执行。
4. 每个子请求前都在 `task_transition_lock` 内 `_current` 重读代次（取消/删除/重试代次语义与现批循环一致），锁外发请求，90 秒单请求时限不变。
5. 递归深度 ≤ ⌈log2(100)⌉ = 7，单批请求数有界（极端 2n−1）；只重发失败批次的子集，已成功批次不碰。

备选「按估算 token 数 proactive 缩批」：token 估算不可靠且无法得知 Ollama 端实际上下文，否决；备选「子批也持久化检查点」：改 `TranslationBatch` schema 与进度口径，收益不成比例，否决。

### D6: 文案与文档同步

`translationI18n.ts` 的 `translation.errorIncomplete`（中英）改为可操作提示：调大提供商兼容设置中的上下文长度或更换模型。`docs/ai-proofreading.md` / `.en.md` 的兼容设置段落补充 `context_length` 说明与 Ollama 显存权衡。

## 风险

- [num_ctx 增大 → KV cache 显存上涨，低显存卡可能 OOM 崩 runner（`UNAVAILABLE`）] → 默认 32768 而非更大；UI 提供降档；错误文案引导调低；不自动设 64k+。
- [num_ctx 与已加载值不同触发模型重载，首次请求变慢甚至撞 90s 上限] → 重载一次性；失败后用户可显式续译（检查点保留）；文案不承诺首次速度。
- [num_ctx 超过模型训练上限时行为依 Ollama 版本不定（截断或报错）] → 由 D5 拆分重试与既有错误分类兜底；文档建议按模型实际上限设置。
- [伪装成 ollama 预设/协议的网关没有 `/api/chat`] → 404 走既有 `LLM_PROVIDER_HTTP_ERROR` 分类；用户可把协议显式改回 `openai`（显式设置优先），此即回退路径。
- [旧版 Ollama 不认识 `think` / `format` schema] → 未知字段被忽略，退化为现状（提示词约束）；`format` schema 需 Ollama ≥0.5，文档注明建议升级。
- [downgrade 风险：回滚后旧代码 `extra="forbid"` 读到含 `context_length` 的 `compatibility_json` 会校验失败] → 见回滚。
- [拆分重试放大请求量] → 仅失败批次子集、深度有界、UI 进度口径不变；计费提示沿用既有「批次可能再次计费」文案。

## 回滚

还原本 change 的前后端文件即可；路由与既有字段均为 additive。唯一 downgrade 障碍：旧版 `LLMCompatibility`（`extra="forbid"`）无法解析含 `context_length` 键的存量 `compatibility_json`。回滚前先执行一次性清理（把各提供商 `compatibility_json` 中的 `context_length` 键删除），或随回滚带一个宽容解析补丁；无其它数据迁移。
