## 为什么

第二轮审计确认，活动任务仍可从 chunk 重试、按任务清理和 relink 入口绕过单写者保护；校对 worker 退出与建议应用也未完全纳入同一生命周期边界。这些问题即使只有一名本地用户，也可能造成重复推理、文件被运行中任务删除、队列永久停摆或字幕版本交错，因此应在不改变正常成功路径的前提下收口。

## 变更内容

- 让单个和批量 chunk 重试先短事务认领任务，只允许失败 chunk 恢复；耗时推理移出 FastAPI 事件循环，并发或活动状态冲突返回 409。
- 让按任务派生文件清理和桌面 relink 与其他任务状态转换互斥，活动任务不删除文件、不改路径。
- 让校对建议应用与任务重试/重转写互斥；校对 worker 即使线程级退出也回收状态并自动补员。
- 为 resource ticket 同时设置空闲过期与绝对最长寿命，返回的 `expires_at` 表示真实不可续期上限。
- 让首次重运行时探测在工作线程执行，避免异常导入在总时限内阻塞 API 事件循环。
- 清理切片失败时本次已生成的 chunk，并让递归 orphan 清理保留数据库仍引用的 chunk。
- 让 GitHub CI 与 release 运行前端单元测试及完整维护 E2E 命令。

## 能力（Capabilities）

### New Capabilities

无。

### Modified Capabilities

- `transcription-lifecycle`：chunk 恢复、按任务清理及相关并发入口遵守活动任务单写者保护。
- `media-ingest-storage`：活动任务 relink 被拒绝，失败切片与递归 orphan 清理不留下或误删派生文件。
- `transcript-proofreading`：建议应用与任务状态转换互斥，校对 worker 线程退出后可补员。
- `desktop-runtime-security`：resource ticket 具有不可续期的绝对最长寿命。
- `model-management`：有界重运行时探测不阻塞其他 API 请求。
- `release-readiness`：维护前端单元测试和完整浏览器套件进入 CI 与 release 门禁。

## 影响

涉及任务/chunk 生命周期、媒体派生文件清理、校对队列、resource ticket、runtime 路由和 GitHub Actions。现有数据库 schema、正常转写/重试/播放/relink 成功响应、字幕版本格式、桌面地址和 API token 模型保持不变；不新增依赖，不迁移密钥，不全量重写历史 API response model。
