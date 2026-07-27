# Design: harden-privileged-boundaries

## 背景

- `backend/mcp_server/server.py:24-39`：`_transcribe` 直接 `create_task_from_path(Path(payload.path))`，唯一校验是文件存在（`backend/services/tasks.py:375-377`）。HTTP 等价入口 `backend/routes/transcriptions.py:272` 有 `_require_desktop_mode()`，MCP 没有。任务登记后 `GET /tasks/{id}/audio`（`backend/routes/tasks.py:263`）以 `FileResponse` 原样回读该路径。fastmcp 仅随 docker 依赖安装（`requirements-docker.in:25`），`/mcp` 挂在 FastAPI app 内、受全局 token 中间件保护，但 compose 默认 token 为空（`compose.yaml:15`）。
- `backend/services/models.py:74` `_model_dir = get_models_dir() / model_name`；`:628-637` `delete_model` 无注册表校验直接 `rmtree`。同文件其他写操作均有 `get_model_config(model_name) is None → raise`。Starlette 路径参数可携带 `%2E%2E`。
- `tauri/src-tauri/src/main.rs:396-425` `save_text_file`：文件名经 `safe_filename` 净化、写入用 `unique_download_path` 防覆盖，但 `directory` 原样 `PathBuf::from`。
- `main.rs:272-286` `open_file_location`：文件取父目录、目录直接 `app.shell().open`；macOS 上 `.app` 是目录，`open` 之即启动。
- `tauri/src-tauri/capabilities/default.json:10` 授出 `shell:allow-open`；`tauri.conf.json:44` open scope 正则 `^(file://|https?://|/).*$` 几无限制；`withGlobalTauri: true` 使 WebView 可直接 `invoke('plugin:shell|open', ...)`。前端 `app/src` 无 plugin-shell 的 JS 使用，业务打开行为全部走 Rust command。
- 前端合法流向（实现不得破坏）：
  - `saveTextFile`：`app/src/lib/downloads.ts:9`，directory 来自 `uiStore.exportDirectory`（`app/src/stores/uiStore.ts:29,79`，persist 到 localStorage），只能经 `pickExportDirectory` 原生对话框设置或设置导入写入（`SettingsPage.tsx:158-167, 207`）。
  - `openFileLocation`：任务媒体路径（`TasksPage.tsx:670`，reference 模式下是用户磁盘任意位置的原文件）、模型存储根（`ModelStorageSettings.tsx:80`）、媒体存储路径（`MediaStorageSettings.tsx:166`）、更新包位置（独立命令，不经此路径）。

## 目标 / 非目标

目标：
- 堵住上述三条具体攻击路径，且每一处的合法产品功能保持可用。
- 每条边界都有允许与拒绝两面的自动化测试。

非目标：
- 不处理 token 经 URL query 进日志（另立 change 评估一次性票据/cookie 方案）。
- 不改变 Docker 默认空 token 的部署语义（文档已声明；另议）。
- 不重构 provider key 明文落库/备份（docs/privacy.md 已披露）。
- 不为 MCP 增加新功能；只补信任边界。

## 决策

### D1. MCP 路径白名单而非机械桌面门禁

非桌面模式下 `_transcribe` 要求 `Path(path).resolve()` 位于以下根之一（逐个 resolve 后用 `is_relative_to` 判定）：
1. 配置的 uploads 目录；
2. 配置的派生音频目录；
3. `ASRBOX_MCP_ALLOWED_ROOTS`（新增 env，逗号分隔）中每个非空根。

桌面模式（`ASRBOX_DESKTOP_MODE`）保持现状任意路径，与 HTTP 路由对齐。拒绝时抛带明确信息的 `ValueError`（MCP 工具错误），不创建任务。

备选：直接加 `_require_desktop_mode()` 等价门禁——否决：MCP 只随 docker 依赖分发，该模式永远非桌面，等于删除 Docker MCP 转写能力。
备选：白名单包含整个 data dir——否决：`asrbox.db`（含明文 key）位于 data dir 根，正是要挡住的目标；只允许 uploads/derived 两个子目录。

### D2. delete_model 注册表校验 + resolve 双重防护

服务层入口：`get_model_config(model_name) is None` → 抛 `KeyError`（路由映射 404）；随后 `_model_dir(model_name).resolve()` 必须 `is_relative_to(get_models_dir().resolve())`，否则同样拒绝。两层独立，单层失效仍安全。路由层 404 与既有 `download_model` 对未知名行为一致。

### D3. save_text_file 目录白名单（Rust 侧持久化记录）

允许目录 = 以下集合内（resolve 后相等或为其后代）：
- 系统下载目录（`directory` 为空/缺省时的默认，保持现状）；
- 应用数据目录与后端数据目录；
- 经 `pick_export_directory` / `pick_model_storage_directory` 原生对话框返回的目录——Rust 侧追加记录到 app config 下的 `allowed-save-dirs.json`，启动时加载（覆盖应用重启）。

拒绝时返回明确错误字符串。文件名净化与 unique 防覆盖逻辑不变。

备选：仅内存 allowlist——否决：`exportDirectory` 经 localStorage 持久化，重启后 Rust 内存清单为空，合法导出全部失败。
备选：放行 home 下任意目录——否决：`~/Library/LaunchAgents` 在 home 内，攻击面原样保留。
已知取舍：升级前已设置、且不在白名单来源内的导出目录，升级后首次保存被拒，用户重选一次目录即被记录恢复；写入 release note。

### D4. open_file_location 改为 reveal-only 语义

- 目标是文件 → 打开其父目录（现状逻辑保留）；
- 目标是目录 → 若名称以 `.app` 等可执行 bundle 扩展结尾（至少 `.app`，兼顾 `.framework`/`.bundle`/`.plugin`），拒绝；否则打开该目录；
- 路径不存在 → 明确错误（现状保留）。

不引入路径白名单：reference 模式任务媒体可在用户磁盘任意位置，"在访达中显示"是该场景的产品功能；Finder 打开目录不执行代码，在 D5 移除 JS 直开能力后，残余面仅为"在用户自己的文件管理器里高亮一个文件"，无可利用原语。

备选：白名单限定数据目录+对话框记录路径——否决：reference 模式"打开位置"（TasksPage）会被误杀。

### D5. 删除 `shell:allow-open` capability

`default.json` 移除该权限。前端无 JS 侧使用（grep `app/src` 无 plugin-shell import）；Rust 内部 `app.shell().open()` 不经 JS capability 判定，不受影响。`tauri.conf.json` 的 `open` scope 配置保持启用（Rust 侧 open 依赖插件 open 功能开启），其实际约束面随 JS 入口关闭而失效。以 cargo 测试 + 桌面启动冒烟验证关于/更新中心的打开链接功能不回归。

## 风险

- D3 的持久化清单文件损坏 → 读取失败按空清单处理，用户重选目录恢复，不阻断默认下载目录导出。
- D4 误判合法目录名（如用户文件夹恰叫 `x.app`）→ 仅影响"打开位置"单个动作，错误信息明确，可接受。
- D1 白名单误判 Docker 内 media 挂载路径 → operator 可通过 `ASRBOX_MCP_ALLOWED_ROOTS` 显式追加，文档给出示例。
- `shell:allow-open` 移除后若有未发现的 JS 调用 → 前端 grep 已确认无；cargo/桌面冒烟兜底。

## 回滚

全部改动为新增校验与一项权限移除，无数据迁移、无持久化格式变更（`allowed-save-dirs.json` 为新增文件，删除即失效）。回滚 = revert 对应 commit；不需要数据恢复步骤。
