## 背景

本 change 以 K3 在 `fix/audit-hardening` 工作树中的未提交实现为基线，不回退其三组已归档 change。复核定位到以下实现与声明不一致：

- `backend/services/tasks.py` 的 `_task_worker` 能兜住普通异常，但 `_worker_counts` 只增不减；`retry_task`、`retranscribe_task` 与 `delete_task` 的“检查后修改”也没有跨请求互斥。
- `backend/services/tasks.py` 的 `_save_edit_version` 先提交字幕，再调用会第二次提交的 `version_service.create_version`；`backend/services/versions.py` 的 restore 和 postprocess 路径存在同类窗口。
- `tauri/src-tauri/src/main.rs` 在判断 `.app` 等 bundle 前没有规范化符号链接目标；健康检查与关停使用无总超时客户端。
- `app/src/lib/api.ts` 把进程级 API token 放入浏览器资源 URL，`app/src/lib/useAppEvents.ts` 在首次错误后永久关闭事件流。
- `backend/services/storage.py` 直接把活跃 SQLite 文件加入 ZIP；`backend/services/media.py` 的外部进程没有总时限且会把 `"N/A"` 当浮点数。
- `backend/services/platform.py` 和模型状态路径会在长期运行的 API 进程中真实导入 Torch、FunASR、MLX 等重运行时。

约束是：桌面地址和 token 模型、现有 API 的成功响应、字幕不可变版本语义、模型文件布局、导出格式及数据库 schema 均保持兼容；不覆盖用户已有的 `AGENTS.md` 修改。

## 目标 / 非目标

**目标：**

- 让已归档规格中的“单执行”“worker 存活”“原子编辑”和“拒绝可执行 bundle”由实现与失败测试共同保证。
- 消除受维护前端对长效 token 查询参数的依赖，同时保留音频流式/Range 播放。
- 为备份、媒体工具、桌面 HTTP 和更新下载建立与工作量匹配的有界失败。
- 把只用于兼容性探测的重运行时导入隔离到短命子进程，并缓存探测结论。
- 修复不改变核心工作流的导出文件名、快捷键、设置暂存、diff 内存和版本门禁问题。

**非目标：**

- 不增加标签、收藏、笔记、文集的持久化 schema；这些当前仅存在于页面内存，需独立产品规格决定数据模型与同步语义。
- 不新增 split/merge 前端交互，不重做波形峰值服务，也不改变用户显式触发的媒体预检。
- 不重写 Git 历史中的 `.beads/interactions.jsonl` blob；历史清理是破坏性仓库维护，必须另行授权。
- 不更换 API key 的本地明文存储方案，不引入 Keychain 或新依赖。
- 不删除仍可能被外部 Python 集成导入的 `create_task` 兼容函数。

## 决策

### 1. 用进程内状态转换锁保证单进程任务入口线性化

在 `tasks.py` 使用独立 `RLock` 包围任务重新读取、活动检查、状态/段落修改、提交和入队。ASRbox 当前受支持后端为单 Uvicorn 进程，因此该锁能阻止两个并发 retry 同时读到终态并重复入队。worker 目标数与存活数分别记录；线程启动前预占计数，启动失败回滚，线程生命周期 `finally` 回收并按目标数补员。

备选是 SQLite 条件更新或新增运行代次字段。它能支持多进程，但会引入 schema/迁移和所有 worker 的代次校验；当前运行模型不需要这组复杂度。

### 2. 字幕状态和版本快照只允许一个事务提交

所有字幕结构写入口先拒绝活动任务。`_save_edit_version` 在同一 Session 内 flush/reindex/重算 `task.text`，调用 `create_version(..., commit=False)` 后只提交一次；任一步失败均 rollback。restore 与 postprocess 同样使用无中间提交的版本服务路径。

时间字段使用 Pydantic `FiniteFloat` 并保留 `start >= 0`、`end > start` 的业务校验，避免 NaN/Infinity 穿过比较后在整数转换时造成 500。

### 3. 长效 token 使用 header；浏览器原生资源使用短命、限路径 ticket

普通请求、导出与诊断下载继续使用 `Authorization: Bearer`。SSE 改用带 Authorization 的 `fetch` 流解析器，并在首连或中途断开后指数退避重连。

`<audio>` 需要浏览器原生 Range 请求且不能设置 Authorization，因此新增内存态 resource ticket：ticket 只能 GET 创建时声明的 `/tasks/{id}/audio`，有短时过期、数量上限且进程退出即失效。维护客户端 URL 只携带该限权 ticket，不携带进程级 token。鉴权 middleware 在验证敏感查询参数后从 ASGI scope 移除它们，使 Uvicorn access log 不记录凭据。

