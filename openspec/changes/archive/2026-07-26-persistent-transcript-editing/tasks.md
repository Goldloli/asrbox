# Tasks: persistent-transcript-editing

## 1. 后端：批量段落更新端点

- [x] 1.1 `backend/models.py` 新增 `SegmentBulkItem`（id/start/end/text/speaker）与 `SegmentsBulkUpdateRequest`
- [x] 1.2 `backend/services/tasks.py` 新增 `update_segments_bulk`：404/400 校验、单事务更新、`_save_edit_version` 一个 edit 版本
- [x] 1.3 `backend/routes/tasks.py` 新增 `PUT /tasks/{task_id}/segments`，`response_model=TranscriptionTaskResponse`
- [x] 1.4 测试：happy path（字段更新 + text 重算 + 恰好一个 edit 版本）、id 集合不符 400、非法时间 400、任务不存在 404；`test_contract.py` freeze 增加路由

## 2. 前端：编辑持久化

- [x] 2.1 `app/src/lib/api.ts` 增加 `updateSegments` 方法与类型
- [x] 2.2 `TranscriptViewer.tsx` 重构为统一草稿模型：段落文本可编辑、说话人/时间戳进入同一草稿、未保存 Badge + 保存/放弃、保存成功清空并 invalidate（task/tasks/versions）、失败保留草稿
- [x] 2.3 effect 仅在 `task?.id` 变化时重置（修复轮询覆盖草稿）
- [x] 2.4 整文区域只读化，移除整文编辑入口；搜索/替换改为按段落应用进草稿
- [x] 2.5 `i18n.ts` 文案同步（zh/en），移除"仅本次会话"语义
- [x] 2.6 e2e：编辑→保存→导出一致（评估 app/e2e mock 基建，支持则新增 spec，不支持则说明）

## 3. 收尾

- [x] 3.1 `npm run typecheck`、`npm run build:web`、相关 e2e
- [x] 3.2 `npm run test:backend`、`npm run test:backend:contract`
- [x] 3.3 `openspec validate --changes persistent-transcript-editing` 通过，勾选任务后归档
