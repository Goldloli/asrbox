## 为什么

K3 已完成第一批高风险审计修复，但逐项复核发现，部分报告结论尚未由实现或回归测试真正保证：字幕编辑与版本快照仍可能分两次提交，并发重试仍可重复入队，worker 退出计数不会回收，Tauri 路径校验也可能被符号链接绕过。与此同时，长效 API token 仍会进入前端资源 URL，活库备份和若干外部进程/网络调用缺少一致性或超时边界。

本 change 在不改变正常转写、编辑、导出、播放和桌面使用流程的前提下，补齐这些已确认缺口，并为失败与并发场景建立可回归的行为约束。

## 变更内容

- 让任务重试、重转写、删除与字幕写操作在单进程运行时内具备互斥的状态转换；worker 即使意外退出也会回收计数并可被补充。
- 让批量字幕保存与唯一版本快照在同一个数据库事务中提交，拒绝活动任务编辑和非有限时间值。
- 对 Tauri 文件位置目标执行规范化后的 bundle 校验，并为桌面健康检查、关停与更新下载增加有界等待。
- 让受维护前端不再把长效 API token 放入 SSE、音频、导出或诊断包 URL，并在 SSE 首连或中途断开后自动退避重连。
- 非 loopback 容器暴露时要求显式 API token；loopback 默认部署保持现状。
- 使用 SQLite 在线备份 API 创建一致快照；对媒体探测/转码增加有界执行并正确处理未知时长。
- 净化批量导出 ZIP 条目名称，避免用户文件名形成目录穿越条目。
- 补齐真实 worker 存活、并发入口、字幕事务、MCP/文件边界和受维护 API surface 的回归测试；修正无效断言与未接入测试入口。
- 对版本一致性、快捷键输入豁免、设置地址暂存等低风险问题做局部维护；不新增依赖，不迁移持久化数据。

## 能力（Capabilities）

### New Capabilities

无。

### Modified Capabilities

- `transcription-lifecycle`：强化单任务单执行、活动任务写保护、worker 退出恢复及媒体工具有界失败。
- `transcript-editing-versioning`：保证字幕批量保存与版本快照真正原子，并拒绝非有限时间值和运行中任务编辑。
- `desktop-runtime-security`：禁止规范化后指向可执行 bundle 的路径，并避免受维护客户端通过 URL 泄露长效 token；桌面网络操作有界结束。
- `container-deployment`：非 loopback 发布必须配置非空 API token。
- `storage-privacy-recovery`：备份使用 SQLite 一致快照而不是直接复制活跃数据库文件。
- `media-ingest-storage`：媒体探测与 ffmpeg 处理在超时或未知时长时明确失败或安全降级。
- `model-management`：把状态页的重运行时兼容性导入隔离到短命探测进程，避免请求进程长期持有模型框架内存。
- `export-formats`：批量导出 ZIP 的每个条目均为净化后的叶子文件名。
- `frontend-quality`：应用事件流自动重连，设置和快捷键交互避免无关的破坏性副作用。
- `about-update-management`：桌面更新传输在持续无数据时超时，但不影响其他工作流。
- `release-readiness`：版本一致性门禁覆盖 Dockerfile、Compose 与 `.env.example` 的发布版本来源。

## 影响

涉及 `backend/services/tasks.py`、`backend/services/storage.py`、媒体调用与容器启动配置，React API/事件/下载/音频调用，Tauri 路径和 HTTP 生命周期，以及相应 Python、Rust、Playwright、contract 与版本检查测试。不会新增数据库 migration、第三方依赖或受支持的转写/导出格式，也不会改变桌面 loopback 地址和进程级 token 模型。
