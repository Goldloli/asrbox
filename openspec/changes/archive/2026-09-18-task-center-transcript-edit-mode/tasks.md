# Tasks

## 1. 编辑模式入口

- [x] 1.1 `TranscriptViewer.tsx` 标题行：新增"分段编辑"页签（`transcript.segmentEditing`），与"转写结果"互斥切换，激活态样式一致
- [x] 1.2 标题行右侧：编辑模式且有未保存更改时显示"放弃"+"保存"（保存居最右），编辑视图区内部移除重复的保存/放弃按钮

## 2. e2e 更新

- [x] 2.1 `transcript-editing.spec.ts`：`openTaskDetails` 断言"Segment editing"入口可见、默认无 `Segment text` 输入；改写"不恢复编辑器"类否定断言
- [x] 2.2 新增场景：进入编辑模式修改文本后从标题行保存，断言 PUT 全量分段、成功提示、草稿清空；保存失败场景断言错误提示与草稿保留

## 3. 验证

- [x] 3.1 `npm run typecheck`、`npm run test:frontend:unit`、`npx playwright test app/e2e/transcript-editing.spec.ts` 通过
- [x] 3.2 `openspec validate --changes task-center-transcript-edit-mode` 通过
