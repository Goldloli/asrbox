# 设计：Windows 桌面支持（windows-desktop-support）

## Context

动机见 `proposal.md`。以下现状约束了实现路径：

- **测试现状**（Windows 11 + Python 3.14 实测）：`pytest backend/tests` = 412 通过 / 13 失败 / 1 跳过。失败分布：
  - `test_ffmpeg_tools.py` ×3（`test_manual_path_wins_over_bundled_and_system`、`test_bundled_path_wins_over_system_without_manual`、`test_invalid_bundled_path_falls_back_to_system`）：测试用假 ffmpeg 可执行文件验证 `backend/services/ffmpeg_tools.py` 的解析优先级；Windows 无可执行位语义且需要 `.exe` 后缀。
  - `test_model_storage.py` ×2（`test_candidate_rejects_symbolic_link_*`）：Windows 创建符号链接需要 Developer Mode / 管理员权限（`OSError: WinError 1314`）。
  - `test_translation_execution.py` ×2（`test_real_http_total_deadline_releases_connection_and_next_request[*]`）：测试假 HTTP 服务器向已断连 socket 写数据，Windows 抛 `ConnectionAbortedError: WinError 10053`（POSIX 为 `BrokenPipeError`）。
  - `test_api.py` ×6：本地任务进程管理（`os.kill`/`SIGTERM`/进程组语义在 Windows 不同）、`used_bytes` 统计（`directory_size` 跳过符号链接而测试模型目录基于符号链接）、ffmpeg 存在性依赖。
- **构建脚本已预留 Windows 分支**：`scripts/build-server.sh` 的 `x86_64-pc-windows-msvc` case 已指向 `third_party/ffmpeg/win32-x64` 并处理 `.exe` 后缀，但 vendored 二进制不存在。
- **venv 路径差异**：npm scripts 与 `scripts/*.sh` 硬编码 `.venv/bin/python`；Windows venv 是 `.venv/Scripts/python.exe`。这是构建链路在 Windows 上失败的第一根因。
- **ffmpeg 合规机制**：`third_party/ffmpeg/`（`SOURCE.md` + `checksums.sha256` + `LICENSE.GPLv3`）+ `scripts/verify-third-party.sh`（硬编码 darwin-arm64/martin-riedl 8.1.2）+ `scripts/prepare-ffmpeg-source.sh`（产出 GPL 源码提供包 `ASRbox-ffmpeg-source-8.1.2.tar.gz`）+ `scripts/verify-release-assets.sh`（硬编码 DMG + 2 行 SHA256SUMS）。
- **发布流水线**：`.github/workflows/release.yml` = `docker` job（验证）→ `macos-arm64` job（全部门禁 + `npm run build:desktop` + 资产校验 + `softprops/action-gh-release` 发布）。
- **Tauri sidecar**：`tauri/src-tauri/src/main.rs` 已有 `cfg!(windows)` 分支（`asrbox-server.exe`、`ffmpeg.exe`），但 debug 分支硬编码 `.venv/bin/python`（`main.rs:149`）；`update.rs` 的 `is_expected_asset`/`is_expected_asset_for_version`（`update.rs:807-826`）硬编码 `ASRbox_{version}_aarch64.dmg`，Windows 上恒为 `false`。
- **版本面**：`scripts/check-versions.mjs` 是版本一致性的权威清单（13+ 个文件），其中 release notes 校验硬编码要求包含 `ASRbox_{version}_aarch64.dmg`。

## Goals / Non-Goals

**Goals:**
- Windows 上 `npm run test:backend` 全绿（13 个失败清零），且不改变 macOS/Linux 上的测试语义与生产行为。
- Windows 本地 `npm run build:desktop` 产出 NSIS 安装器（`ASRbox_<version>_x64-setup.exe`）。
- `release.yml` 增加 Windows job，与 macOS job 并行产出并发布到同一 GitHub Release；`ci.yml` 增加 Windows 后端回归 job。
- Windows ffmpeg/ffprobe vendored（gyan.dev GPL 构建），合规记录（来源、校验和、许可证、源码提供）与 macOS 对齐。
- 桌面更新器在 Windows 上识别并下载 NSIS 安装器，校验流程与 macOS 一致。

