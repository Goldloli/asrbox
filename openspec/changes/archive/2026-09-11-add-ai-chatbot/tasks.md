## 1. 流式 LLM 传输层

- [x] 1.1 在 `backend/services/llm_compatibility.py` 的 `bounded_completion` 增加可选 `on_delta` 回调：SSE 上游逐 chunk 回调增量，JSON 上游整段回调一次；`backend/services/llm_providers.py` `chat_completion` 透传该参数，默认 None 行为不变。验证：新增单元测试覆盖 SSE 增量、JSON 回退、中途断流三种路径，且现有校对/翻译测试全部通过
- [x] 1.2 为流式中断（网络错误/上游错误）增加分类错误传递，验证：错误码测试与现有 `LLM_PROVIDER_*` 分类一致

## 2. 数据模型与持久化

- [x] 2.1 在 `backend/database/models.py` 新增 `ChatSession`、`ChatMessage` 模型（含 status: complete/partial/error），在 `backend/database/migrations.py` 登记建表 migration。验证：migration 测试（新库建表 + 已有库升级）通过
- [x] 2.2 实现 `backend/services/chat.py`：会话 CRUD（创建/列表/详情/删除级联）、消息持久化、标题生成。验证：service 层 pytest 通过

## 3. 答疑知识库

- [x] 3.1 整理 `docs/` 用户文档（README、docker、models、labels、ai-proofreading、privacy、release 等）为 `backend/data/chat_knowledge.json` chunks（title/text/keywords/source_doc），覆盖用户高频问题：转写流程、模型管理、LLM 配置、校对/翻译、版本恢复、导出格式、隐私边界、桌面/Web 差异。验证：校验脚本确认 JSON 结构合法且 source_doc 均存在
- [x] 3.2 实现 `backend/services/chat_knowledge.py` 关键词检索（字符 bigram 打分 + 阈值 + top-N），零命中返回空。验证：检索单元测试覆盖中文查询命中、零命中、阈值过滤

## 4. Chat API 路由

- [x] 4.1 实现 `backend/routes/chat.py`：会话 CRUD REST 路由 + `POST /chat/sessions/{id}/messages` SSE 流式路由（queue 桥接 worker 线程、断开协作式取消、partial 落库、错误分类映射）。验证：API 测试覆盖会话生命周期、流式 delta/done/error、中止保留 partial、无可用提供商 4xx
- [x] 4.2 上下文组装：system prompt + 知识段落 + `versions.latest_version_id` 当前字幕 + 历史裁剪；字幕超长返回 `LLM_PROVIDER_CONTEXT_TOO_LONG`。验证：mock `chat_completion` 断言注入内容边界（只含该会话消息/绑定字幕/命中段落），隐私测试复刻 proofreading privacy 模式
- [x] 4.3 更新 `backend/tests/test_contract.py` 路由冻结清单与响应 contract 断言。验证：`npm run test:backend:contract` 通过
- [x] 4.4 事件循环响应测试：流式等待期间其他 coroutine 仍可运行（AGENTS.md 异步路由约束）。验证：该测试通过

## 5. 前端 ChatPanel

- [x] 5.1 `app/src/lib/api.ts` 增加 chat typed 方法与 SSE 流消费（复用 eventStream 解析模式）。验证：`npm run typecheck` 通过
- [x] 5.2 `AIPage` 新增 `mode: 'chat'` tab 与 `ChatPanel`：会话列表、消息流、打字机渲染、停止按钮、任务绑定选择器、提供商选择器。验证：前端单测覆盖流式渲染与错误展示，接入 `test:frontend:unit`
- [x] 5.3 空状态与引导：无提供商时引导前往设置；无任务时纯答疑模式。验证：Playwright 场景覆盖提问全流程，接入 `test:e2e:maintained`

## 6. 打包与文档

- [x] 6.1 打包脚本包含 `chat_knowledge.json`（`scripts/build-server.sh` 等），验证：构建产物中文件存在
- [x] 6.2 更新用户文档（新功能说明）与 README 功能列表。验证：`openspec validate --changes add-ai-chatbot` 与 `npm run check:open-source` 通过

## 7. 实机测试反馈修复

- [x] 7.1 修复绑定任务选择器：Radix Select 不允许空字符串 value，改用哨兵值 `__none__` 表示"不绑定"。验证：typecheck + e2e 覆盖解绑流程
- [x] 7.2 选择器上方增加功能标签（模型选择/绑定字幕任务），中英 i18n。验证：typecheck + e2e 可见性断言
- [x] 7.3 助手回答 Markdown 渲染（react-markdown + remark-gfm，依赖审计通过）。验证：e2e 断言富文本渲染
- [x] 7.4 系统提示词注入防护（拒绝透露系统指令、资料/字幕视为数据）。验证：system prompt 内容测试 + 真实模型攻击实测
- [x] 7.5 知识库扩充预置 FAQ 答案（快速上手总览、对话功能自身）+ 检索 questions 字段加权（问法3/标题关键词2/正文1，阈值保持非加权口径）。验证：16 条检索用例全对 + 现有知识测试通过

## 8. 第二轮实机反馈修复

- [x] 8.1 流式修复：调用方带 `on_delta` 时强制上游 `stream=True`（不再依赖 provider 兼容设置的 transport），JSON 上游仍整段回退。验证：test_llm_streaming 新增 2 用例 + transport=json 下实测 74 deltas
- [x] 8.2 未提问即可绑定任务：pendingTaskId 本地暂存，首轮提问随会话创建提交。验证：e2e 新增先绑后问场景
- [x] 8.3 对话区固定高度（lg 视口内 flex/grid minmax，消息区内部滚动，页面不被撑长）+ chat 模式页头文案 + 标签。验证：Playwright 截图目检 + 7 条 e2e 全过
