## 背景

`TranscriptViewer.tsx` 的 `detailView: 'transcript' | 'segments'` 中，`segments` 分支是旧分段编辑器（字幕预览、逐段时间/说话人输入、逐段复制、全文与替换工具），用户明确要求**不做**这个形态，而是与只读转写结果同观感的"编辑字幕"。上一 change 已把保存/放弃按钮移到标题行右侧（编辑且有草稿时显示），本次保留该结构。只读分支的行布局（`grid-cols-[28px_112px_84px_minmax(0,1fr)]`、播放跳转按钮、`Badge` 说话人、文字列）即是新模式基准。`countTextMatches` / `renderHighlightedText` / `replaceTextMatches` / `formatSubtitlePreview` 仅被旧编辑器引用（`transcriptUtils.tsx`），可安全删除；`drawAudioWaveform` 被波形播放器使用，保留。

## 目标 / 非目标

目标：

- 新"编辑字幕"分支：复用只读行布局，文字列换成 `Textarea` 绑定草稿；保留播放跳转与激活分段高亮/自动滚动（既有"不抢焦点"守卫继续生效）。
- 草稿简化为 `Record<number, string>`（仅文字）；保存仍提交全部分段（时间/说话人取原值）。
- 删除旧编辑器 JSX、状态（searchQuery/replaceQuery/subtitleFormat/matchCount 等）、4 个工具函数、旧编辑器专属 i18n 键；新增 `transcript.editSubtitles`。
- e2e 断言改为"Edit subtitles"入口与文字编辑路径。

非目标：

- 不提供时间/说话人编辑、查找替换、字幕预览（随旧编辑器一并移除）。
- 不改保存接口、版本语义、只读转写视图与波形播放器。

## 决策

- **编辑分支与只读分支共用行结构**：两个分支各自渲染（互斥），行内 grid 类名完全一致，保证观感统一；`segment-row` / `data-segment-id` / 激活高亮不变。
- **草稿类型收窄为 `Record<number, string>`**：只有文字可编辑，`setSegmentDraft` 简化为"与原文不同才记草稿"，删除 `setSegmentTime`。
- **i18n 键瘦身**：删除仅旧编辑器使用的键（subtitlePreview、fullTextTools、fullTextReadOnly、searchPlaceholder、replacePlaceholder、replaceAll、matches、noMatches、replaceApplied、timestampStart、timestampEnd、copySegment、segmentEditing、unsavedChanges、placeholder）；`transcript.segments` 仍被 `AIPage` 使用，保留。
- **按钮位置沿用上一 change**：保存/放弃留在标题行右侧，编辑分支内部不再出现。

## 风险

- 曾使用旧编辑器调时间/说话人的用户失去该入口：产品决定，规格同步记录"不提供"；后端批量接口仍支持这些字段，未来需要时可加回。
- e2e 中"Subtitle preview / Segments 不出现"的断言在新模式下依然成立（这些区块被删除而非隐藏）。

## 回滚

- 还原 `TranscriptViewer.tsx`、`transcriptUtils.tsx`、`i18n.ts` 与 e2e 的本次改动即可；无持久化或 contract 变化。