**Non-Goals:**
- 不做代码签名 / Authenticode / 公证（与 macOS 现状一致，文档如实披露）。
- 不做 Windows arm64、MSI、便携版、Microsoft Store 发布。
- 不改变任何后端 API contract、持久化数据格式、事件类型。
- 不改变 macOS 构建产物形态与既有 CI job 语义。
- 不做 Tauri 自动更新器（安装保持手动，见 `about-update-management`）。

## Decisions

### D1：测试修复——平台分支测试助手，而非放宽断言
逐类处理（详见 tasks）：
- **ffmpeg_tools ×3**：把测试中构造假 ffmpeg 的逻辑抽成平台感知 helper——Windows 下生成 `.exe` 副本（可用系统 `whoami.exe` 等真实 PE 文件冒充，或按 `ffmpeg_tools.py` 的可执行判定逻辑适配）；断言保持解析优先级语义不变。
- **symlink ×2**：探测式跳过——helper 尝试 `os.symlink`，`OSError`（WinError 1314）时 `pytest.skip`（Windows 无权限环境）；macOS/Linux CI 不受影响（原断言照常执行）。备选：要求开发者模式——否决，因为 GitHub Windows runner 与多数开发机默认无此权限，跳过比环境硬要求更诚实（spec 的"证据与承诺分离"原则）。
- **translation socket ×2**：假服务器写路径捕获 `ConnectionAbortedError`（Windows）与 `BrokenPipeError`（POSIX）两种断连错误。
- **test_api ×6**：实现时逐个诊断；预期方向——进程终止用 `Popen.terminate()`/`taskkill` 语义替代 `SIGKILL` 假设；时序断言放宽为文档化预算（遵循主 spec `release-readiness` 的 "Bounded cold-start verification" 精神）；`used_bytes` 用例改用在模型目录直接落真实文件而非依赖符号链接布局（保持断言 `> 0` 的语义）。
- 红线：绝不删除/重写断言语义来让测试通过；只修平台假设。

### D2：venv python 解析——单一 Node 助手 `scripts/venv-python.mjs`
- npm scripts 中所有 `.venv/bin/python` 改为 `node scripts/venv-python.mjs ...`（内部按 `process.platform` 解析 `.venv/Scripts/python.exe` 或 `.venv/bin/python`，透传参数与退出码）。
- `scripts/*.sh`（build-server.sh、check-open-source-readiness.sh 等）在脚本内 `case "$OSTYPE"`/`uname` 选择 `Scripts/python.exe` 或 `bin/python`。
- 备选：全部改写为 Python 脚本——否决，改动面太大；备选：环境变量——否决，CI 与本地需要零配置。

### D2b：Windows 独立 Python 3.14 + 依赖快照 `requirements-windows.lock`（实施修正）
实施中发现 macOS 的 `requirements-runtime.lock` 不能直接用于 Windows：
- `mlx`/`mlx-metal`/`mlx-whisper` 无 Windows 构建（lock 中为三者加 `sys_platform == "darwin"` 标记，`.in` 同步；pip 在 Windows 上跳过，macOS 行为不变）。
- `funasr==1.3.14`（macOS 锁快照）声明依赖 `editdistance>=0.5.2`，而 editdistance 0.8.1 无 cp313+ Windows 预编译 wheel、sdist 在 MSVC 下编译失败（Cython 3 生成的 C++ 需 C++17），不能简单加标记排除——显式排除会让 pip 转而按 funasr 元数据重新拉取它。

