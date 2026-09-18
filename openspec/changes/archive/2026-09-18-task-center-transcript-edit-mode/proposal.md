## 为什么

任务中心移除"分段编辑"页签后，用户在校对转写结果时只能逐句去 AI 工作区核对，无法直接手动改字幕。实际上 `TranscriptViewer` 的分段编辑视图（文本/说话人/时间编辑、暂存草稿、批量保存、创建不可变 edit 版本）仍完整保留在代码中，只是入口被移除成为不可达代码；现按用户要求以"转写结果旁的编辑模式 + 标题行右侧保存"的形态恢复该能力。

本 change 取代活动 change `align-ui-with-approved-renderings` 中"移除分段编辑页签"的决定（该决定源于当时的产品图校准；用户现已明确要求恢复编辑入口）。

## 变更内容

- 任务中心转写结果标题行新增与"转写结果"并列的"分段编辑"模式页签；默认仍是只读转写结果。
- 编辑模式复用现有分段编辑视图：逐段编辑文本、说话人和起止时间，含字幕预览与全文查找替换工具。
- 存在未保存更改时，标题行右侧显示"放弃"与"保存"按钮（保存按钮位于该行最右端，对应用户标注位置）；保存通过既有 `PUT /tasks/{id}/segments` 一次性提交全部分段并创建单个不可变 edit 版本，失败保留草稿。
- 更新 `transcript-editing.spec.ts`：把"编辑器已移除"的否定断言改为新编辑模式的正向断言，并覆盖保存成功/失败路径。

## 能力（Capabilities）

### New Capabilities

无。

### Modified Capabilities

- `transcript-editing-versioning`：新增"任务中心分段编辑模式"要求，规定编辑入口、默认只读、标题行保存/放弃操作与失败草稿保留。

## 影响

- 前端：`app/src/components/TranscriptViewer.tsx`（标题行页签与保存/放弃按钮位置）。
- 测试：`app/e2e/transcript-editing.spec.ts` 断言更新与新增保存路径场景。
- 规格：本 change 的 proposal、design、`transcript-editing-versioning` delta spec 与 tasks。
- 不改变后端批量更新 endpoint、版本语义或既有编辑视图的内部结构；`align-ui-with-approved-renderings` 归档时其 frontend-quality delta 与本 change 的 transcript-editing-versioning delta 不重叠。
