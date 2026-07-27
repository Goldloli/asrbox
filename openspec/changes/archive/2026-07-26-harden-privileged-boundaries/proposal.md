# Proposal: harden-privileged-boundaries

## 为什么

2026-07 安全审计确认了三处特权边界缺口，均允许超出预期信任范围的操作：

1. **MCP 任意文件读**（高）：`backend/mcp_server/server.py` 的 `asrbox.transcribe` 接受任意 `path` 并登记为外部引用任务，缺少 HTTP 路由 `/transcriptions/path` 上的桌面模式门禁。配合 `GET /tasks/{id}/audio` 可回读进程可达的任意文件（如存有明文 provider key 的 `asrbox.db`）。Docker 默认部署（空 token + loopback）下为本机未认证任意文件读。
2. **模型删除路径穿越**（高）：`DELETE /models/{model_name}` 未做注册表校验，`delete_model` 直接 `shutil.rmtree(get_models_dir() / model_name)`；`..` 可删除整个模型存储根乃至上级数据目录。
3. **WebView 可决定任意路径/URL**（中）：`save_text_file` 的 `directory` 未校验（可写 `~/Library/LaunchAgents` 等）；`open_file_location` 对目录直接 `shell.open`，`.app` bundle 是目录，可被启动；`shell:allow-open` capability + 宽正则 `^(file://|https?://|/).*$` 使 WebView JS 可绕过全部 Rust 侧校验直开任意 URL/路径。

三处都违反 `desktop-runtime-security` 的既定边界精神，其中 1、2 为发布阻断项。

## 变更内容

- **MCP 转写路径边界**：非桌面模式下，`asrbox.transcribe` 仅接受解析后位于 uploads 目录、派生音频目录或 operator 显式声明的附加根（新环境变量 `ASRBOX_MCP_ALLOWED_ROOTS`）之内的媒体文件路径；桌面模式保持现有任意路径行为（与 HTTP 路由一致）。拒绝时返回明确错误而非静默失败。
- **模型删除校验**：`delete_model` 服务层先校验模型名在注册表中，并以 resolve 后仍位于 models root 内为双重防护；未知名/非法名返回 404，不再触碰文件系统。
- **Tauri 文件保存边界**：`save_text_file` 的 `directory` 仅接受系统下载目录（默认）、应用数据目录、以及经原生目录选择器挑选并记录的目录（Rust 侧持久化允许清单，覆盖应用重启）。
- **Tauri 位置打开边界**：`open_file_location` 改为纯"在访达中显示"语义——文件一律打开其父目录；拒绝打开 `.app` 等可执行 bundle 目录；保留对任务媒体（含 reference 模式任意路径）与存储根的合法展示能力。
- **移除 JS shell.open 权限**：从 capabilities 删除 `shell:allow-open`（前端无任何 JS 侧使用），WebView 打开 URL/位置只能走经校验的 Rust command。

## 能力（Capabilities）

### New Capabilities
- `mcp-integration`: MCP 工具面的信任边界——转写路径白名单、与桌面模式的关系、错误行为。

### Modified Capabilities
- `model-management`: `Controlled model download lifecycle` 增加删除动作的注册表与路径校验要求。
- `desktop-runtime-security`: 新增 WebView 特权命令的路径/URL 边界要求（保存目录白名单、reveal-only 位置打开、禁止 JS 侧 shell open）。

## 影响

- 后端：`backend/mcp_server/server.py`、`backend/services/models.py`、`backend/routes/models.py`、`backend/config.py`（新增 env 解析）；新增 pytest 用例（MCP 拒绝/放行、delete_model 404 与穿越拒绝）。
- 桌面：`tauri/src-tauri/src/main.rs`（save_text_file / open_file_location 校验与允许清单）、`tauri/src-tauri/capabilities/default.json`（移除 `shell:allow-open`）；新增 Rust 单测（允许/拒绝路径）。
- 前端：无 API 形状变化；`saveTextFile`/`openFileLocation` 调用方不变。极端情况下升级前设置的非白名单导出目录会在保存时被拒，用户经目录选择器重选一次即恢复（release note 说明）。
- 文档：README/docker 文档补充 `ASRBOX_MCP_ALLOWED_ROOTS`；release notes 说明导出目录白名单行为。
- 不变量保持：桌面 loopback 绑定、进程级 token、版本不可变、typed consumer 均不受影响。