Python 版本经实测定为 **Windows=3.14、macOS 维持 3.13**（CI/release 以独立 `PYTHON_VERSION_WINDOWS` 环境变量表达）：
- 探针实证 asyncio proactor 污染：Windows 上 3.11 与 3.13 在 `asyncio.run` 内取消进行中的流式 httpx 请求后，后续请求的 connect 挂起（服务器侧约 3.5 秒才看到断开）；3.14 无此问题，服务器立刻收到 `ConnectionAbortedError`、后续请求正常。该场景对应生产中的 LLM 流式超时路径（chat/校对/翻译），属生产级风险，故不为"与 macOS 同版本"的形式一致性接受 3.13。
- 3.11  additionally 被依赖排除：`scipy==1.18.0` 要求 ≥3.12、`audioop-lts==0.2.2` 要求 ≥3.13（已为后者加 `python_version >= "3.13"` 标记，`.in` 同步）。

因此 Windows 采用独立快照 `requirements-windows.lock`（runtime+dev 合一）：在 Windows + Python 3.14 重建 venv、全量后端测试通过（423 passed / 2 skipped，skipped 为无权限 symlink 探测）后 `pip freeze` 生成。与 macOS 快照的已知差异（funasr 1.4.15 vs 1.3.14、numpy 2.5.3、onnxruntime 1.29.0、modelscope 1.40.0 等）如实记录在 lock 头部与发布说明；Docker 锁（Linux CPU）本就不含 editdistance 且 funasr 路径工作正常，证明所用模型路径不依赖它；transformers 与 macOS 锁保持同一 git commit。
- `requirements-build-windows.lock` = `-r requirements-windows.lock` + PyInstaller 固定版本；Windows 打包与 CI/release Windows job 使用该组合。
- 备选：升级 macOS 锁中的 funasr 统一两平台——否决，主平台模型运行时变更超出本 change 范围；备选：Windows 侧现场解析 `.in` 不锁定——否决，CI 需要可复现依赖集；备选：Windows 用 3.13/3.11 与 macOS 对齐——否决，proactor 污染实证（见上）。

### D3：Windows ffmpeg——gyan.dev release full 构建（GPLv3）
- vendor 到 `third_party/ffmpeg/win32-x64/ffmpeg.exe` + `ffprobe.exe`；`checksums.sha256`、`SOURCE.md`、README、THIRD_PARTY_NOTICES 同步记录（gyan.dev 构建页 URL、确切版本、zip SHA-256、构建脚本仓库 https://github.com/GyanD/codexffmpeg）。
- `prepare-ffmpeg-source.sh` 扩展为产出覆盖两个平台的源码提供包（ffmpeg 源码 tarball + martin-riedl 构建脚本 + codexffmpeg 构建脚本快照）；源码包命名去版本硬编码或按 ffmpeg 版本参数化。
- `verify-third-party.sh` 平台化：按当前平台校验对应目录；CI 各 job 校验自己平台的二进制。
- 备选：martin-riedl.de——否决，只提供 macOS/Linux；BtbN——备选可用但 gyan.dev 是 Windows 生态最常见来源且构建脚本公开。
- 版本尽量对齐 8.1.2；若 gyan.dev 无 8.1.2 构建，锁定其最新 8.x release 并在 SOURCE.md 如实记录差异（两个平台 ffmpeg 小版本可以不同，校验脚本按平台断言各自版本）。

### D4：Tauri 打包——`bundle.targets` 显式列出 `["dmg", "nsis"]`
- Tauri v2 会跳过当前平台不适用的 target，因此单配置即可让 macOS 出 DMG、Windows 出 NSIS，无需平台分支脚本。
- `tauri.conf.json` 增加 `bundle.windows` 配置（NSIS 安装模式、图标复用 `icon.ico`）。
- `main.rs:149` debug sidecar 的 `.venv/bin/python` 改为平台感知（Windows: `.venv/Scripts/python.exe`）。
- 备选：CI 里 `--bundles nsis` CLI 参数——否决，会让本地与 CI 构建配置分裂。

### D5：更新器 Windows 资产匹配
- `update.rs`：`is_expected_asset`/`is_expected_asset_for_version` 增加 Windows 分支，期望 `ASRbox_{version}_x64-setup.exe`（Tauri NSIS 默认命名）；`installer_kind()` 加 `"nsis"`；打开安装器走既有 `shell.open` 路径（NSIS exe 可直接执行）；关于页的安装指引文案平台化（macOS Gatekeeper / Windows SmartScreen）。
- 前端如需区分安装器类型，使用既有 typed client + 平台字段，不新增 contract 字段除非必要；若新增响应字段必须声明进 `response_model` 并加 API 测试断言（AGENTS.md 不变量）。

