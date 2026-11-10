# Granite Speech 5.0 2B Windows x64 验收记录

- 日期：2026-11-10（Asia/Shanghai）
- 变更：`prepare-v0-4-1`（task 4.4）
- 平台：Windows 11 企业版 10.0.22631 x64；Intel Core i9-9900K；31.9 GB 内存；NVIDIA GeForce RTX 2060 SUPER 8 GB（驱动 560.94 / CUDA 12.6，本记录只使用 CPU 路径，CUDA 见独立记录）
- 运行时：仓库 `.venv`（Python 3.14.7、`torch 2.11.0+cpu`、`transformers 5.17.0`）；PyInstaller 6.21.0；Tauri CLI 2.11.4
- 构建：`bash scripts/build-server.sh` → `dist/asrbox-server/`（1,088,374,072 字节、7,429 文件）；`bun run --cwd tauri build` → `ASRbox_0.4.1_x64-setup.exe`（455,879,544 字节）
- 安装：NSIS currentUser 覆盖安装到 `%LOCALAPPDATA%\ASRbox`；升级路径为既有 `0.3.2` → `0.4.0` → `0.4.1`，全程同一安装目录
- 说明：GUI 窗口交互未自动化。安装版条目使用**安装目录内同一 sidecar 二进制**加真实应用数据目录（`--data-dir %APPDATA%\com.goldloli.asrbox`）启动验证，没有用源码运行替代冻结产物。

## 验收步骤与结果

1. **冻结候选构建**：PyInstaller onedir 构建成功；`bun run --cwd tauri build` 生成 434.8 MB NSIS 安装包，`asrbox.exe` 产物版本 0.4.1。
2. **运行时探针**（`asrbox-server.exe --runtime-check all`）：
   - 构建产物 `dist/asrbox-server/asrbox-server.exe`：`granite_speech_available=true`、`granite_speech_plus_available=true`、`funasr_available=true`、`transformers_qwen3_asr_available=true`、`torch_available=true`、`torch_cuda_available=false`。
   - 安装目录 `%LOCALAPPDATA%\ASRbox\binaries\asrbox-server\asrbox-server.exe`：结果一致，`--version` 输出 `0.4.1`。
3. **目录条目可见**：安装版 backend `GET /models/status` 返回 26 个本地条目，其中 `granite-speech-5.0-2b` 显示名为 `Granite Speech 5.0 2B`、`languages=[en,fr,de,es,pt,ja]`、`supported_devices=[cpu,cuda]`、`supports_timestamps=false`、`downloaded=true`、`installed_source=modelscope`、`installed_repo_id=ibm-granite/granite-speech-5.0-2b`、`size_on_disk_mb=4816.6`。`compatible` 在该目录请求中为 `null`（目录渲染不触发重依赖导入），实际能力由第 2 步探针与第 4 步真实转写确认。
4. **真实转写（冻结 backend 完整 HTTP 路径）**：25.3 秒英文语音，`POST /transcriptions`（本地模型、六种导出）。
   - 构建产物 sidecar：`completed`，503.0 秒，390 字符、5 段，六种导出非空。
   - 安装版 sidecar（0.4.1 / CPU）：`completed`，412.2 秒，390 字符、5 段，首段 0.0 s、末段 25.324 s，六种导出非空。
