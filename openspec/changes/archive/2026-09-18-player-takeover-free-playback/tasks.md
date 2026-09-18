# Tasks

## 1. 状态与播放器

- [x] 1.1 `app/src/stores/audioStore.ts`：新增 `releaseAudioClip()`，仅清空 `audioClipStart`/`audioClipEnd`，保持位置与播放意图
- [x] 1.2 `app/src/components/PersistentAudioPlayer.tsx`：播放按钮从暂停恢复且有片段边界时先解除边界再播放，删除回卷重播分支；进度条 `onChange` 在有边界时同步解除

## 2. 验证

- [x] 2.1 `audioStore.test.ts`：`releaseAudioClip` 清空边界且保持 `audioCurrentTime`/`audioShouldPlay`；片段边界仍在终点自动停止的既有用例保持通过
- [x] 2.2 `app/e2e/llm-proofreading.spec.ts`：新增场景——片段自动停止后点击播放条播放按钮，模拟 `timeupdate` 越过原终点不再暂停
- [x] 2.3 `npm run typecheck`、`npm run test:frontend:unit`、`npm run test:e2e:llm` 通过；`openspec validate --changes player-takeover-free-playback` 通过
