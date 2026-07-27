# Tasks: harden-privileged-boundaries

## 1. 后端：MCP 路径边界

- [x] 1.1 `backend/config.py` 解析 `ASRBOX_MCP_ALLOWED_ROOTS`（逗号分隔，空项忽略），并提供 MCP 允许根集合（uploads 目录、派生音频目录、附加根）
- [x] 1.2 `backend/mcp_server/server.py` `_transcribe`：非桌面模式按 D1 校验 `resolve()` + `is_relative_to`，拒绝时明确报错且不创建任务；桌面模式保持现状
- [x] 1.3 测试：非桌面下允许根内路径放行、data dir 根下文件（如 db 路径）拒绝、env 附加根放行、桌面模式放行

## 2. 后端：delete_model 校验

- [x] 2.1 `backend/services/models.py` `delete_model` 增加注册表校验 + resolve 后 `is_relative_to` models root 双重防护
- [x] 2.2 路由未知名返回 404（与 download_model 未知名行为一致）
- [x] 2.3 测试：未知名 404 且目录未动、`..`/`.` 名称拒绝且 models root 完好、正常注册模型删除不受影响

## 3. Tauri：save_text_file 目录白名单

- [x] 3.1 `main.rs` 实现允许清单：系统下载目录、app/backend 数据目录、对话框记录目录；`pick_export_directory`/`pick_model_storage_directory` 返回后追加记录到 app config 下 `allowed-save-dirs.json`（读失败按空清单）
- [x] 3.2 `save_text_file` 校验 `directory`（resolve 后相等或后代），拒绝时明确报错；文件名净化与 unique 逻辑不变
- [x] 3.3 Rust 单测：允许（下载目录/记录目录/数据目录）与拒绝（`~/Library/LaunchAgents` 类任意目录）路径

## 4. Tauri：open_file_location reveal-only

- [x] 4.1 文件 → 打开父目录（保留）；目录 → `.app`/`.framework`/`.bundle`/`.plugin` 结尾拒绝，其余打开
- [x] 4.2 Rust 单测：bundle 拒绝、普通文件/目录放行、不存在路径报错

## 5. Tauri：移除 JS shell-open

- [x] 5.1 `capabilities/default.json` 删除 `shell:allow-open`
- [x] 5.2 确认 `app/src` 无 plugin-shell JS 使用（grep 留证），cargo 测试通过，关于/更新中心打开链接功能不回归

## 6. 收尾

- [x] 6.1 文档：`docs/docker.md` 或 README 补 `ASRBOX_MCP_ALLOWED_ROOTS` 说明；release note 说明导出目录白名单的一次性重选行为
- [x] 6.2 `npm run test:backend` 聚焦用例 + `cargo test` + `npm run typecheck`
- [x] 6.3 `openspec validate --changes harden-privileged-boundaries` 通过，勾选全部任务后归档