5. **就地升级后的保留**：
   - 基线是既有 0.3.2 安装的真实数据：18 个任务、2,358 个字幕段、18 个字幕版本、120 个分块、330 条任务日志、9 条 schema migration；先在原目录覆盖安装 0.4.0，再覆盖安装 0.4.1。
   - 三个状态的表行数完全一致（`transcription_tasks`、`transcript_segments`、`transcript_versions`、`transcription_chunks`、`task_logs`、`schema_migrations`、`asr_settings` 等全部相同）。
   - 逐行内容比对（升级后 vs 升级前备份）：18 个任务、2,358 个字幕段、18 个字幕版本全部逐行相同（缺失 0、变更 0）；`asr_settings` 行为同一哈希，`default_model_name` 仍为 `whisper-base`。
   - 升级后新出现的 3 个任务来自本次验收的转写调用（5.0 CPU、5.0 CUDA、4.1 CPU），不是升级产生的数据改动。
   - 10 个已下载模型目录的（文件数、字节数、最新 mtime）完全一致：升级未触发重新下载或迁移。
   - 旧模型升级后可直用：`granite-speech-4.1-2b` 在安装版 backend 完成 25.3 秒转写（403.7 秒，391 字符、5 段、六种导出）。
   - 版本一致：`asrbox.exe` 的 FileVersion/ProductVersion 均为 0.4.1，注册表 `DisplayVersion` 为 0.4.1，sidecar `--version` 为 0.4.1。
6. **安装目录无旧依赖残留**：把安装后的 `binaries\asrbox-server` 与本次新建产物按（相对路径、字节数）清单比对：
   - 字节总数相同（1,088,374,072 = 1,088,374,072）；
   - 安装树 7,430 文件 vs 构建树 7,429 文件，唯一差异是构建脚本写入的 `.gitkeep`；
   - 无大小不一致项，抽样的 15 个文件 SHA-256 无差异。
   - 与设计一致：`installer-hooks.nsh` 的 `NSIS_HOOK_PREINSTALL` 在复制前执行 `RMDir /r "$INSTDIR\binaries"`，对应 `docs/release.md` 第 12 项的"安装器替换资源目录、无旧依赖残留"。

结构化结果：`backend/real_tests/results/asrbox-granite-speech-5.0-windows-verification-20261110.json`
CUDA 记录：`backend/real_tests/results/granite-speech-5.0-cuda-verification-20261110.md`
源码真实模型记录：`backend/real_tests/results/asrbox-granite-speech-5.0-verification-20261109.md`

## 本轮命令与结果

| 命令 / 操作 | 结果 |
| --- | --- |
| `npm run test:backend` | 619 passed, 2 skipped（424.7 s） |
| `npm run test:backend:contract` | 12 passed |
| `npm run test:backend:binary-smoke`（`ASRBOX_BINARY_SMOKE=1`，对 `dist/asrbox-server`） | 1 passed（49.3 s） |
| `bash scripts/build-server.sh` | 成功，onedir 1.04 GB |
| `bun run --cwd tauri build` | 成功，生成 434.8 MB NSIS 安装包 |
| `ASRbox_0.4.0_x64-setup.exe /S`（覆盖既有 0.3.2） | 成功，`DisplayVersion=0.4.0` |
| `ASRbox_0.4.1_x64-setup.exe /S`（同目录覆盖） | 成功，`DisplayVersion=0.4.1` |
| 安装版 sidecar `--runtime-check all` | `granite_speech_available=true` |
| 安装版 `POST /transcriptions`（5.0，CPU） | completed，412.2 s / 390 字符 / 5 段 |
| 安装版 `POST /transcriptions`（4.1，CPU） | completed，403.7 s / 391 字符 / 5 段 |

## 未覆盖与限制

- GUI 交互（窗口操作、模型页下载按钮、显卡加速开关）未自动化；安装版验证使用安装目录内的 sidecar 二进制与真实数据目录。
- 验收音频为本机 TTS 合成的英文语音（未入仓），不是真人录音；质量结论不适用，只证明路径可用。
- Windows CPU 长音频（>120 s）未单独复测；120 s 分块与尾部覆盖在 CUDA 记录中以 150 秒音频覆盖（分块策略与设备无关）。
- 安装包未签名、SmartScreen 提示流程未纳入；`npm run test:docker`、双平台 CI、冻结 smoke 与候选产物校验属 task 6.2，本记录不宣称发布就绪。
- 本记录不替代 macOS 冻结记录与 CUDA 记录。