### D6：CI/CD 扩展
- `ci.yml`：新增 `backend-windows` job（`windows-latest`：setup-python + 安装 `requirements-dev.lock` + `pytest backend/tests`），只跑后端测试，不跑 e2e/cargo（控制 runner 分钟数与时长）。
- `release.yml`：新增 `windows-x64` job（`windows-latest`），复用 macOS job 的门禁序列中适用部分（typecheck/单元测试/后端测试/e2e 在 macOS 已跑过，Windows job 聚焦：后端测试 + `build:desktop` + NSIS 资产 + 资产校验），产出上传到同一 Release。GitHub runner 的 bash 为 Git Bash，`build-server.sh` 可直接运行；venv 差异由 D2 解决。
- `verify-release-assets.sh`：泛化为"每个目标平台恰好一个安装包"（DMG ×1 + NSIS ×1），SHA256SUMS 行数 = 安装包数 + 1（源码包）。
- `check-versions.mjs`：release notes 校验从"包含 DMG 名"扩展为"包含 DMG 名与 NSIS 名"。
- 备选：矩阵化单个 job——否决，macOS job 步骤与 Windows 差异大（MLX 参数、bash 细节、资产收集），显式两个 job 更清晰且互不影响发布。

### D7：版本 0.1.9 bump
- 按 `scripts/check-versions.mjs` 的权威清单逐面更新 + `CHANGELOG.md` + `docs/releases/v0.1.9.md`（列出两个安装包资产名，满足 D6 的校验扩展）。

## Risks / Trade-offs

- [gyan.dev 下载可用性/带宽，zip ~80-150MB] → 用代理下载；checksums.sha256 锁定内容；若长期不可用，按 SOURCE.md 的应急流程 vendored 源码后重新评估来源。
- [Windows runner 分钟消耗约为 Linux 的 2 倍] → Windows CI job 只跑后端 pytest；e2e/前端门禁保持在 macOS。
- [NSIS 首次构建需下载 NSIS 工具链，可能被网络阻断] → 本地与 CI 均配置代理/镜像；失败时重试，不静默跳过打包。
- [符号链接测试在 Windows 跳过会降低该路径在 Windows 的保障] → 生产代码的 `is_symlink()` 防御在 Windows 上仍生效（`directory_size` 等路径保留检查）；跳过仅限"创建符号链接"这一测试搭建动作，并在 skip reason 中说明。
- [gyan.dev 与 martin-riedl 的 ffmpeg 版本可能不一致] → 校验脚本按平台断言各自版本；README/SOURCE.md 如实披露；功能上仅依赖稳定的命令行接口（`-version`、抽音频），跨小版本兼容。
- [Windows 上 PyInstaller 打包体积/杀毒误报] → 发布说明披露未签名与可能的 SmartScreen/杀毒提示（符合 release-readiness 的诚实定位要求）。

## Migration Plan

1. 分支 `windows-support` 上按 tasks.md 实施；每个任务完成后跑对应聚焦测试。
2. 合并前门禁：`npm run check:open-source`（本地 Windows）、macOS 侧由 CI 既有 job 验证不回归。
3. 合并到 main 后打 `v0.1.9` tag 触发 release.yml，同时产出 macOS DMG 与 Windows NSIS。
4. 回滚：发布产物问题可删除 GitHub Release 与 tag；代码问题 revert 合并提交。数据库/持久化格式无变更，无数据迁移风险。

## Open Questions

- gyan.dev 当前 release 构建的确切 ffmpeg 版本号（实施 D3 时以其 builds 页面为准并锁定校验和）。
- Windows runner 上 `os.symlink` 是否可用（GitHub `windows-latest` 默认策略）——若可用，D1 的探测式 skip 在 CI 上会自动转为真实执行，无需额外处理。
