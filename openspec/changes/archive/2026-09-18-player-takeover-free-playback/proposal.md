## 为什么

AI 字幕核对/翻译中点击"播放这句话"后，底部播放条被片段边界锁死：片段结束自动暂停后再点播放条的播放按钮，只会回卷到片段起点重播这几秒（`app/src/components/PersistentAudioPlayer.tsx:66` 的回卷分支），用户无法从当前位置继续听后面的内容。

## 变更内容

- 底部播放条的播放与进度控件视为用户接管：点击播放（从暂停恢复）或拖动进度条时解除片段边界，从当前位置连续播放，直到用户手动暂停、关闭或媒体自然结束。
- 移除播放按钮在片段终点的"回卷重播"特殊分支；重听某句仍可再点该句的"播放这句话"。
- 句段试听入口行为不变：仍从（含冗余设置的）分段起点播放并在终点自动停止。

## 能力（Capabilities）

### New Capabilities

无。

### Modified Capabilities

- `transcript-proofreading`：新增"播放条接管后的自由播放"要求，区分句段试听的自动边界与用户对播放条的主动接管。

## 影响

- 前端：`app/src/stores/audioStore.ts`（新增 `releaseAudioClip`）、`app/src/components/PersistentAudioPlayer.tsx`（播放/seek 控件接管逻辑）。
- 测试：`app/src/stores/audioStore.test.ts` 单元用例；`app/e2e/llm-proofreading.spec.ts` 增加接管后继续播放的 e2e 场景（该文件已在 `test:e2e:maintained` 聚合中）。
- 规格：本 change 的 proposal、design、`transcript-proofreading` delta spec 与 tasks。
- 不改变音频路由 contract、句段试听边界逻辑或冗余设置；整曲播放（无片段边界）行为不变。
