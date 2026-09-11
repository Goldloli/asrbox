# Design: models-page-defaults

## Context

现状见 proposal.md。关键代码事实（已核实）：

- 默认分类：`app/src/routes/ModelsPage.tsx:21` `useState<ModelViewCategory>('recommended')`；选项顺序在 `:114-123`；引导卡片「通用」按钮在 `:225` 主动 `setCategory('recommended')`。
- 英文文案来源：`backend/services/models.py:276` `check_model_compatibility` 返回 `f"Model {model_name} is not downloaded"`，`:393` `list_model_statuses` 将其放入 `compatibility_error`；前端 `ModelManagement.tsx:72` 原样渲染为红条（`:249-253`、详情对话框 `:133-137`）。
- 分组副作用：`ModelManagement.tsx:19` `createModelGroups` 把任何 `compatibility_error` 视为问题，未下载模型全部落入「需要处理」。
- `runtime_error`（如 MLX 导入失败，`:274`）是有信息量的 loader 错误，目前同样经 `compatibility_error` 透传。
- 响应模型：`backend/models.py` `ASRModelStatus` 是 `GET /models/status` 的 `response_model`；新增字段必须在此声明并有 API 测试断言（AGENTS.md 不变量）。

## Goals / Non-Goals

**Goals:**

- 默认视图展示全部模型，「推荐」为第二个分类选项。
- 未下载/未知模型/运行时不兼容三类状态以机器可读原因码下发，UI 按 zh/en 本地化渲染。
- 未下载不再计入「需要处理」分组；真实运行时不兼容与下载错误仍计入。
- 清理同界面邻近硬编码英文。

**Non-Goals:**

- 不改变 `check_model_compatibility` 的 compatible 判定、不改变下载生命周期与存储边界。
- 不删除 `compatibility_error` 原字段（保持 additive，避免破坏既有消费者）。
- 不改造 readiness/transcribe 链路里未被前端渲染的同类英文串（`backend/routes/transcriptions.py:180,190` 的 readiness message 前端类型未声明、未渲染；`MODEL_NOT_DOWNLOADED` 任务错误已有 `errors.py` 映射，均不在本 change 内）。

## Decisions

### D1: 用新增原因码字段做本地化，而非后端直出中文或前端状态推断

`ASRModelStatus` 新增 `compatibility_error_code: str | None`，取值集合：`model_not_downloaded`、`missing_files`、`unknown_model`、`runtime_incompatible`。前端按 code 映射到 i18n key 渲染短描述；无 code（旧后端）时回退显示 `compatibility_error` 原文。

实现时补充了第四个取值 `missing_files`：已下载但文件不完整（`models.py:336-343`）是无法运行的真实问题，若归入三值集合会被错误地当作"仅未下载"而逃出「需要处理」分组。

备选方案：
- (a) 后端 message 直接改中文：违背本地化分层，英文界面反而退步；`models.py:368` 已有硬编码中文是既有瑕疵，不扩散。
- (b) 前端用 `downloaded === false` 推断：区分不了 `unknown_model` 与 `runtime_incompatible`，且无法覆盖详情对话框场景。

### D2: runtime_incompatible 保留原始原因作为详情

红条只显示本地化短描述；`runtime_error` 原文（loader 错误）保留在详情对话框中展示，不丢弃诊断信息。

### D3: 分组规则改为按原因码判定

`createModelGroups` 仅当存在 `error`/`download_error`/进度错误，或 `compatibility_error` 存在且 `compatibility_error_code !== 'model_not_downloaded'` 时归入「需要处理」；`model_not_downloaded` 不触发问题分组（`missing_files`、`unknown_model`、`runtime_incompatible` 及无码的旧后端响应仍计入，保证真实问题不丢失）。列表排序（pinned 优先）不变。

### D4: 分类默认值与顺序为纯前端常量调整

`useState` 默认值改 `'all'`，`categoryItems` 重排为 `[all, recommended, pinned, apple, faster, chinese, diarization, whisper]`。引导卡片的主动切换行为保持不变（用户点击「通用」仍切到推荐——这是显式动作，不与默认视图冲突）。

### D5: 邻近硬编码英文清理清单（限同一界面）

- `ModelsPage.tsx:287` 下载状态枚举 → 映射 i18n（复用 `common.*`，缺的补齐 queued/paused/extracting/complete/cancelled/error）。
- `ModelsPage.tsx:280` 内联 `进行中/running` → 提取为 i18n key。
- `ModelManagement.tsx:125` 分类 id 直出 → 映射 `models.category*` 既有 key。
- `TranscribePage.tsx:214` `Missing model: ${model}` → 新增 i18n key（含模型名插值）。

## Risks / Trade-offs

- [既有测试断言默认推荐视图或英文文案] → 实现时全局搜索 `recommended`、`is not downloaded` 的测试/e2e 断言并同步更新；contract test 增加 `compatibility_error_code` 存在性断言。
- [旧后端 + 新前端组合下无 code 字段] → 前端保留原文回退分支，行为不劣于现状。
- [原因码取值集合未来膨胀] → 取值在 spec 中收敛为三个，新增取值需要新的 change。