备选是把整段音频 fetch 成 Blob；这会放大长音频内存问题并失去按需 Range。认证 cookie 在 Tauri 自定义 origin 到 loopback HTTP 的 SameSite/Secure 约束下也不可靠。

为外部兼容，既有 `api_token` 查询鉴权暂不删除，但会被日志净化并在文档中标记为兼容路径；受维护前端不再使用它。

### 4. 容器暴露策略采用“可观察发布地址”门禁

Compose 把宿主发布地址作为 `ASRBOX_PUBLIC_BIND_ADDRESS` 传入容器；应用 lifespan 在该地址非 loopback 且 token 为空时拒绝启动。Dockerfile 的直接运行默认视为 `0.0.0.0`，要求 token；受支持 Compose 的默认 `127.0.0.1` 仍可无 token 启动。

容器内部监听始终需要 `0.0.0.0`，因此不能直接拿 Uvicorn bind host 判断宿主暴露范围。

### 5. SQLite 备份先创建在线快照

使用标准库 `sqlite3.Connection.backup()` 把活库复制到备份目录内的唯一临时文件，再把该快照加入 ZIP，并在成功或失败后清理临时文件。manifest 计数仍来自当前 SQLAlchemy Session，恢复格式和 `asrbox.db` 条目名不变。

### 6. 外部调用使用分层超时

ffprobe 使用较短固定总时限；ffmpeg 根据已知媒体时长计算宽松上限，未知时长使用数小时的保守上限，并允许环境变量提高。超时转为现有 `ASRboxError` 错误族且删除不完整输出。`"N/A"`、非有限或负 duration 安全映射为未知时长。

Tauri 健康检查和 shutdown 使用带 connect/total timeout 的 client；更新下载对每次 `chunk()` 等待施加 idle timeout，而不是限制总下载时长，因而慢但持续有数据的合法下载不会被中止。

### 7. 运行时兼容性导入在一个短命探测进程中完成

`backend.server --runtime-check all` 在子进程内导入重运行时并输出结构化 JSON；父进程设置总时限、缓存一次结果并只保留小型状态。源运行时使用 `python -m backend.server`，冻结运行时直接调用自身参数。探测失败保守地报告不可用和可诊断原因；真实转写仍会在隔离的本地任务 worker 中再次加载实际引擎。

一次探测多个运行时比每模型启动一个进程冷启动更少；相较仅用 `find_spec`，它仍满足“真实可导入”的兼容性承诺。

### 8. 低风险维护保持数据与交互边界

- ZIP 条目只使用净化后的叶子 stem、task id 和固定扩展名。
- server URL 与 token 在设置页先进入本地草稿，显式应用时一次更新连接，避免每次击键清 token。
- 全局快捷键忽略 input、textarea、select、contenteditable 和组合输入事件。
- 版本 diff 在行数乘积超过上限时使用线性摘要，不再分配完整 LCS 矩阵。
- 版本检查解析 Dockerfile、Compose 与 `.env.example`，并把当前默认值统一到根版本。
- Tauri 对打开目标先 canonicalize，再判断 bundle；生产 CSP 不保留 dev server 源，JavaScript shell-open 配置一并移除。

## 风险

- [进程内锁不覆盖未来多 worker Uvicorn 部署] → 当前部署明确保持单进程；若未来扩展，必须先引入数据库代次/CAS。
- [resource ticket 出现在 URL] → 它仅限一个 GET 路径、短期、内存态且 access log 会净化；不能调用其他 API，风险显著小于长效全权 token。
- [运行时探测增加首次状态请求延迟] → 只启动一个有总时限的子进程并缓存；父进程内存不被重框架长期占用。
- [媒体总超时误伤极慢设备] → 上限按媒体时长放大、默认宽松且可配置；持续的更新下载只限制无数据等待。
- [活动任务编辑返回 409] → 正常 UI 只编辑完成结果；冲突响应保留 worker 唯一写者，避免真实数据损坏。
- [备份 manifest 与快照时间存在极小偏差] → 数据库文件本身保持事务一致；manifest 计数只是说明信息，不作为恢复完整性来源。

## 回滚

本 change 不含 schema migration。回滚时可整体恢复前一版本代码；既有数据库、备份 ZIP、字幕版本、模型目录和前端 session token 均保持可读。resource ticket 仅在内存存在，回滚或重启会自然失效。若运行时探测子进程在特定打包环境不可用，可先回退到原进程内探测而不修改持久化数据。

## 待确认问题

无阻塞问题。TasksPage 元数据持久化、波形峰值服务与 Git 历史清理保留为独立后续决策，不在本 change 中暗自扩展。
