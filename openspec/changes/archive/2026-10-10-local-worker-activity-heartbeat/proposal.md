# local-worker-activity-heartbeat

## 为什么

asrbox-rqc 排查确认原卡死 bug 已由 stall 超时修复（7bbdad5），但残留两个结构性缺口：(1) 转写期间任务行只在 chunk 完成时刷新（2 分钟窗口），stall 等待期内（默认 20 分钟）`updated_at` 完全静止，界面无法区分"慢 chunk"与"卡死"；(2) stall 判定只看 chunk 完成进度，弱设备上单个 chunk 合法耗时超过时限会被误杀为 `LOCAL_WORKER_STALLED`。worker 子进程缺少向父进程证明"我还在干活"的活跃心跳。

## 变更内容

- **Worker 活跃心跳**：本地转写 worker 子进程以守护线程每 5 秒原子写入 `heartbeat.json`（含单调墙钟、进程累计 CPU 时间、已完成 chunk 数），转写结束后线程退出。心跳 CPU 前进证明推理在推进；进程级死锁（rc.2 形态）下 CPU 冻结。
- **父进程活性判定**：stall 终止条件从"仅按 chunk 完成进度"改为活动感知——chunk 无进展且心跳 CPU 停滞（低于绝对 CPU 活动下限）超过 stall 时限，或无论心跳如何 chunk 无进展超过硬性上限（stall 时限的 3 倍，防忙循环）才终止并报 `LOCAL_WORKER_STALLED`；心跳活跃的慢 chunk 不再被误杀，本地队列继续被保护。
- **存活可见性**：心跳活跃且无 chunk 完成期间，父进程每 30 秒刷新任务行 `updated_at` 呈现存活；`progress` 仍只来自已完成的有界 chunk（维持 Work-based local progress 不虚增）。心跳文件缺失（异常/旧路径）时回退为现行为：仅按 chunk 完成判定停滞。
- **测试**：worker 心跳写入与收尾、活动心跳下不误杀、CPU 冻结终止、硬上限终止、心跳缺失回退。

## 能力（Capabilities）

### 新增能力

（无）

### 修改的能力

- `transcription-lifecycle`：新增"本地推理 worker 的活跃心跳与停滞终止" requirement（心跳 contract、活动感知 stall、硬上限、updated_at 存活刷新、无心跳回退）。

## 影响

- 代码：`backend/services/local_task_worker.py`（心跳线程）、`backend/services/tasks.py`（`_transcribe_local_subprocess` 的 stall 判定与存活刷新、新常量）、`backend/services/errors.py` 文案微调。
- 测试：`backend/tests/test_local_task_worker.py` 新增心跳与父进程判定用例（沿用 HungProcess/monkeypatch 模式）。
- 不改 API 路由、响应字段、事件集合、持久化 schema 与依赖（仅标准库 threading/time）。
- 错误码不变（`LOCAL_WORKER_STALLED`），UI 零改动。
