## 背景

`app/src/components/TranscriptViewer.tsx` 的 detail 模式持有 `detailView: 'transcript' | 'segments'` 状态（`TranscriptViewer.tsx:47`）：`segments` 分支（约 306-456 行）是完整的分段编辑视图（逐段文本/说话人/时间输入、字幕预览、查找替换、保存/放弃），保存走 `saveEdits` → `apiClient.updateSegments`（`PUT /tasks/{id}/segments`，`app/src/lib/api.ts:830`），成功后在 `onSuccess` 失效 task/tasks/versions 查询。当前标题行（约 268-278 行）只渲染"转写结果"一个按钮，`detailView` 又在任务切换时重置为 `transcript`，因此整个编辑分支不可达。i18n 键 `transcript.segmentEditing`（"分段编辑"/"Segment editing"）仍然保留。`app/e2e/transcript-editing.spec.ts` 现行断言编辑器不存在（`openTaskDetails` 中的 `toHaveCount(0)` 等），需要随本 change 翻转为正向断言。

## 目标 / 非目标

目标：

- 标题行增加"分段编辑"页签（`detailView = 'segments'`），样式与"转写结果"页签一致（激活时下划线强调色）。
- 编辑且有未保存更改时，标题行右侧显示"放弃"和"保存"；保存按钮位于该行最右端。
- 编辑视图内部不再重复显示保存/放弃按钮（避免两处按钮漂移不同步）。
- e2e 覆盖：默认只读、进入编辑、保存成功提交全量分段、保存失败保留草稿。

非目标：

- 不改编辑视图内部的字段布局（文本/说话人/时间输入保持现状）。
- 不新增后端能力；不改导出、版本恢复、AI 校对/翻译路径。
- 不在首页摘要模式或其它页面提供编辑入口。

## 决策

- **复用现有 `segments` 分支而非新建编辑器**：该分支是此前已发布、被 e2e 验证过的实现，重新接通入口是风险最低的恢复方式。
- **保存/放弃上移到标题行**：对应用户标注位置；编辑视图区保留"分段"标题与未保存标记 Badge，移除内部按钮。
- **页签样式沿用现有手写 tab 按钮**：标题行当前不是 weiui Tabs，保持同款按钮样式，激活态用 `border-[var(--app-accent)]`，非激活用透明边框 + muted 文本。
- **e2e 翻转策略**：`openTaskDetails` 中"Segment editing"改为可见、"Segment text"保持为 0（默认只读）；删除/改写"不恢复编辑器"类断言；新增保存成功与失败场景，复用 `mockEditingTask` 的 PUT 捕获。

## 风险

- 与活动 change `align-ui-with-approved-renderings` 的"移除分段编辑"决定方向相反：已在本 change proposal 中显式记录取代关系；归档时只触碰 `transcript-editing-versioning`，不与对方的 `frontend-quality` delta 冲突。
- 标题行在窄屏塞入页签与按钮：按钮仅在编辑且有草稿时出现，沿用现有 flex 换行，窄屏回归由既有宽度 e2e 覆盖。

## 回滚

- 还原 `TranscriptViewer.tsx` 与 `transcript-editing.spec.ts` 即回到只读转写结果；无持久化或 contract 变化。
