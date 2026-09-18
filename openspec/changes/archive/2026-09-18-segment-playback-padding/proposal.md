## 为什么

AI 字幕核对工作区中每条修改意见的"播放这句话"严格按照分段起止时间播放（`app/src/components/transcript/ProofreadingPanel.tsx` 的 `playSegment` 直接把 `segment.start`/`segment.end` 传给 `openAudio`）。句子边界的起止点常常贴得很紧，用户试听时缺少前后语境，难以判断修改是否自然；目前只能手动 seek 补偿。

## 变更内容

- 通用设置新增"句段播放冗余"选项，单位秒，可选 0（严格按时间轴，默认）/ 0.5 / 1 / 2 / 3，前端本地持久化，并纳入前端设置的导出/导入。
- AI 工作区三处"播放这句话"入口（字幕核对、字幕翻译、AI 对话引用试听）统一在打开播放片段时按该设置向前后各扩展相应秒数；起点向下钳制到 0，终点超出媒体时长时自然播放到媒体结束。
- 默认值为 0，未更改设置的用户行为与现状完全一致。

## 能力（Capabilities）

### New Capabilities

无。

### Modified Capabilities

- `transcript-proofreading`：新增"可配置的句段播放冗余"要求，规定 AI 工作区句段试听的默认严格行为、可选前后冗余及其持久化与导入导出。

## 影响

- 前端：`app/src/stores/uiStore.ts`（新增本地偏好与 setter）、`app/src/stores/audioStore.ts`（新增共享的句段打开助手）、`ProofreadingPanel.tsx` / `TranslationPanel.tsx` / `ChatPanel.tsx` 三处调用点、`app/src/routes/SettingsPage.tsx`（通用页签选项与导入导出）、`app/src/lib/i18n.ts` 中英文案。
- 测试：`app/src/stores/audioStore.test.ts` 与 `app/src/stores/uiStore.test.ts` 增加冗余应用、钳制与持久化合约用例。
- 规格：本 change 的 proposal、design、`transcript-proofreading` delta spec 与 tasks。
- 不改变 `/tasks/{task_id}/audio` 等媒体路由 contract、字幕版本语义或后端持久化；设置仅存于前端本地存储。
