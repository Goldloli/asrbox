## 背景

AI 工作区三处"播放这句话"入口各自调用 `openAudio`：

- `app/src/components/transcript/ProofreadingPanel.tsx:142` `playSegment`（字幕核对）
- `app/src/components/transcript/TranslationPanel.tsx:229`（字幕翻译对齐段试听）
- `app/src/components/transcript/ChatPanel.tsx:133`（AI 对话引用试听）

`app/src/stores/audioStore.ts:44` 的 `openAudio` 已把起点钳制到 0，并要求终点大于起点才构成片段；片段终点通过 `clipReachedEnd` 在播放中停止。前端偏好集中保存在 `app/src/stores/uiStore.ts`（zustand `persist`，localStorage `asrbox-ui`），设置页通用页签（`app/src/routes/SettingsPage.tsx`）渲染这些偏好，导出/导入在同文件 `exportFrontendSettings` / `importFrontendSettings` 中显式枚举字段。

## 目标 / 非目标

目标：

- 通用设置新增"句段播放冗余"，档位 0 / 0.5 / 1 / 2 / 3 秒，默认 0（严格按时间轴）。
- 三处句段试听统一应用该冗余：起点 `max(0, start - padding)`，终点 `end + padding`。
- 偏好本地持久化，纳入前端设置导出/导入，非法持久化值回落默认。
- 单元测试覆盖冗余应用、起点钳制与持久化合约。

非目标：

- 不改变 `openAudio` 的既有语义与非句段播放调用（整曲播放、seek）。
- 不增加后端字段、路由或数据库列；设置不跨设备同步。
- 不做逐档精细自定义输入（仅固定档位）；不调整 TranscriptViewer 的主动播放联动。

## 决策

- **共享助手而非三处内联**：在 `audioStore.ts` 导出 `openSegmentAudio(payload)`，内部读取 `useUiStore.getState().segmentPlayPadding` 并扩展起止后委托 `openAudio`。三处调用点行为天然一致，且点击时读取保证改动即时生效，无需组件订阅。备选方案"在 `openAudio` 内建冗余"会污染整曲播放等非句段语义，放弃。
- **数值型偏好 + 归一化**：`uiStore` 新增 `segmentPlayPadding: number`（秒，默认 0）与 `setSegmentPlayPadding`；`mergePersistedUiState` 把不在档位集合内的持久化值归一为 0，模式与 `normalizeAccentColor` 一致。
- **终点不向上钳制到媒体时长**：`end + padding` 超出时长时播放自然在媒体末尾结束，`clipReachedEnd` 逻辑无需改动。
- **设置归属通用页签界面区**：与密度、字号等本地界面偏好并列；导入导出字段名为 `segmentPlayPadding`。

## 风险

- `audioStore` 新增对 `uiStore` 的依赖：两者均无反向引用，无循环依赖；`uiStore` 仅依赖 `lib/appearance`。
- 冗余导致试听覆盖到相邻分段内容：属预期行为，由用户按档位自行权衡，默认 0 保持现状。

## 回滚

- 还原 `audioStore.ts`、`uiStore.ts`、三个面板调用点与 `SettingsPage.tsx` 的改动即可；持久化中多出的 `segmentPlayPadding` 字段在旧代码下被 `mergePersistedUiState` 自然忽略，无迁移负担。
