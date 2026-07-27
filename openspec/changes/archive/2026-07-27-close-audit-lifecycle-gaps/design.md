## 背景

当前 `backend/services/tasks.py` 只对整任务 retry/retranscribe/delete 和字幕写入使用 `_task_transition_lock`。`retry_chunk`、`retry_failed_chunks`、`cleanup_task_artifacts` 与 `relink_task_media` 仍直接读取并修改任务、chunk 和派生文件；其中 chunk 重试还从 FastAPI `async` 路由同步执行模型推理。`backend/services/proofreading.py` 的建议应用未共享任务转换锁，校对 worker 也没有线程退出回收。另有 resource ticket 可被持续续期、runtime 状态路由同步等待探测进程，以及维护测试仅在本地聚合脚本完整运行。

ASRbox 当前支持单 Uvicorn 进程和进程内 worker。本 change 不引入数据库迁移或多进程分布式锁，继续以这一运行模型为边界。

## 目标 / 非目标

**目标：**

- 让所有会重跑 chunk、删除派生文件或切换媒体路径的入口遵守活动任务单写者规则。
- 保持现有同步 chunk retry API 的成功响应，但把耗时工作移出事件循环，并保证并发请求至多一个执行。
- 让校对应用和 worker 线程生命周期与任务加固对称。
- 让 ticket、探测进程和派生文件失败都具有真实有界的资源生命周期。
- 让 GitHub 门禁执行已经声明为维护状态的前端测试。

**非目标：**

- 不新增 chunk job 数据表、运行代次字段或多进程 CAS；未来若支持多 Uvicorn worker，应单独设计数据库级认领。
- 不改变正常完成任务的 retry、播放、清理、relink 或校对用户流程。
- 不迁移明文 API key，不实现 TasksPage 元数据持久化，不新增 split/merge UI。
- 不在本 change 内为全部历史路由补齐 response model；只保持本次接触的 contract 不退化。
- 不把运行时探测改成常驻守护进程，也不新增依赖。

## 决策

### 1. chunk retry 使用“短事务认领 + 线程池执行”

服务在共享任务转换锁内重新读取任务和目标 chunk，拒绝活动任务与非失败 chunk，把任务临时转换为 `transcribing` 并提交后立即释放锁。路由使用 Starlette/AnyIO 线程池调用同步服务，保持原有请求完成后返回最终任务的 contract，同时不阻塞事件循环。

第二个并发请求会在新鲜读取时看到活动状态并收到 409。批量重试只认领一次并依次处理认领时的失败 chunk；全部成功才合并为一个最终版本，部分成功则回到可恢复失败状态。耗时推理期间不持有全局转换锁，其他任务不受影响。
取消入口和最终合并共享短转换边界；若推理期间收到取消，恢复结果不再覆盖 `cancelled` 状态或创建最终版本。

备选方案是直接放入现有整任务队列并返回 202。它会改变响应时序和前端交互，因此本轮不采用。

### 2. 文件清理和 relink 共用无提交内部原语

公开 `cleanup_task_artifacts` 在转换锁内重新读取并拒绝活动任务，再调用只负责删除派生文件/行的内部函数。`relink_task_media` 在同一锁和同一事务中清理旧派生文件、切换路径并记录日志，避免中间提交。转写成功后的自动清理只在任务已落为 completed 后调用内部路径，保持现有行为。

### 3. 校对共享任务转换锁，worker 维护一个目标线程

把进程级任务转换锁放到无业务依赖的小模块，任务服务与校对服务共同使用。建议应用在锁内刷新 task/run/version，完成 staleness 校验、文本替换和版本提交。

校对队列维护目标数和存活数。普通 `Exception` 继续由同一线程兜底；`BaseException` 使当前运行尽力失败并退出，线程 `finally` 回收计数、按目标补员。线程启动失败会回滚预占计数。

### 4. ticket 同时使用 idle 与 absolute expiry

ticket 保存空闲截止时间和不可续期的绝对截止时间。成功的 Range/GET 只把 idle 截止延长到 `min(now + idle_ttl, absolute_deadline)`；过期清理检查两者。响应 `expires_at` 表示绝对截止时间，避免字段早于实际有效期。默认 idle 仍为 30 分钟，绝对最长寿命采用 24 小时，以兼容超长音频播放。

### 5. 阻塞探测与文件工作移出事件循环

runtime status、health report 和诊断包路由通过 `run_in_threadpool` 执行现有同步服务。探测总时限和缓存逻辑不变；改变的只是等待所在的执行线程。

切片函数在失败时删除本次调用已成功生成的所有 chunk。orphan 清理先把 task 与 `TranscriptionChunk` 的路径都加入引用集合，再递归扫描受管 uploads/derived 目录，只删除没有数据库引用的 WAV。

### 6. CI/release 复用维护命令

GitHub CI 和 release 显式运行 `test:frontend:unit`，浏览器阶段只调用 `test:e2e:maintained`，避免工作流复制 spec 清单后再次漂移。OpenSpec CLI 目前不是项目锁定依赖，因此本 change 不把 CLI 安装引入 CI；规格校验仍由仓库工作流与合并前门禁执行。

## 风险

- [同步 chunk retry 仍占用一个通用线程池线程] → 不阻塞事件循环，且活动认领限制同任务重复执行；未来异步 job 化另行设计。
- [进程内锁不覆盖未来多进程部署] → 当前受支持部署保持单进程，并在设计中明确升级前置条件。
- [活动 cleanup/relink 新增 409] → 这是错误路径收紧；终态任务的正常操作保持原响应。
- [ticket 绝对寿命中断超过 24 小时的连续播放] → 24 小时明显高于维护媒体工具的默认工作量，用户可重新获取 ticket，长期泄漏不再无限有效。
- [递归 orphan 扫描扩大文件遍历范围] → 仅扫描受管目录和 `.wav`，并把所有 task/chunk 引用加入保留集合。

## 回滚

无 schema migration。可整体回退代码与工作流；数据库、字幕版本、chunk 行和资源 URL 格式保持可读。进程重启会自然清除所有内存 ticket、锁和 worker 状态。

## 待确认问题

无阻塞问题。全量 API schema 类型化、裸机非 loopback 启动策略和 Keychain 迁移保留为后续独立 change。
