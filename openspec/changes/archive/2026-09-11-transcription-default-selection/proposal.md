# 提案：转写默认值选择（transcription-default-selection）

## 为什么

设置页"转写"板块已有默认后端、默认语言两项，但缺少**默认模型**：用户每次打开转写页，模型都被重置为硬编码初值（`TranscribePage.tsx:39-42` 的 `local` / `whisper-base` / `zh-Hans`），只能依赖"第一个已下载模型"兜底修正（:83-92）。想把 qwen3-asr 或某个线上平台接口作为日常默认的用户，每次启动都要手动重选。

后端 contract 已完整支持所需字段：`ASRSettings` 响应与 `updateSettings` payload 均含 `default_backend` / `default_model_name?` / `default_provider_id?` / `default_language`（`app/src/lib/api.ts:529-544`、:1112），providers 页也已有"设为默认"写 `default_provider_id` 的先例——缺的是设置页的模型选择器，以及转写页初始化时真正消费这些默认值。

## 变更内容

- 设置页"转写默认值"板块新增**默认模型**选择器：单一列表合并展示可用本地模型与已启用的线上提供商接口（如 `qwen3-asr` 或某在线接口），选择后同时持久化 `default_backend` + `default_model_name` 或 `default_provider_id`；保留现有默认后端、默认语言（含"自动识别"）选项不变。
- 转写页初始化改为消费设置默认值：启动时用 `default_backend` / `default_model_name` / `default_provider_id` / `default_language` 替代硬编码初值；所选默认模型不存在、未下载或不兼容、默认提供商被删除或禁用时，沿用现有"第一个可用项"兜底修正，不产生错误状态。
- 默认模型/语言仅作为转写页**初始选择**：用户在转写页的手动改动不回写设置，也不影响已创建任务。
- e2e 覆盖：设置默认模型与默认语言后重进转写页，初始选中项与设置一致；默认项失效时兜底到第一个可用项。

## 能力（Capabilities）

### New Capabilities

（无）

### Modified Capabilities

- `transcription-lifecycle`：`Validated task creation` 之外新增转写默认值要求——设置页可持久化默认模型（本地模型或已启用线上提供商）与默认语言，转写页初始化必须套用并在默认值失效时安全兜底。

## 影响

- **API contract**：零变化。所需字段已全部存在于既有 settings 响应与更新 payload，无新增/修改路由或字段。
- **代码**：`app/src/routes/SettingsPage.tsx`（默认模型选择器 + 保存）、`app/src/routes/TranscribePage.tsx`（初始化消费 settings）、`app/src/lib/i18n.ts`（文案）、`app/src/lib/queries.ts` 可能复用现有 settings query；新增 e2e 场景接入 `test:e2e:maintained` 聚合。
- **持久化数据**：无 migration——`default_model_name` / `default_provider_id` 列与读写已由后端既有实现提供。
- **不受影响**：任务创建/执行/版本语义；已创建任务参数；macOS 与 Web 行为（同一套前端逻辑，默认值仅影响初始选中）；CUDA 加速等其余设置板块。
