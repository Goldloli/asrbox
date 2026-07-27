# Proposal: task-lifecycle-consistency

## 为什么

2026-07 审计确认了任务生命周期上同一事故链的三处缺陷，均可导致队列停摆或字幕数据损坏：

1. **worker 线程无异常兜底**（高）：`backend/services/tasks.py:281-297` `_task_worker` 对 `run_task` 没有 `except`；`run_task` 的异常处理器自身还会因 `db.refresh`/`db.commit` 对已删除行再抛异常（实测 `ObjectDeletedError`/`InvalidRequestError` 逃逸）。worker 死后 `_worker_counts` 只增不减不补员，新任务永远卡在 `queued`，须重启进程。`backend/services/proofreading.py:482-492` 的 `_run_worker` 同款结构。
2. **活动任务可重复入队**（高）：`retry_task`/`retranscribe_task`（`tasks.py:1082-1139`）不检查任务是否 active。多 worker 时同一任务并发执行，`_store_segments` "先全删再插" 交错提交产生重复/混合段，版本历史互相矛盾；单 worker 也会删除当前 chunks/segments 后追加一次重复执行。
3. **运行中任务被强制删除**（中）：`delete_task`（`tasks.py:1157-1187`）`request_cancel` 后不等待 worker 退出即删除文件与数据库行，正是事故链 1 的主要触发路径。

附带同边界内的三个小问题：存储清理 `delete_chunks` 无差别删除含活动任务的 chunk（`storage.py:98-104`）；diarization 阶段之后不再检查取消（`tasks.py:923-973`）；`retry_task` 不重置 `completed_at`（与 `retranscribe_task` 不一致）。

## 变更内容

- **worker 生存性**：`_task_worker` 循环体加 `except Exception` 兜底——记任务日志、将任务落库为 `failed`（含诊断），worker 继续处理后续队列；兜底本身失败时保护 worker 不死。`_run_worker`（proofreading）同样处理。worker 异常退出时按存活线程重建计数。
- **执行互斥**：`retry_task`/`retranscribe_task`/`delete_task` 对 active（queued/transcribing/importing 等 `ACTIVE_TASK_STATUSES`）任务在 service 层原子拒绝，路由返回 409 + 明确 detail；删除活动任务须先取消。
- **取消语义补强**：diarization 前后与完成提交前各检查一次取消；`retry_task` 重置 `completed_at`；`request_cancel` 不再为未跟踪任务永久驻留取消集合。
- **存储清理限定终态**：`delete_chunks` 只清理终态（completed/failed/cancelled）任务的 chunk；活动任务 chunk 保留。
- **local worker 错误兜底**：`local_task_worker.py` 异常处理器初始化 `inputs`，保证 result.json 总能落 failed 状态而非 `NameError`。

## 能力（Capabilities）

### Modified Capabilities
- `transcription-lifecycle`: `Recoverable task lifecycle` 增加执行互斥、受控删除与 worker 生存性要求；`Cancellable local execution` 增加全阶段取消检查要求。
- `transcript-proofreading`: `可恢复的核对工作流反馈` 增加校对 worker 异常兜底要求。

## 影响

- 后端：`backend/services/tasks.py`、`backend/services/proofreading.py`、`backend/services/storage.py`、`backend/services/task_runtime.py`、`backend/services/local_task_worker.py`、`backend/routes/tasks.py`（409 映射）。
- API：retry/retranscribe/delete 三个端点对活动任务新增 409 响应（此前为 200 并产生损坏行为）；contract test 补 409 用例。响应模型不变。
- 前端：无代码改动预期——`useTaskMutation` 已有错误 toast 通路；活动任务点击重试/删除从"静默损坏"变为"明确报错"。
- 测试：worker 死亡恢复、活动任务 409、删除受控、chunk 清理终态过滤、取消检查的新增 pytest 用例。
- 不变量保持：版本不可变、任务状态机其余语义、进度上报均不变；不新增依赖。
