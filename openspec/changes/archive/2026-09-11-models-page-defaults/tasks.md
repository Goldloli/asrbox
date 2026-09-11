# Tasks: models-page-defaults

## 1. 后端原因码

- [x] 1.1 `backend/services/models.py`：`check_model_compatibility` 返回值增加 `code` 字段（`unknown_model` / `model_not_downloaded` / `runtime_incompatible`，runtime_error 分支为 `runtime_incompatible`），`list_model_statuses` 将其透传为 `compatibility_error_code`；验证：`pytest backend/tests/test_api.py -k model` 相关用例通过
- [x] 1.2 `backend/models.py`：`ASRModelStatus` 声明 `compatibility_error_code: str | None = None`；验证：API 测试断言 `GET /models/status` 响应含该字段且未下载模型取值为 `model_not_downloaded`
- [x] 1.3 `backend/tests/test_contract.py`：同步 contract（字段断言）；验证：`npm run test:backend:contract` 通过

## 2. 前端类型与 i18n

- [x] 2.1 `app/src/lib/api.ts`：`ModelStatus` 类型增加 `compatibility_error_code?: string | null`；验证：`npm run typecheck` 通过
- [x] 2.2 `app/src/lib/i18n.ts`：新增 zh/en key——未下载/未知模型/运行时不兼容的状态描述、下载状态枚举（queued/paused/extracting/complete/cancelled/error 缺口）、下载中计数、缺失模型提示；验证：两个 locale 的 key 集合一致

## 3. 前端行为

- [x] 3.1 `app/src/routes/ModelsPage.tsx`：默认分类改 `all`，`categoryItems` 顺序改 `[all, recommended, pinned, apple, faster, chinese, diarization, whisper]`；验证：相关 Playwright/单元场景通过，页面默认展示全部模型
- [x] 3.2 `app/src/components/models/ModelManagement.tsx`：错误展示优先按 `compatibility_error_code` 映射 i18n（无码回退原文），`createModelGroups` 仅 `runtime_incompatible`/下载错误计入「需要处理」，分类 id 改映射 i18n；验证：未下载模型不进入问题分组，红条显示本地化文案
- [x] 3.3 邻近硬编码清理：`ModelsPage.tsx` 下载状态枚举与计数、`TranscribePage.tsx:214` `Missing model:` 改 i18n；验证：`npm run typecheck` 通过，界面无硬编码英文残留

## 4. 验证

- [x] 4.1 搜索并同步既有断言（`recommended` 默认视图、`is not downloaded` 文案）的单测/e2e；验证：`npm run test:frontend:unit` 通过
- [x] 4.2 聚焦后端回归；验证：`npm run test:backend` 通过
- [x] 4.3 `npm run build:web` 通过；手动确认：模型页默认全部、推荐第二位、未下载行为中文且不在「需要处理」分组
