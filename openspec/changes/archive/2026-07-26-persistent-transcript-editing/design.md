# Design: persistent-transcript-editing

## 背景

- 前端三类编辑全部落在组件 state：`TranscriptViewer.tsx:18-20`（`editedTextByTask`/`speakerLabelsByTask`/`segmentTimesByTask`），`:67-99` 保存仅写 state + toast。组件挂在路由下，卸载即丢。
- 后端 `task.text` 由 `transcript_text_from_segments`（`backend/utils/transcript_text.py:25-34`）从段落派生：换行被规整、段间按标点规则补空格——**整文是 lossy 投影**，编辑后的整文字符串无法可靠切回带时间的段落。这决定了整文自由编辑不能成为持久化入口。
- 既有版本机制：`backend/services/tasks.py:1299-1306` `_save_edit_version` 每次编辑操作重排 idx、重算 text、创建一个 `edit` 版本。逐段 PATCH 保存 N 段会产生 N 个版本，不适合"一次保存多处修改"。
- 轮询覆盖缺陷：`TranscriptViewer.tsx:44-48` effect 依赖 `displayedText`，转写中每次轮询都重置草稿。

## 目标 / 非目标

目标：用户可感知的三类编辑（段落文本/说话人/时间戳）显式保存后持久化、创建单个 edit 版本、影响导出；编辑期间不被轮询打断；行为与 `transcript-editing-versioning` 主 spec 对齐。

非目标：结构编辑 UI（split/merge/新建/删除）；整文自由编辑的持久化（技术上不可靠，见背景）；TasksPage 元数据持久化；编辑器大改版（撤销栈、自动保存）。

## 决策

### D1. 后端：批量内容更新端点，拒绝结构变更

`PUT /tasks/{task_id}/segments`，请求 `SegmentsBulkUpdateRequest { segments: [{id, start, end, text, speaker}] }`：
- 任务不存在 → 404；
- 提交段落 id 集合必须等于当前段落 id 集合，否则 400（结构变更必须走既有专用端点，保持端点职责单一）；
- 每段 `0 <= start < end`，否则 400 并指明段落；
- 单事务更新全部字段 → `_save_edit_version`（恰好一个 edit 版本）→ 返回 `TranscriptionTaskResponse`。

备选：前端逐段 PATCH 并发保存——否决：N 段产生 N 个版本、部分失败留半状态。
备选：允许增删段的通用 replace——否决：与结构端点职责重叠，误用风险大；本 change 不需要。

### D2. 前端：统一草稿 + 显式保存

- 新增一个草稿状态（替换现有三个 map）：`draftEdits: Record<segmentId, {text?, speaker?, start?, end?}>`。段落文本变为可编辑输入（多行 Textarea 自适应或单行 Input，与现有说话人/时间戳输入并列）。
- 存在草稿时显示"未保存的更改"Badge 与 保存/放弃 按钮；保存把当前段落按草稿合并后整体 PUT；成功 → 清空草稿、invalidate `task`/`tasks`/`versions` 查询、toast 成功（含"已创建新版本"语义）；失败 → 保留草稿并 toast 错误。
- effect 只在 `task?.id` 变化时重置草稿与编辑态（修复轮询覆盖）；服务器数据刷新不再冲掉草稿。
- 渲染合并：`displaySegments = task.segments.map(merge(draft))`（现有时间戳合并模式扩展到全字段）。
- 搜索/替换：替换在**段落实文本**（草稿合并后）上逐段应用，写入草稿待保存；不再改整文。

### D3. 整文区域降级为只读

移除整文编辑 textarea 与"保存/取消编辑"按钮，整文仅展示（保留搜索高亮与复制）。这是唯一被移除的用户可见入口：它保存的内容从未持久化（假功能），且无法可靠持久化。i18n 增加说明性提示（编辑请使用段落列表）。

### D4. i18n 文案同步

移除/替换 `transcript.localEdit`、`localEditHint`、`localEditSaved`、`replaceSaved`、`saveLocalEdit` 等"仅本次会话"语义键，新增未保存/保存成功/校验失败文案；zh/en 同步。

## 风险

- 用户习惯整文粘贴大段改写 → 段落级编辑摩擦更高；以 D3 提示 + 段落内替换缓解。该取舍已在 proposal 声明。
- 长任务段落多（数千段）时整体 PUT 体积大 → 仅发送合并后的全量段落（数千段 JSON 数百 KB，本地后端可承受）；不做增量协议（复杂度）。
- 编辑期间任务被重转写 → 保存时 id 集合不符返回 400，前端 toast 并保留草稿供用户取舍。

## 回滚

纯新增端点 + 前端行为变更，无持久化格式变更；revert 即可。已创建的 edit 版本不受影响（版本不可变）。
