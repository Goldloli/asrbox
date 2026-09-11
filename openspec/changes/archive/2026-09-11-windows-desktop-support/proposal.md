# 提案：Windows 桌面支持（windows-desktop-support）

## Why

当前 ASRbox 的发布与质量保障链路以 macOS Apple Silicon 为唯一受支持桌面平台：CI 仅在 macOS 跑后端与前端测试，`release.yml` 只产出 macOS DMG，`desktop-runtime-security` 与 `release-readiness` 规范也把"仅 macOS 桌面"作为既定边界。

现在需要把 Windows（x64）纳入受支持桌面目标。直接问题（已在 Windows 11 + Python 3.14 环境实测 `pytest backend/tests`：413 通过 / 13 失败 / 1 跳过）：
- 后端测试在 Windows 上有 13 个失败，集中在 `test_api.py`（6 个：预处理、本地队列并发/取消、就绪状态、模型存储清理）、`test_ffmpeg_tools.py`（3 个：手动/内置/回退路径解析）、`test_model_storage.py`（2 个：符号链接拒绝）、`test_translation_execution.py`（2 个：真实 HTTP 超时断连）；根因是平台假设差异（`.exe` 后缀与可执行判定、符号链接权限、Windows socket 断连行为、进程信号语义），无法把 Windows 平台列入受支持 CI；
- `third_party/ffmpeg` 没有 Windows 构建源，Windows 打包无法落地；
- `release.yml` 只构建 macOS DMG，Windows 安装包缺失。

## What Changes

1. **后端测试 Windows 兼容修复（13 个失败用例）**：修复 `backend/tests/test_api.py`（6 个）、`test_ffmpeg_tools.py`（3 个）、`test_model_storage.py`（2 个）、`test_translation_execution.py`（2 个）在 Windows 下的失败。原则是不改变测试语义与生产行为——只修平台相关假设（可执行文件判定、符号链接权限、socket 断连错误类型、进程信号/终止语义、文件锁），不通过删测来"过关"。
2. **构建链路 Windows 适配**：`npm run build:server` / `build:app` / `package` 支持 Windows；`scripts/build_backend.py`、`scripts/build_frontend.py` 保证在 Windows 上可跑；Playwright e2e 跨平台断言策略明确。
3. **FFmpeg Windows 打包**：`scripts/vendor_ffmpeg.py` 支持 Windows x64（采用 gyan.dev 全量构建），同步更新 `third_party/ffmpeg` 来源与许可证说明、README 下载说明。
4. **Tauri Windows 适配**：`tauri.conf.json` 增加 Windows 目标与 NSIS 安装器配置；确认 sidecar（打包的 Python 后端）在 Windows 的启动/停止/健康检查行为；窗口/图标/隐私边界保持与 macOS/Linux 一致。
5. **CI/CD Windows 扩展**：`ci.yml` 增加 Windows 后端单元测试矩阵（`windows-latest`）；`release.yml` 的 build-artifacts 增加 Windows x64 NSIS 构建，发布资产与版本号校验同步覆盖。
6. **版本与文档更新**：版本号升级至 0.1.9；更新 README（中英）、docs/release.md、新增 docs/releases/v0.1.9.md；CHANGELOG 记录 Windows 桌面支持新增。

## Capabilities

### New Capabilities
- （无新 capability；本变更在现有能力上扩展平台范围与发布资产。）

### Modified Capabilities
- `release-readiness`：将"macOS Apple Silicon 为唯一受支持桌面平台"扩展为"macOS Apple Silicon + Windows x64"；发布检查门禁增加 Windows 后端测试与 Windows 安装包产物校验。
- `about-update-management`：更新资产下载/校验要求覆盖 Windows NSIS 安装器；版本检查与更新提示对 Windows 桌面生效。
  （`desktop-runtime-security` 的 requirement 均为平台中立表述，Windows 适配自动落入既有边界，无需 delta。）

## Impact

- **代码**：`backend/tests/*`（平台兼容修复）；`scripts/build_backend.py`、`scripts/build_frontend.py`、`scripts/vendor_ffmpeg.py`，新增 `scripts/build_windows_installer.ps1`；`src-tauri/tauri.conf.json`（Windows bundle 配置）；必要时少量后端路径/子进程处理调整。
- **工作流**：`.github/workflows/ci.yml` 增加 Windows 单元测试 job；`.github/workflows/release.yml` 增加 Windows 构建 job 并产出 NSIS 安装器；`.github/workflows/release-verify.yml` 同步支持。
- **文档**：`README.md`、`README.en.md`、`docs/release.md`、新增 `docs/releases/v0.1.9.md`。
- **依赖**：无新增 npm/Python 运行时依赖；`tauri/src-tauri/Cargo.toml` 版本号更新。
- **版本**：`package.json`、`app/package.json`、`web/package.json`、`tauri/package.json`、`tauri/src-tauri/Cargo.toml`、`backend/__init__.py`、`Dockerfile`、`compose.yaml`、`.env.example`、`bun.lock`、新增 `docs/releases/v0.1.9.md` 统一升级到 0.1.9。
