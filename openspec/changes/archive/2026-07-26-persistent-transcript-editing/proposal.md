# Proposal: persistent-transcript-editing

## 为什么

2026-07 审计与复核确认：前端字幕编辑是"假功能"，且违反已接受的正式规格：

- `app/src/components/TranscriptViewer.tsx:18-20, 68-72` 把文本、说话人、时间戳编辑只保存在组件内 `useState`；切换路由组件卸载即全部丢失；导出走后端 `/tasks/{id}/export/{format}` 渲染的是数据库段落，本地编辑**不影响导出内容**——用户"保存"后导出 SRT 仍是旧文本。
- `openspec/specs/transcript-editing-versioning/spec.md` 要求"保存编辑后当前字幕反映该编辑且可导出"、每次编辑创建不可变版本；README 也承诺手工编辑与版本能力。当前实现与两者冲突，属发布阻断项。
- 后端段落编辑 API（PATCH/POST/DELETE/split/merge，`backend/routes/tasks.py:178-215`）已存在并有版本快照，但前端 `apiClient` 完全没有接线。
- 附带缺陷：编辑进行中若任务轮询刷新（转写中 text 增长），`TranscriptViewer.tsx:44-48` 的 effect 会覆盖草稿并强制退出编辑。

## 变更内容

- **新增批量段落更新端点** `PUT /tasks/{task_id}/segments`：一次性提交全部段落的 text/speaker/start/end 修改；校验段落 id 集合与当前一致（结构变更仍走专用端点）、`0 <= start < end`；单事务落库、重算 task.text、创建**一个** `edit` 版本快照；加入契约 freeze。
- **前端编辑持久化**：TranscriptViewer 的说话人、时间戳、段落文本编辑改为"暂存草稿 → 显式保存/放弃"模型；保存调用批量端点，成功后清理草稿并失效相关查询；未保存修改有明确标识。
- **段落文本可编辑**：段落行的文本从只读变为可编辑输入，与说话人/时间戳一起进入同一草稿。
- **整文自由编辑下线**：整文 textarea 是段落的 lossy 投影（`transcript_text_from_segments` 会把换行规整为空格流），无法可靠映射回带时间的段落；整文区域改为只读展示，编辑入口收敛到段落级。搜索/替换保留，替换按段落文本逐项应用并进入同一待保存草稿。
- **修复草稿被轮询覆盖**：effect 只在切换任务时重置，编辑期间不再被服务器数据冲掉。
- **i18n 文案**：`localEdit/localEditHint/localEditSaved` 等"仅本次会话"文案替换为持久化语义。

## 能力（Capabilities）

### Modified Capabilities
- `transcript-editing-versioning`: `Editable transcript segments` 明确批量保存语义（一次保存 = 一个 edit 版本）、段落 id 集合校验、整文视图为派生只读。

## 影响

- API：新增 `PUT /tasks/{task_id}/segments`（请求/响应均为带类型模型；响应为 `TranscriptionTaskResponse`）；契约 freeze 与测试同步新增。既有端点不变。
- 后端：`backend/models.py`（请求模型）、`backend/services/tasks.py`（`update_segments_bulk`）、`backend/routes/tasks.py`；新增 pytest（happy path、id 集合不符 400、非法时间 400、单版本断言）。
- 前端：`app/src/components/TranscriptViewer.tsx`、`app/src/lib/api.ts`（client 方法 + 类型）、`app/src/lib/i18n.ts`（文案）；e2e 增加"编辑→保存→导出一致"场景（若 mock 基建支持）。
- 用户可见行为变化：整文自由编辑入口移除（段落级编辑替代）；"保存"现在真正落库并影响导出；升级前 README/规格本就承诺该行为，属修复而非回退。
- 不变量保持：版本不可变（每次保存新增 edit 版本）、typed consumer、options_json 不泄漏。
- 非目标：段落结构编辑（split/merge/新建/删除）的 UI——后端已具备，UI 留待后续 change；TasksPage 的标签/收藏/笔记持久化（另议）。
