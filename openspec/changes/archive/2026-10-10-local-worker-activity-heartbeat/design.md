# Design: local-worker-activity-heartbeat

## 背景

- `backend/services/local_task_worker.py` 的 `run_local_task_worker` 顺序逐 chunk 转写，仅在 chunk 完成时原子写 `result.json`（:32-43）；推理期间无任何输出。
- `backend/services/tasks.py` 的 `_transcribe_local_subprocess`（:762-848）每 0.2s 轮询 result.json，stall 判定在 :838-847：`last_progress_at` 仅在 chunk 完成（`_publish_local_worker_progress` 推进 `published`）或终态时刷新，超过 `ASRBOX_LOCAL_WORKER_STALL_SECONDS`（默认 1200s，tasks.py:56-63）即终止报 `LOCAL_WORKER_STALLED`。rc.2 的推理级死锁由此兜住（7bbdad5）。
- 任务行 `updated_at` 仅随行更新刷新：转写期间只有 chunk 完成与阶段转换写行 → stall 等待期内界面静止。
- 弱设备上单个 2 分钟 chunk 的合法推理可能超过 1200s（大模型 + CPU），现行判定会误杀。

## 目标

- 慢 chunk（可证明在推理）不再被 stall 时限误杀；推理死锁仍在有界时间内被终止。
- stall 等待期内任务行呈现存活（`updated_at` 周期刷新），`progress` 不虚增。
- 无新依赖、无 API/事件/持久化变化，错误码不变。

## 非目标

- 不为各 ASR 引擎引入推理内进度回调（跨引擎侵入过大）。
- 不改变 stall 时限默认值与环境变量语义（`ASRBOX_LOCAL_WORKER_STALL_SECONDS` 仍是"无进展容忍时限"）。
- 不做 inline 模式（`ASRBOX_INLINE_LOCAL_TRANSCRIPTION=1`，dev/docker 路径）的 stall 保护——该路径无子进程边界，另立问题。
- 不实现 sidecar 死亡自动重启（已立 asrbox-l16）。

## 决策

### 1. 心跳 = 进程累计 CPU 时间，而非进程存活

进程存活（能写文件）不等于推理在推进：rc.2 形态的死锁进程仍可运行守护线程。`time.process_time()`（进程全部线程的 CPU 总和，跨平台标准库）在真实推理（CPU 或 GPU 驱动）下持续前进，在死锁下冻结（心跳线程自身每 5 秒写 ~100 字节，20 分钟累计 CPU 远低于活动下限）。备选 psutil 读子进程 CPU 时间（依赖已在 lock 中）——被否决：父进程侧解析增加 psutil 进程句柄管理，且冻结二进制中 `time` 更轻。

### 2. 活动下限为绝对 CPU 量，不做比例换算

`HEARTBEAT_ACTIVITY_CPU_FLOOR = 2.0` 秒 CPU：父进程维护 `activity_reference_cpu`，心跳累计 CPU 自上次记账前进 ≥2 秒即记一次活动（刷新 `last_active_at`）。心跳线程自身每 5 秒的写入约 0.2ms CPU，20 分钟仅 ~0.05 秒，永远不会触发；任何真实推理（含 GPU 驱动的 Python 侧）每段推理都远超 2 秒 CPU。比例换算（CPU/墙钟比）被否决：GPU 推理的合法 CPU 占比不稳定。

### 3. 双通道终止条件

```
stall ⇐ (无 chunk 进展 > stall_limit 且 无心跳活动 > stall_limit)
      或 (无 chunk 进展 > stall_limit × 3)
```

- 第一支：推理死锁（CPU 冻结）在原时限内被终止——保持 rc.2 修复的保护强度。
- 第二支硬上限：忙循环（CPU 前进但永不产出 chunk）有界终止。倍数 3（默认 3600s）覆盖任何合理慢 chunk（2 分钟音频窗口 RTF 30 仍不可能合法），同时远小于"永久"。
- 心跳文件缺失/不可读 → `last_active_at` 永不前进 → 第一支退化为现行行为（仅按 chunk 进展）。

### 4. Worker 侧心跳线程

`run_local_task_worker` 启动 daemon 线程，每 `LOCAL_WORKER_HEARTBEAT_SECONDS=5` 原子写 `result_path.parent / "heartbeat.json"`：`{"at": time.time(), "cpu": time.process_time(), "completed": len(results), "total": len(inputs)}`。`results` 由主线程 append，GIL 下 `len()` 读取一致。主流程结束（成功/失败/异常）置 Event 停止线程；daemon 兜底进程退出。不进 result.json（避免与结果写入竞争同一 tmp 文件名）。

### 5. 存活刷新只动 `updated_at`

心跳活跃且无 chunk 进展期间，父进程每 `LOCAL_WORKER_LIVENESS_SECONDS=30` 提交一次 `row.updated_at = utc_now()`；不发事件、不动 `progress`/chunk 状态——维持「Work-based local progress」requirement（进度只来自有界工作），界面轮询 tasks 即可看到存活。

## 风险

- 心跳线程在冻结二进制中的行为：仅用标准库 `threading`/`time`/`json`/`os`，与现有 worker 入口同进程，PyInstaller 无额外 hook 需求。
- `time.process_time()` 平台差异：分辨率与语义（CPU 秒）在 Windows/macOS/Linux 一致，均为进程级累计；断言语义在平台间一致。
- 极端：心跳线程自身崩溃 → 心跳冻结 → 回退第一支判定（保守方向正确）。

## 回滚

改动集中在 `local_task_worker.py`（心跳线程）与 `tasks.py` 的 `_transcribe_local_subprocess`（判定与刷新）+ 常量；回滚即还原两文件与测试。spec delta 随 change revert；无数据迁移。
