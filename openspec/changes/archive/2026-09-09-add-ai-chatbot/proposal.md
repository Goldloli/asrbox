## 为什么

用户在使用 ASRbox 时遇到问题只能离开软件去翻文档，查看长字幕内容（如"这段话有没有提到 X""帮我总结一下"）也只能人工通读。软件已经具备完整的 LLM provider 配置与调用能力（校对、翻译都在用），但没有让用户以自然语言对话的方式利用这些能力。

## 变更内容

- 在 `/ai` 页面新增"对话"tab，提供 LLM chatbot：
  - **软件使用答疑**：基于随应用分发的用户文档知识库（由 `docs/` 整理而来），用关键词检索（不使用向量/embedding）命中相关段落注入 prompt 后作答。
  - **字幕内容问答**：用户选定一个已完成转写任务的当前版本字幕后，可就其内容提问（总结、查找某句话等），字幕内容作为上下文注入 prompt。
  - 两种模式可叠加：选定字幕后即可同时问软件用法和字幕内容。
- 对话历史持久化：新增 `chat_sessions` / `chat_messages` 表与 migration，可回看、继续、删除历史会话。
- 打字机式流式输出：新增 chat SSE 端点，改造 `llm_compatibility` 使其把上游 SSE 增量 token 透传给调用方，前端流式渲染。
- 新增受维护 API 路由（chat 会话 CRUD + 流式提问），同步更新 contract 路由冻结清单、typed client 与 OpenSpec。

## 能力（Capabilities）

### New Capabilities

- `ai-chatbot`：对话式 LLM 助手——会话管理、流式回答、软件使用答疑（文档关键词检索）、字幕内容问答（绑定任务当前版本字幕）。

### Modified Capabilities

- `llm-provider-management`：`llm_compatibility` 的传输层需新增"向调用方流式暴露增量 token"的能力（现有行为保持兼容，新增可选回调，不破坏校对/翻译的整段聚合模式）。

## 影响

- **后端**：新路由 `backend/routes/chat.py`、新 service `backend/services/chat.py` + 答疑知识检索模块、新数据库表与 migration、`backend/services/llm_compatibility.py` 增加流式回调、`backend/tests/test_contract.py` 路由冻结清单更新。
- **前端**：`/ai` 新增"对话"tab 与 `ChatPanel` 组件、`app/src/lib/api.ts` typed 方法与 SSE 消费、会话列表 UI。
- **数据**：`data/asrbox.db` 新增两张表（migration）；新增随应用分发的答疑知识文件（从 `docs/` 整理）。
- **文档/规格**：新 spec `ai-chatbot`，更新 `llm-provider-management` spec、相关用户文档。
