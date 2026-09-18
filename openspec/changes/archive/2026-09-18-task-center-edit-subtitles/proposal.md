## 为什么

上一轮按用户初步描述恢复了旧"分段编辑"页签，但用户明确反馈：要的不是旧编辑器（字幕预览、时间/说话人输入框、查找替换、全文工具那一套），而是一个与"转写结果"观感一致的轻量"编辑字幕"模式——同样的行布局、同样可点播放，只是文字可直接编辑，标题行右侧保存。旧分段编辑代码永久删除。

## 变更内容

- **删除**旧分段编辑视图：字幕预览区、逐段开始/结束时间与说话人输入框、逐段复制按钮、全文与替换工具区，以及仅服务于它们的 `countTextMatches` / `renderHighlightedText` / `replaceTextMatches` / `formatSubtitlePreview` 工具函数和相关 i18n 键。
- **新增**"编辑字幕"模式：与"转写结果"并排列于标题行；行布局与只读转写一致（播放跳转按钮、时间范围、说话人徽标、文字），仅文字替换为可编辑输入框；编辑暂存为草稿。
- 标题行右侧在有未保存更改时显示"放弃更改"与"保存更改"（保存在最右端，即用户图中标注位置）；保存通过既有 `PUT /tasks/{id}/segments` 一次提交全部分段并创建单个不可变 `edit` 版本，失败保留草稿。
- 编辑模式下点击分段左侧播放按钮行为与只读模式一致（跳转并从该句播放）。
- e2e：更新 `transcript-editing.spec.ts` 以匹配新模式。

## 能力（Capabilities）

### New Capabilities

无。

### Modified Capabilities

- `transcript-editing-versioning`：改写"任务中心分段编辑模式"要求为"编辑字幕"模式——只读观感、仅文字可编辑、标题行保存；旧分段编辑表单及其工具区不再提供。

## 影响

- 前端：`app/src/components/TranscriptViewer.tsx`（删除旧编辑分支、新增编辑字幕分支）、`app/src/components/transcript/transcriptUtils.tsx`（删除 4 个仅旧编辑器使用的函数，保留 `drawAudioWaveform`）、`app/src/lib/i18n.ts`（删除旧编辑器专属文案，新增 `transcript.editSubtitles`）。
- 测试：`app/e2e/transcript-editing.spec.ts`。
- 规格：本 change 的 proposal、design、`transcript-editing-versioning` delta spec 与 tasks。
- 不改变后端接口与版本语义；分段结构变更（拆分/合并/增删）能力不在本次范围。
