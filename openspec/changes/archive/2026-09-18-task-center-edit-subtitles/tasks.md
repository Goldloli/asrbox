# Tasks

## 1. TranscriptViewer 重写编辑模式

- [x] 1.1 `detailView` 改为 `'transcript' | 'edit'`；标题行页签为"转写结果"/"编辑字幕"（新增 `transcript.editSubtitles` 文案），保存/放弃按钮条件改为 `detailView === 'edit' && hasDraftEdits`
- [x] 1.2 新增编辑字幕分支：复用只读行布局，文字列为 `Textarea`（aria-label 保持 `transcript.segmentText`），草稿收窄为 `Record<number, string>`，删除 `setSegmentTime`、`copyText`、查找替换相关状态与函数
- [x] 1.3 删除旧 `segments` 分支（字幕预览、时间/说话人输入、逐段复制、全文工具）及不再使用的 import

## 2. 死代码清理

- [x] 2.1 `transcriptUtils.tsx` 删除 `countTextMatches` / `renderHighlightedText` / `replaceTextMatches` / `formatSubtitlePreview` 及其私有辅助，保留 `drawAudioWaveform`
- [x] 2.2 `i18n.ts` 删除旧编辑器专属键（中英两份），新增 `transcript.editSubtitles`

## 3. e2e 与验证

- [x] 3.1 `transcript-editing.spec.ts`：入口改为 "Edit subtitles"，验证编辑保存成功/失败路径与只读默认
- [x] 3.2 `npm run typecheck`、`npm run test:frontend:unit`、`npx playwright test app/e2e/transcript-editing.spec.ts` 通过
- [x] 3.3 `openspec validate --changes task-center-edit-subtitles` 通过
