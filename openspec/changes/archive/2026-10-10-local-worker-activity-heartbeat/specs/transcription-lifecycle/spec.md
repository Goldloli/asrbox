# transcription-lifecycle Delta

## ADDED Requirements

### Requirement: 本地推理 worker 的活跃心跳与停滞终止

长时间本地转写 SHALL 由 worker 子进程持续输出活跃心跳：心跳 SHALL 包含进程累计 CPU 时间并周期性原子写入，转写结束后停止。父进程 SHALL 以心跳的 CPU 前进判定 worker 是否仍在推进推理：心跳活跃（CPU 累计超过活动下限）而 chunk 长时间未完成时（慢推理）SHALL 不因停滞时限误终止该任务，且 SHALL 在此期间周期性刷新任务行的 `updated_at` 呈现存活，`progress` SHALL 仍只来自已完成的有界 chunk 而不随时间虚增。终止条件 SHALL 为二者之一：chunk 无进展且心跳 CPU 停滞超过停滞时限（进程存活但推理死锁），或无论心跳如何 chunk 无进展超过硬性上限（停滞时限的整数倍，防 CPU 忙循环）。终止后任务 SHALL 以 `LOCAL_WORKER_STALLED` 失败并保留诊断，本地队列 SHALL 继续处理后续任务。心跳不存在或不可读时 SHALL 回退为仅按 chunk 完成进度判定停滞（与既有行为一致）。

#### Scenario: 慢 chunk 在心跳活跃时不被误杀
- **WHEN** 本地 worker 正在推理一个耗时超过停滞时限的 chunk，心跳持续写入且进程 CPU 时间持续前进
- **THEN** 任务不被 `LOCAL_WORKER_STALLED` 终止，任务行 `updated_at` 在等待期间周期性刷新，`progress` 不随时间虚增，chunk 完成后进度照常推进

#### Scenario: 推理死锁在心跳停滞后被终止
- **WHEN** worker 进程存活但心跳的进程 CPU 时间长时间不再前进（无 chunk 完成且无 CPU 活动，持续超过停滞时限）
- **THEN** worker 被终止，任务以 `LOCAL_WORKER_STALLED` 失败，后续排队的本地任务继续执行

#### Scenario: 心跳活跃但硬上限无 chunk 完成
- **WHEN** 心跳 CPU 持续前进（如忙循环）但在硬性上限时间内没有任何 chunk 完成
- **THEN** worker 仍被终止并以 `LOCAL_WORKER_STALLED` 失败，不会无限占用本地 worker 队列

#### Scenario: 心跳缺失时回退既有判定
- **WHEN** worker 未产出可读的心跳文件且长时间无 chunk 完成
- **THEN** 停滞判定回退为仅按 chunk 完成进度（超过停滞时限即终止），与引入心跳前的行为一致
