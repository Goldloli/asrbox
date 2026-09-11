# 设计：转写默认值选择（transcription-default-selection）

## 背景

动机见 proposal.md。本设计只记录实现层面的关键决策。

现状触点（已核实）：

- `app/src/lib/api.ts:529-544`：`ASRSettings` 响应已含 `default_backend` / `default_model_name?` / `default_provider_id?` / `default_language`；:1112 `updateSettings(Partial<ASRSettings>)` 已可写全部字段。后端 DB 列（`backend/database/models.py:318-319`）、pydantic 模型（`backend/models.py:324-342`）、settings service（`backend/services/settings.py:33-34`）与转写路由兜底（`backend/routes/transcriptions.py:139,171`）均已就位，**后端零改动**。
- `app/src/routes/SettingsPage.tsx:100-137`：转写 tab 已加载/保存 `default_backend`、`default_language`，无模型选择器。
- `app/src/routes/TranscribePage.tsx:39-42`：`backend`/`modelName`/`providerId`/`language` 四个 state 硬编码初值；:83-92 两个兜底 effect 在当前值无效时切换到"第一个已下载兼容模型"/"第一个已启用提供商"。
- `app/src/routes/ProvidersPage.tsx:63`：已有"设为默认"写 `default_provider_id` 的先例。

## 目标 / 非目标

**目标：**

- 设置页"转写"板块新增默认模型选择器，一次选择同时持久化 `default_backend` 与 `default_model_name`（本地模型）或 `default_provider_id`（线上接口）。
- 转写页启动时用 settings 默认值替换硬编码初值；默认值失效时由既有兜底逻辑接管，不停留在无效选择。
- 默认语言沿用既有下拉（含"自动识别"），转写页初始化同样套用。

**非目标：**

- 不改后端、API contract、DB schema（字段已全部存在）。
- 转写页内的手动选择不回写设置；不影响已创建任务的参数。
- 不改动既有兜底 effect 的语义，只在其之前增加"套用默认值"一步。
- 不引入 per-任务模板、批量默认输出格式等其余默认值扩展。

## 决策

### 1. 默认模型选择器：单一合并列表，编码区分本地/线上

设置页新增一个 Select，选项合并自 `useModelsQuery()`（可用本地模型）与 `useProvidersQuery()`（已启用提供商），option value 编码为 `local:<model_name>` / `provider:<provider_id>`（weiui Select 不允许空字符串 value）；另提供哨兵项 `__auto__`（不指定），选中时清空 `default_model_name` / `default_provider_id`（写 null，后端回退内置默认值），使"自动"可以撤销已设置的默认。回显的默认值不在当前选项中（模型/提供商已删除）时，临时插入一条带"已失效"标记的同名 option，保证触发器正常显示。选中具体默认模型时，"默认后端"下拉禁用并提示"由默认模型选择自动确定"，避免两个控件写出互相矛盾的 `default_backend`。

- 本地模型：`default_backend='local'`、`default_model_name=<name>`、`default_provider_id=null`
- 线上接口：`default_backend='provider'`、`default_provider_id=<id>`、`default_model_name=null`

**理由**：用户心智里"默认用哪个转写"是单一概念；合并列表避免"默认后端=local 但默认模型是线上接口"的自相矛盾中间态。**备选**：保留默认后端下拉并随其联动切换模型/提供商两个子下拉——控件互相牵制、状态组合更多，且与 proposal 承诺"保留现有默认后端选项"冲突更大，否决。既有"默认后端"下拉保留不变，作为无默认模型时的后端兜底表达；两者保存路径独立，默认模型选择器覆盖写 `default_backend` 是刻意的联动。

### 2. 转写页初始化：dirty 跟踪 + 一次性套用，复用现有兜底

settings 经 React Query 异步到达，`useState` 初值拿不到。方案：保留现有 lazy 初值，新增一个 effect——settings 首次到达且用户尚未手动改动对应控件（用 ref 标记 dirty）时，套用 `default_backend`/`default_model_name`/`default_provider_id`/`default_language`（经 `normalizeLanguageValue`）；任一控件被用户改动后即不再被套用覆盖。

默认值失效（模型被删除/未下载/不兼容、提供商被删/禁用）时**不做新逻辑**：既有兜底 effect（`TranscribePage.tsx:83-92`）本就在当前值无效时切换到第一个可用项，套用默认值后若无效会被它自然纠正。

**理由**：改动面最小，与现有初始化/兜底结构同构；备选"初值置空、等 settings 到达再渲染表单"会引入加载态 UI 分叉并波及桌面/Web 两条路径，收益不足。

### 3. 无回写、无平台分叉

转写页四个 state 仍为纯本地状态；Web 与桌面共用同一逻辑，默认值只影响初始选中。

## 风险

- settings 到达晚于用户操作 → dirty ref 保证手动选择不被晚到的默认值覆盖。
- 默认模型恰好处于下载中/不兼容 → 现有兜底 effect 切到第一个可用项；设置页选择器用 `compatible !== false` 过滤降低选到无效项的概率，但不禁止（模型可能稍后下载完成）。
- 提供商"设为默认"（ProvidersPage）与设置页默认模型选择器写同一字段 → 两处都是显式用户动作，后写覆盖先写，语义一致；不做跨页联动刷新以外的处理（settings query 失效已由既有 invalidate 覆盖）。

## 回滚

纯前端改动，revert 对应提交即可；无数据迁移、无 contract 变化，回滚无残留。
