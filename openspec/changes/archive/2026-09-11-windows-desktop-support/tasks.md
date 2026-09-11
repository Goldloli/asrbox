# 任务：Windows 桌面支持（windows-desktop-support）

## 1. 后端测试 Windows 兼容修复（13 个失败清零）

- [x] 1.1 诊断并修复 `test_ffmpeg_tools.py` ×3：平台感知的假 ffmpeg 构造（Windows 用真实 `.exe` 副本），保持解析优先级断言语义
- [x] 1.2 修复 `test_model_storage.py` ×2：符号链接创建探测式 skip（`OSError`/`WinError 1314` → `pytest.skip`），POSIX 路径行为不变
- [x] 1.3 修复 `test_translation_execution.py` ×2：假 HTTP 服务器写路径同时捕获 `ConnectionAbortedError` 与 `BrokenPipeError`
- [x] 1.4 诊断并修复 `test_api.py` ×6（预处理、本地队列并发×2、取消运行中进程、就绪状态、模型存储清理）：进程终止/时序/used_bytes 的平台适配，不删改断言语义
- [x] 1.5 Windows 全量回归：`pytest backend/tests` 全绿（0 失败），并记录跳过项
- [x] 1.6 对照验证 macOS 语义不受影响：逐 diff 审阅测试改动仅为平台分支/skip/错误类型兼容

## 2. 构建链路跨平台化

- [x] 2.1 新增 `scripts/venv-python.mjs`：跨平台解析 `.venv/Scripts/python.exe` 或 `.venv/bin/python`，透传参数与退出码
- [x] 2.2 `package.json` 所有 `.venv/bin/python` 引用改为 `node scripts/venv-python.mjs`
- [x] 2.3 `scripts/build-server.sh`、`scripts/check-open-source-readiness.sh` 等 shell 脚本内部按平台选择 venv python 路径
- [x] 2.4 Windows 本地验证：`npm run test:backend`、`npm run check:versions`、`npm run test:release-tools` 可直接运行
- [x] 2.5 Playwright 配置跨平台：确认 `playwright.config.ts` 在 Windows 下可跑 `test:e2e:maintained`（webServer 命令/路径分隔符适配）

## 3. vendor Windows ffmpeg（gyan.dev GPL）

- [x] 3.1 通过代理从 gyan.dev 下载 release full 构建 zip，解压出 `ffmpeg.exe`/`ffprobe.exe` 至 `third_party/ffmpeg/win32-x64/`
- [x] 3.2 记录 zip 与二进制的 SHA-256 到 `third_party/ffmpeg/checksums.sha256`；`SOURCE.md` 增加 Windows 来源段落（构建页、版本、构建脚本仓库）
- [x] 3.3 `scripts/verify-third-party.sh` 平台化：按当前平台校验对应二进制、版本串、GPL 标记
- [x] 3.4 `scripts/prepare-ffmpeg-source.sh` 扩展：源码提供包覆盖 ffmpeg 源码 + 两个平台的构建脚本快照，校验逻辑同步
- [x] 3.5 `THIRD_PARTY_NOTICES.md` 与 README 下载/许可说明同步 Windows ffmpeg
- [x] 3.6 验证：`npm run verify:third-party` 在 Windows 通过；`npm run test:backend` 带上 Windows ffmpeg 环境变量后相关用例使用 vendored 二进制

## 4. Tauri Windows 适配

- [x] 4.1 `tauri.conf.json`：`bundle.targets` 改为 `["dmg", "nsis"]`，新增 `bundle.windows` NSIS 配置，确认图标含 `icon.ico`
- [x] 4.2 `tauri/src-tauri/src/main.rs`：debug 分支 sidecar python 路径平台感知（`.venv/Scripts/python.exe`）
- [x] 4.3 `tauri/src-tauri/src/update.rs`：Windows 资产匹配 `ASRbox_{version}_x64-setup.exe`、`installer_kind()` 增加 `"nsis"`、安装指引文案平台化（SmartScreen）
- [x] 4.4 前端关于页如需区分安装器类型：走 typed client + 既有平台字段；若新增响应字段必须声明进 `response_model` 并加 API 测试
- [x] 4.5 `cargo check --locked` + `cargo test --locked` 在 Windows 通过（含 update.rs 新测试：Windows 资产名匹配/拒绝）
- [x] 4.6 `bun run dev:desktop` 在 Windows 开发模式可启动并连接后端
- [x] 4.7 修复 `backend/server.py` `_pid_alive`：Windows 上 `os.kill(pid, 0)` 不是存活探针（WinError 87）导致 parent 看门狗误杀 sidecar（"server exited before it became healthy"）；改用 `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)` + `GetExitCodeProcess` 判活，POSIX 分支不变；补 `test_pid_alive_detects_live_and_exited_processes` 回归测试

