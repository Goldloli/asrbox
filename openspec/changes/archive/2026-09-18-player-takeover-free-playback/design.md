## 背景

句段试听通过 `openAudio({ startAt, endAt })` 在 `app/src/stores/audioStore.ts` 写入 `audioClipStart`/`audioClipEnd`；`app/src/components/PersistentAudioPlayer.tsx` 的 `onTimeUpdate` 用 `clipReachedEnd` 在片段终点暂停。播放按钮（`PersistentAudioPlayer.tsx:65-71`）当前在"暂停且已越过片段终点"时回卷到 `audioClipStart` 重播，导致播放条永远无法越过片段继续播放。只有三个 AI 面板的句段试听会设置片段边界，整曲播放（无 `endAt`）不受影响。

## 目标 / 非目标

目标：

- 用户点击播放条播放按钮（从暂停恢复）或拖动进度条时，解除片段边界并自由连续播放。
- 句段试听本身的自动起止行为（含句段播放冗余）保持不变。
- 单元与 e2e 覆盖接管语义。

非目标：

- 不改动 `openAudio` 的边界语义、循环播放逻辑或音量/关闭控件。
- 不引入"恢复片段边界"的 UI；重听片段通过再点句段试听完成。
- 不触碰任务中心内嵌播放器（waveform）逻辑。

## 决策

- **store 增加 `releaseAudioClip()`**：仅清空 `audioClipStart`/`audioClipEnd`，保持当前位置、播放意图和 URL。`clipReachedEnd` 对 null 边界天然不触发，`onTimeUpdate` 无需改动。
- **播放按钮去回卷**：按下播放时若存在片段边界则先 `releaseAudioClip()` 再置 `audioShouldPlay`，删除回卷到 `audioClipStart` 的分支。备选方案"保留回卷、仅在越过终点时接管"会保留歧义手势（想继续听却重播），放弃。
- **seek 即接管**：进度条 `onChange` 在有边界时同步解除，避免跳转到片段外仍被拖回边界停止。
- **循环状态不动**：片段打开时 `audioLoop` 被置 false，接管后保持 false，用户可自行打开循环（此时作用于整曲），与既有无边界语义一致。

## 风险

- 习惯旧"回卷重播"手势的用户少了一个快捷重听方式：仍可通过句段按钮重听，且该手势本身即是本次要消除的困扰来源。
- e2e 对音频元素使用 mock play/pause，接管断言通过模拟 `timeupdate` 越过原终点验证不再暂停。

## 回滚

- 还原 `audioStore.ts` 与 `PersistentAudioPlayer.tsx` 的改动即恢复回卷重播行为；无持久化或 contract 变更，无迁移负担。
