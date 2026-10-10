# Tasks: local-worker-activity-heartbeat

## 1. Worker 心跳

- [x] 1.1 `backend/services/local_task_worker.py` 增加心跳守护线程：每 5 秒原子写 `heartbeat.json`（墙钟、`time.process_time()`、已完成数、总数），主流程结束时停止线程；沿用 `_write_state` 原子替换模式与独立 tmp 名。

## 2. 父进程活动感知判定

- [x] 2.1 `backend/services/tasks.py` 新增常量（心跳活动 CPU 下限、硬上限倍数、存活刷新间隔），`_transcribe_local_subprocess` 读取心跳并维护 `last_active_at`：心跳 CPU 自记账点前进超过下限即记活动。
- [x] 2.2 stall 条件改为双通道（chunk 无进展且心跳无活动超时限；或 chunk 无进展超硬上限），错误信息附带 chunk 无进展与心跳无活动的时长；心跳活跃且无 chunk 进展期间每 30 秒刷新 `row.updated_at`，不触碰 `progress` 与事件。

## 3. 测试

- [x] 3.1 worker 级：慢转写 fake 下心跳文件出现且 CPU 前进、完成后停止；无效请求路径不残留心跳线程行为断言。
- [x] 3.2 父进程级（沿用 HungProcess/monkeypatch 模式）：心跳 CPU 持续前进时超过 stall 时限不终止、到达硬上限终止；心跳冻结超时限终止（既有用例保持通过）；无心跳文件回退现行为；存活刷新断言（updated_at 推进、progress 不变）。
- [x] 3.3 `pytest backend/tests/test_local_task_worker.py backend/tests/test_api.py -k "local or worker or stall or cancel"` 通过，随后 `npm run test:backend` 全量通过。

## 4. 归档

- [x] 4.1 `openspec validate --changes local-worker-activity-heartbeat` 通过；CHANGELOG Unreleased 增加条目。
- [x] 4.2 全部勾选后 `openspec archive local-worker-activity-heartbeat --yes` 并复核 `openspec validate --specs`。
