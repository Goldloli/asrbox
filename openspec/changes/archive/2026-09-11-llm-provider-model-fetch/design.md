# Design: llm-provider-model-fetch

## 背景

关键代码事实（已核实）：

- 预设与校验：`llm_providers.py:27-71` 七个预设（ollama 默认 `http://localhost:11434/v1`、免 key；容器内替换为 `host.docker.internal`，`:77-85`）；`validate_base_url`（`:121-134`）强制 http/https、禁凭据/查询/片段、远程必须 HTTPS。
- 传输纪律：`llm_compatibility.py:162-200` `bounded_completion` 使用 `httpx.AsyncClient(follow_redirects=False)` + `asyncio.timeout` + 字节上限 `MAX_RESPONSE_BYTES`，错误分类为 LLMProviderError 各 code；测试工具 `mock_transport`（`test_translation_execution.py:30-35`）monkeypatch `llm_compatibility.httpx.AsyncClient`。
- 路由：`routes/llm_providers.py:64-78` 的 test/test-capabilities 走 `run_in_threadpool`；路由清单在 `test_contract.py` 冻结。
- 前端表单：`LLMProvidersPanel.tsx:162-259`，`default_model` 为纯文本 Input（`:243`）；编辑时 api_key 留空表示沿用已保存 key（`providers.keepKey` hint）。
- 凭据保护：响应经 `to_response`（`:160-173`）只出 `api_key_masked`。

## 目标 / 非目标

**目标：** 表单内一键拉取模型 ID（免保存）；Ollama 原生列表回退；编辑场景可复用已保存 key；失败按既有错误码分类；default_model 交互改为可拉取可选可手输。

**非目标：** 不改动 chat completion / 能力测试链路；不为 ASR 在线提供商做模型拉取；不做模型搜索/过滤/排序推荐；不持久化模型列表。

## 决策

### D1: 专用探测端点 `POST /llm-providers/models`，请求内联、不落盘

请求体 `LLMProviderModelsRequest {preset, base_url, api_key?, provider_id?}`；响应 `LLMProviderModelsResponse {ok, items: string[], message, error_code?}`，沿用 `LLMProviderTestResponse` 的「200 + ok 标志」模式而非 HTTP 错误码（与 `:64-69` test 端点一致，前端单一处理路径）。备选「复用 test 端点顺带返回模型」会把连接测试与列表拉取耦合成一种语义，且 test 只接受已保存 provider_id，违背「免保存」目标，否决。

### D2: 传输复用 llm_compatibility 的有界纪律

在 `llm_compatibility.py` 新增 `bounded_get(url, headers, timeout, max_response_bytes)`：同一 `httpx.AsyncClient(follow_redirects=False)` 工厂（测试可复用 `mock_transport`）、`asyncio.timeout`、流式累加字节上限，错误分类复用 TIMEOUT/UNAVAILABLE/RESPONSE_TOO_LARGE。服务层 `fetch_models(db, payload)`：

1. `_validate_preset` + `validate_base_url`（ValueError 与 LLMProviderError 统一收敛为 `ok:false` + 错误码，与 test 端点先例一致，前端单一处理路径；不安全 endpoint 在发起任何请求前被拒绝）。
2. key 解析：内联 `api_key` 优先；为空且带 `provider_id` 时从 db 取已保存 key（查无此 provider → 404）。
3. 请求 `{base_url}/models`（有 key 带 Bearer）。
4. 状态码分类：401/403 → AUTH_FAILED；429 → RATE_LIMITED；其它非 2xx → HTTP_ERROR（与 `chat_completion` 一致）。
5. 解析 `{data: [{id}]}`：去重保序、上限 500 条；结构非法 → INVALID_RESPONSE。
6. **Ollama 回退**：仅当 `preset == 'ollama'` 且 `/models` 未成功（连接失败/非 2xx/解析失败）时，请求 `{base_url 去掉尾部 /v1}/api/tags`，解析 `{models: [{name}]}`。

备选「ollama 直接只调 /api/tags」对新版 Ollama 的 OpenAI 兼容层与其它伪装成 ollama 预设的网关不通用，否决；备选「所有预设都回退 /api/tags」会让云端 401 被二次无意义请求放大，否决。

### D3: 端点异步纪律

路由 `run_in_threadpool(fetch_models, ...)`，服务内 `asyncio.run(bounded_get(...))`，与 `chat_completion`（`:254-290`）同款，不阻塞事件循环。

### D4: 表单交互——输入框 + 拉取按钮 + 结果下拉

`default_model` 行：保留文本 Input（手输能力不丢），右侧「拉取模型」`type="button"` 按钮；拉取进行中按钮 spinner 禁用；成功后输入框下方出现 Select（首项哨兵 `__none__` =「从列表选择…」，遵守 weiui 空值禁令），点选即填入 Input；items 为空显示 muted 提示；失败 toast.error(message)。切换 preset/base_url 后清空已拉取列表（避免把 A endpoint 的模型填进 B）。i18n 双语 key。

### D5: e2e 与测试

- 后端新测试文件 `test_llm_model_list.py`：复用 `mock_transport`，覆盖 /models 正常解析、401 分类、ollama /models 404→/api/tags 回退（断言回退 URL 去掉 /v1）、provider_id 复用已保存 key（handler 断言 Authorization 头）、key 不出现在响应体、非法 base_url 400；contract 测试加路由与响应字段断言。
- 前端 e2e `llm-provider-models.spec.ts`：route 拦截 `POST /llm-providers/models`，开对话框→填 base_url/key→拉取→下拉选择→断言 Input 已填；接入 `test:e2e:maintained`（package.json 聚合命令同步）。

## 风险

- [内联 base_url 探测被当 SSRF 跳板] → 与保存路径同一份 `validate_base_url` + 不跟随 redirect + 有界超时/体积；该端点能力与既有 test 端点同级（本机用户配置自己的 endpoint）。
- [key 经 provider_id 复用时泄露] → key 只用于 Authorization 头；响应模型仅 ok/items/message/error_code；错误 message 用分类文案不回带上游 body。
- [拉取到的列表与最终保存的 endpoint 不一致] → D4 切换 preset/base_url 即清空列表。
- [Ollama 容器场景] → `list_presets` 的容器 base_url 替换只影响预设预填值；回退 URL 由用户实际填写的 base_url 派生，天然兼容。

## 回滚

还原本 change 的前后端文件即可；端点与字段均为 additive；无数据迁移。
