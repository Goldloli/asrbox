# Proposal: models-page-defaults

## 为什么

模型管理页当前默认只显示「推荐」分类，用户打开页面看不到完整模型目录，发现模型的成本高；分类选项顺序中「全部」排在第三位。同时，未下载模型行下方红条显示后端硬编码英文 `Model <name> is not downloaded`（`backend/services/models.py:276`），中文界面体验割裂，且任何带 `compatibility_error` 的模型都被归入「需要处理」分组（`app/src/components/models/ModelManagement.tsx:19`），把大量正常的未下载模型渲染成"问题"。

## 变更内容

- 模型管理页默认分类从 `recommended` 改为 `all`，分类选项顺序调整为 `[全部, 推荐, 常用, Apple, 更快, 中文, 说话人, Whisper]`（推荐固定在第二位）。
- 模型状态接口新增机器可读的原因码字段（如 `model_not_downloaded`），前端按当前语言渲染本地化的未下载/不兼容描述，替代后端硬编码英文直出；`compatibility_error` 原字段保留以保证兼容。
- 未下载不再被视为「需要处理」分组的问题项；只有真实运行时不兼容或下载错误才进入该分组。
- 顺手清理同一界面邻近的硬编码英文：下载状态枚举直出（`ModelsPage.tsx:287`）、模型分类 id 直出（`ModelManagement.tsx:125`）、转写页 `Missing model:`（`TranscribePage.tsx:214`）。

## 能力（Capabilities）

### New Capabilities

（无）

### Modified Capabilities

- `model-management`：新增「模型目录分类视图」requirement（默认全部、推荐第二位的展示约定）；新增「本地化模型状态文案」requirement（状态负载携带机器可读原因码、UI 按语言本地化呈现、未下载不计入问题分组）。

## 影响

- 后端：`backend/services/models.py`（`check_model_compatibility`/`list_model_statuses` 增加原因码）、`backend/models.py`（`ASRModelStatus` 响应模型新增字段，必须声明到 `response_model`）、`backend/tests/`（API 测试断言新字段存在）。
- 前端：`app/src/routes/ModelsPage.tsx`、`app/src/components/models/ModelManagement.tsx`、`app/src/routes/TranscribePage.tsx`、`app/src/lib/api.ts`（类型）、`app/src/lib/i18n.ts`（新增 zh/en key）。
- API contract：`GET /models/status` 响应新增可选字段（additive，非破坏）；`backend/tests/test_contract.py` 同步。
- 不影响：下载生命周期、转写执行、存储边界；`check_model_compatibility` 的 compatible 判定逻辑不变，仅消息载体变化。
