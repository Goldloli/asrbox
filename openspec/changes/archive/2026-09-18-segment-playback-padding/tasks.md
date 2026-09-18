# Tasks

## 1. 状态与助手

- [x] 1.1 `app/src/stores/uiStore.ts`：新增 `segmentPlayPadding: number`（秒，默认 0）、`setSegmentPlayPadding`，`mergePersistedUiState` 把非档位值（0/0.5/1/2/3 之外）归一为 0
- [x] 1.2 `app/src/stores/audioStore.ts`：新增 `openSegmentAudio({ taskId, url, title, start, end })`，读取 uiStore 冗余，起点 `max(0, start - padding)`、终点 `end + padding` 后委托 `openAudio`

## 2. 界面接入

- [x] 2.1 `ProofreadingPanel.tsx` / `TranslationPanel.tsx` / `ChatPanel.tsx` 三处句段试听改用 `openSegmentAudio`
- [x] 2.2 `SettingsPage.tsx` 通用页签界面区新增"句段播放冗余" Select（严格/0.5/1/2/3 秒），并加入 `exportFrontendSettings` / `importFrontendSettings` 字段枚举
- [x] 2.3 `app/src/lib/i18n.ts` 增加中英文案

## 3. 验证

- [x] 3.1 `audioStore.test.ts`：冗余扩展、起点钳制到 0、冗余为 0 时与现状一致
- [x] 3.2 `uiStore.test.ts`：默认值 0、持久化非法值归一
- [x] 3.3 `npm run typecheck`、`npm run test:frontend:unit` 通过；`openspec validate --changes segment-playback-padding` 通过