## 5. CI/CD Windows 扩展

- [x] 5.1 `ci.yml`：新增 `backend-windows` job（windows-latest + setup-python `PYTHON_VERSION_WINDOWS`=3.14 + `requirements-windows.lock` + pytest）
- [x] 5.2 `release.yml`：新增 `windows-x64` job（后端测试 + `npm run build:desktop` + NSIS 资产收集 + 校验），与 macOS job 并行构建、由 publish job 合并校验后发布到同一 Release
- [x] 5.3 `scripts/verify-release-assets.sh` 泛化：DMG ×1 + NSIS ×1 + 源码包 + SHA256SUMS 行数匹配
- [x] 5.4 `scripts/check-versions.mjs`：release notes 校验同时要求 `ASRbox_{v}_aarch64.dmg` 与 `ASRbox_{v}_x64-setup.exe`
- [x] 5.5 更新 `scripts/check-workflow-gates.test.mjs` 等受影响的工作流门禁测试并跑 `npm run test:release-tools`
- [x] 5.6 Windows 依赖快照：新增 `requirements-windows.lock`（runtime+dev，`pip freeze` 自通过全量测试的 Windows + Python 3.14 环境——proactor 污染实证否决 3.13/3.11，见 design D2b）与 `requirements-build-windows.lock`（+ PyInstaller）；lock 头部记录与 macOS 快照的已知差异；MLX 三元组在 `requirements-runtime.lock`/`.in` 加 `darwin` 标记，`audioop-lts` 加 `python_version >= "3.13"` 标记；CI/release 的 Windows job 使用独立 `PYTHON_VERSION_WINDOWS: "3.14"`

## 6. 版本 0.1.9 与文档

- [x] 6.1 按 `check-versions.mjs` 清单 bump 所有版本面到 0.1.9（package.json×4、tauri.conf.json、Cargo.toml+Cargo.lock、backend/__init__.py、Dockerfile、compose.yaml、.env.example、bun.lock）
- [x] 6.2 新增 `docs/releases/v0.1.9.md`（同时列出 DMG 与 NSIS 资产名），更新 `CHANGELOG.md`
- [x] 6.3 更新 `README.md`/`README.en.md`/`docs/release.md`：Windows x64 成为受支持桌面目标、未签名/SmartScreen 披露、Windows 开发命令
- [x] 6.4 `npm run check:versions` 通过

## 7. 本地打包与全量验证

- [x] 7.1 本地 `npm run build:desktop` 产出 `ASRbox_0.1.9_x64-setup.exe`
- [x] 7.2 安装并冒烟：启动、后端健康、转写一个测试音视频文件、导出字幕（已由自动化 E2E 全覆盖：NSIS 静默安装 → /health → whisper-base 转写 90s 片段 → SRT 导出校验，CPU/GPU 两轮）
- [x] 7.3 `npm run check:open-source` 全量通过
- [x] 7.4 归档前对齐：`openspec validate --changes windows-desktop-support` 通过，spec/代码/文档一致
- [x] 7.5 消除 Windows 桌面端控制台窗口闪现：主程序 release 构建补 `windows_subsystem = "windows"`（GUI 子系统，截图黑窗口的实际根因），后端全部子进程（runtime probe、转写 worker、ffmpeg/ffprobe、GPU 探测）统一 `CREATE_NO_WINDOW`（新增 `backend/services/process_utils.py`）；重建安装后验证：安装版 asrbox.exe Subsystem=2、运行中 conhost 子进程为 0、启动与转写全程无窗口
