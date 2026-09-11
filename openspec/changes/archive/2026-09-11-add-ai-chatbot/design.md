## Context

现状（探索结论，详见各文件）：

- LLM 调用：`backend/services/llm_providers.py:251` `chat_completion()`（同步，内部 `asyncio.run`），底层 `backend/services/llm_compatibility.py:158` `bounded_completion` 用 httpx 请求，上游 SSE 在 `_SSE` 解析器内聚合成整段，**不向调用方暴露增量**。
- 字幕：`versions.latest_version_id(db, task_id)`（`backend/services/versions.py:146`）是校对/翻译共用的"当前版本"口径；`GET /tasks/{task_id}` 返回完整 segments。
- 前端：`/ai` 页（`app/src/routes/AIPage.tsx`）已有 tab nav（校对/翻译）+ 左侧任务选择列表；API client 为 fetch（`app/src/lib/api.ts`），已有 fetch 版 SSE 消费器 `app/src/lib/eventStream.ts:28` `consumeSseResponse`（支持 POST 流）。
- 持久化：migration 为 `backend/database/migrations.py:75` 的版本化列表，新增表 = 模型 + 一条 migration。
- Contract：`backend/tests/test_contract.py:36` 路由集合全量冻结，新路由必须登记；全局 event bus 的 `STABLE_EVENT_TYPES` 冻结为 7 种，不应用于 chat 流。

## 目标 / 非目标

**目标：**

- 一对表（会话/消息）+ 一组 REST/SSE 路由支撑持久化多轮对话。
- 单条消息提问走"POST 即 SSE 流"：一次请求内流式返回增量 token，结束后落库。
- 答疑知识库：构建期从 `docs/` 整理为结构化 chunks 文件，运行时纯本地关键词检索。
- `llm_compatibility` 增加可选 `on_delta` 回调，校对/翻译路径零行为变化。

**非目标：**

- 不引入向量模型、embedding 服务或任何新重型依赖。
- 不做多会话并行流式、不做跨设备同步、不做语音输入。
- 不改变校对/翻译/事件总线的任何现有 contract。
- 不做 RAG 对字幕的切块检索（MVP 直接注入当前版本全文字幕，超长则明确报错）。

## 决策

### 1. 数据模型：`chat_sessions` + `chat_messages`

- `chat_sessions`：`id`、`task_id`（nullable，绑定字幕任务）、`provider_id`、`title`（首条用户消息截断生成）、`created_at`、`updated_at`。删除会话级联删除消息。
- `chat_messages`：`id`、`session_id`、`role`（user/assistant）、`content`、`status`（complete/partial/error）、`created_at`。
- `partial` 状态承载"用户中止后保留已生成内容"的 spec 要求。
- 备选：复用 proofreading 的 run 表模式——被拒绝，对话是多轮交互而非一次性批处理，语义不合。

### 2. 流式链路：POST + SSE 响应，线程桥接

- 路由：`POST /chat/sessions/{session_id}/messages`，请求体 `{content}`，响应 `text/event-stream`，事件类型：`delta`（增量 token）、`done`（完整消息落库后的 message id）、`error`（分类错误码）。
- 不用全局 event bus（`STABLE_EVENT_TYPES` 被 contract 冻结，且会话流是点对点而非广播）。
- `async` 路由内不直接跑同步 LLM 调用（AGENTS.md 约束）：在 worker 线程中调用改造后的流式 completion，token 经 `queue.Queue` 桥接到 async 生成器产出 SSE——与 `EventBus.subscribe` 已有的 queue→async 桥接模式一致。
- `llm_compatibility.bounded_completion` 增加可选 `on_delta: Callable[[str], None]`：上游 SSE 逐 chunk 解析时回调增量；上游返回整段 JSON 时一次性回调全文（spec 的"回退"场景）。`chat_completion` 增加同名透传参数，默认 None = 行为不变。
- 中止：前端 AbortController 中断 fetch → 服务端检测到断开后停止 worker（协作式取消），已生成内容以 `partial` 落库。
- 备选：改造 event bus 增加 `chat.delta` 事件类型——被拒绝，会污染冻结的事件 contract 且广播模型不符。

### 3. 答疑知识库：构建期整理 + 运行时关键词检索

- 新增 `backend/services/chat_knowledge.py` + 数据文件 `backend/data/chat_knowledge.json`（由 `docs/` 用户文档人工整理+脚本校验生成，随应用分发；打包脚本需包含该文件）。
- chunks 按文档小节切分，每条含 `title`、`text`、`keywords`、`source_doc`。
- 检索：查询与 chunk 做字符 bigram 重合度打分（中文无需分词依赖），取 top-N（默认 3，分数阈值过滤）；零命中时按 spec 走"表明超出资料范围"路径。
- 备选：jieba 分词 / TF-IDF——被拒绝，引入依赖且 bigram 对该规模（数十个 chunk）足够。

### 4. 上下文组装与超长处理

- system prompt 声明助手角色（软件答疑 + 字幕问答）、资料边界与"不知为不知"要求。
- 消息序列：system（角色 + 命中知识段落）+ 绑定任务当前版本字幕（作为一条 system/user 上下文消息）+ 会话历史（按时间升序，保留最近 N 条并做 token 预算裁剪，裁掉最早的中间轮次）。
- 字幕文本在发送前估算长度；超出提供商上下文预算时直接返回 `LLM_PROVIDER_CONTEXT_TOO_LONG` 分类错误（复用现有错误码），不静默截断字幕本身。
- 取字幕走 `versions.latest_version_id` + 与 `to_response` 相同的 segments 组装，保证"当前版本"口径与校对/翻译一致。

### 5. 前端：/ai 第三个 tab + 受控流式渲染

- `AIPage` 加 `mode: 'chat'`；`ChatPanel` 组件含：会话列表侧栏、消息区、输入框、任务绑定选择器、提供商选择器（复用 `useLLMProvidersQuery` 与 `lastLLMProviderId` 记忆模式）。
- 提问：fetch POST，用 `consumeSseResponse` 风格的流式 reader 逐 `delta` 追加到本地状态（打字机效果），`done` 后失效 TanStack Query 会话缓存。
- `api.ts` 增加 typed 方法；新路由登记进 `test_contract.py` 冻结清单；SSE 事件名属本端点内部 contract，在 contract 测试中断言。

## 风险

- [上游 provider 对 SSE 的兼容性差异] → `on_delta` 在非 SSE 响应时整段回调；能力自测 (`llm_capabilities`) 后续可扩展流式探测，MVP 靠回退兜底。
- [worker 线程与 async 桥接的泄漏/悬挂] → queue 有界 + 断开检测 + 路由测试覆盖"流式期间其他 coroutine 可运行"（AGENTS.md 事件循环响应约束）。
- [字幕超长导致不可用] → 发送前明确报错；后续增量可做字幕分段检索，本 change 不做。
- [知识库与文档漂移] → chunks 文件记录 `source_doc`，脚本校验覆盖 docs 关键页面清单；归档时更新文档治理说明。
- [打包遗漏知识文件] → `scripts/build-server.sh` 与打包检查清单同步更新，发布门禁验证文件存在。

## 回滚

- migration 只新增两张表，回滚 = 移除路由登记与前端 tab；遗留空表无害，可写 drop migration 清理。
- `llm_compatibility` 新参数默认关闭，回滚不影响校对/翻译。
