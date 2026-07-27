# Design: task-lifecycle-consistency

## 背景

- `backend/services/tasks.py:281-297` `_task_worker`：`run_task(db, row)` 无 `except` 兜底；`:984-1007` `run_task` 的异常处理器首先 `db.refresh(row)`（:985），行已被删除时抛 `InvalidRequestError`/`ObjectDeletedError`（已实测复现）→ 异常逃逸 → 线程死亡。`_worker_counts`（:271-278）只增不减，无补员；`reconcile_orphan_tasks`（:117-134）因任务仍在 runtime queued 集合而跳过 → 队列永久停摆。
- `tasks.py:1082-1095` `retry_task`、`:1098-1139` `retranscribe_task` 不检查活动状态；`_store_segments`（:882-895）先全删再插，并发 run 交错提交产生混合段。gpt 复审实测：`transcribing` 状态下两者均返回 queued，同一 ID 提交两次。
- `tasks.py:1157-1187` `delete_task`：`request_cancel` 后立即 unlink 文件并删除全部 DB 行，不等 worker 退出——正是 worker 异常逃逸的主要触发源。
- `backend/services/proofreading.py:472-492` `_run_worker` 同款无兜底结构；`execute_run` 自身处理器若再抛错，线程死亡且 `_worker_started` 恒 True 不重生。
- `backend/services/storage.py:98-104` `delete_chunks` 对全部 chunk 无差别删除；`tasks.py:923-973` diarization 之后到 completed 提交之间无 `_raise_if_cancelled`；`retry_task` 不重置 `completed_at`（`retranscribe_task:1132` 有）；`task_runtime.request_cancel`（task_runtime.py:31-41）对未跟踪 id 也写入 `_cancelled_task_ids` 且永不清理。
- `ACTIVE_TASK_STATUSES`（tasks.py:63-72）= queued/importing/preprocessing/waiting_model/downloading_model/transcribing/postprocessing/exporting。

## 目标 / 非目标

目标：消除上述事故链与数据损坏路径；每个修复配回归测试；API 行为变化仅限于对活动任务的 retry/retranscribe/delete 由"200 + 静默损坏"改为 409。

非目标：不重构任务状态机本身；不引入分布式锁；不处理 ffmpeg timeout、SQLite 快照备份、模型探测重导入、SSE 重连（后续批次）；前端 UI 不改（错误经既有 toast 通路呈现）。

## 决策

### D1. worker 循环兜底 + run_task 处理器硬化

`_task_worker` 循环体内为每个任务加 `except Exception`：记录 `logger.exception`，并调用 `_fail_task_after_escape(task_id)`——独立新 session、自身全 try/except、行存在且状态仍为 active 时落 `failed`（error_code `WORKER_RUNTIME_ERROR`）+ 任务日志 + 事件。线程因此不会死亡，`_worker_counts` 不需要补员逻辑。

`run_task` 的 except 处理器改为：先 `db.rollback()`，再 `fresh = get_task_row(db, row.id)`；`fresh is None`（行已删）→ 仅记日志返回；`fresh.status == "cancelled"` → 返回；否则在 `fresh` 上写 failed + 诊断 + 日志 + 事件（替代当前 `db.refresh(row)` 开头）。

备选：worker 死亡后检测重生——否决：把"不死"建立在兜底上比重生监控简单且无计数漂移。
`_run_worker`（proofreading）采用同一模式：escape 后将 run 落 failed（error `Proofreading failed`）并继续循环。

### D2. service 层执行互斥，路由映射 409

新增 `TaskActiveError(Exception)`（tasks.py）。`retry_task`/`retranscribe_task`/`delete_task` 入口检查 `row.status in ACTIVE_TASK_STATUSES or task_id in task_runtime.active_ids()` → raise。路由捕获 → 409 + detail。`delete_all_tasks` 逐任务捕获 `TaskActiveError` 跳过活动任务，其余照删。

竞态取舍：检查与状态写入在同一请求、同一 db 事务内完成；SQLite 写串行化使并发窗口仅为"两请求同时读到非 active"——此时两者都置 queued，退化为现状且不再更坏；桌面单用户场景可接受，文档化。

`cancel_task` 语义不变（用户先取消再删除）；取消后状态为 `cancelled`（非 active），删除放行。

### D3. 取消语义补强

- diarization 分支前与 `row.status = "completed"` 提交前各加一次 `_raise_if_cancelled(row.id)`。
- `retry_task` 增加 `row.completed_at = None`。
- `task_runtime.request_cancel` 对未跟踪 id 不再写入 `_cancelled_task_ids`（返回 None 行为不变）；`mark_queued`/`mark_finished` 已负责清理，集合不再单调增长。

备选：delete_task 改"取消→等待 worker 退出→删除"——否决：引入跨线程等待与超时状态机，复杂度远超收益；409 把节奏交还用户，语义清晰。

### D4. delete_chunks 限定终态

`storage.py:98-104`：先取活动任务 id 集合（`ACTIVE_TASK_STATUSES`，自 tasks.py 导入，无循环依赖），清理时跳过其 chunk；无任务行的孤儿 chunk 照清（保持原意图）。dry-run 语义同步。

### D5. local_task_worker 异常兜底

`local_task_worker.py` 入口先初始化 `inputs = []`（及 `results` 已有），异常处理器不再引用未绑定变量，result.json 总能落 `failed`。

## 风险

- D1 改 run_task 处理器：`db.rollback()` 后原 `row`  detached/expired——全部改写基于 `fresh`，`finally` 的 `mark_finished(row.id)` 只用 id，安全。
- D2 的 409：前端重试/删除按钮在活动任务上现在得到错误 toast（此前是静默损坏）；`useTaskMutation` 已带错误通路，无前端改动。
- D3 request_cancel 行为微调：唯一消费方是 worker 的 `is_cancelled` 检查与 `active_tasks` 响应的 `cancelled_task_ids` 展示；未跟踪 id 本就无 worker 会检查它。contract test 只断言字段存在（test_contract.py:215），不受影响。
- D4：活动任务 chunk 不再被"清理全部"释放磁盘——这是本意；用户在活动任务上点清理会看到释放量变少，正确行为。

## 回滚

纯代码行为变更，无持久化格式/数据迁移；revert 即可。409 语义随回滚消失，不影响已存数据。
