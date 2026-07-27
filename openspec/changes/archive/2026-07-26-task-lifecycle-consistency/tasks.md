# Tasks: task-lifecycle-consistency

## 1. worker 生存性（D1）

- [x] 1.1 `tasks.py` `_task_worker` 循环体加 `except Exception` 兜底：`logger.exception` + `_fail_task_after_escape(task_id)`（独立 session、全 try/except、active 状态落 `failed`/`WORKER_RUNTIME_ERROR` + 日志 + 事件）
- [x] 1.2 `tasks.py` `run_task` 异常处理器硬化：先 `db.rollback()`，`get_task_row` 取 fresh 行；行已删仅记日志； cancelled 直接返回；否则在 fresh 上落 failed + 诊断 + 日志 + 事件
- [x] 1.3 `proofreading.py` `_run_worker` 同款兜底，escape 后 run 落 failed
- [x] 1.4 测试：run_task 处理器遇已删除行不逃逸；worker escape 后任务落 failed 且后续任务照常执行

## 2. 执行互斥与受控删除（D2）

- [x] 2.1 `tasks.py` 新增 `TaskActiveError`；`retry_task`/`retranscribe_task`/`delete_task` 入口活动检查；`retry_task` 补 `completed_at = None`
- [x] 2.2 `routes/tasks.py` 三端点捕获 → 409 + detail；`delete_all_tasks` 跳过活动任务
- [x] 2.3 测试：transcribing 状态 retry/retranscribe/delete 均 409；failed/cancelled/completed 正常放行；delete_all 跳过活动任务

## 3. 取消语义补强（D3）

- [x] 3.1 `run_task`：diarization 分支前、completed 提交前各加 `_raise_if_cancelled`
- [x] 3.2 `task_runtime.request_cancel` 未跟踪 id 不写入取消集合
- [x] 3.3 测试：取消集合不再为未跟踪/已删除 id 驻留；diarization 阶段取消不落 completed

## 4. chunk 清理终态过滤（D4）

- [x] 4.1 `storage.py` `delete_chunks` 跳过活动任务的 chunk；孤儿 chunk 照清；dry-run 语义同步
- [x] 4.2 测试：活动任务 chunk 保留、终态任务 chunk 删除、dry-run 不误报

## 5. local worker 兜底（D5）

- [x] 5.1 `local_task_worker.py` 入口初始化 `inputs`，异常处理器不再 NameError
- [x] 5.2 测试：请求文件缺失/损坏时 result.json 落 failed

## 6. 收尾

- [x] 6.1 `test_contract.py` 补 409 行为用例（路由 freeze 不变）
- [x] 6.2 `npm run test:backend` 全量 + 既有 proofreading/storage/tasks 测试无回归
- [x] 6.3 `openspec validate --changes task-lifecycle-consistency` 通过，勾选任务后归档
