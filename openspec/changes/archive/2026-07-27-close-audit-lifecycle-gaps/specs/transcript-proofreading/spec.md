## ADDED Requirements

### Requirement: 校对生命周期并发一致性

校对建议应用 SHALL 与同一任务的 retry、retranscription、删除、媒体 relink 和其他字幕写入共享单进程状态转换边界，在锁内重新验证任务完成状态与来源版本后原子提交。校对队列 SHALL 维护一个可恢复 worker：普通运行异常不终止线程，线程级异常退出时 SHALL 回收存活状态并自动启动替代 worker。

#### Scenario: 应用建议与任务重试并发

- **WHEN** 校对应用和 retry 或 retranscription 同时针对同一已完成任务
- **THEN** 一个状态转换先完成，另一个基于更新后的状态或版本明确失败，而不会交错写入字幕和版本

#### Scenario: 校对 worker 线程退出

- **WHEN** 校对 worker 遇到线程级异常并退出且队列仍要求 worker
- **THEN** 当前运行尽力落为失败、存活计数被回收，并有替代 worker 继续处理后续队列
