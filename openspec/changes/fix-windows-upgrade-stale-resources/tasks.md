# fix-windows-upgrade-stale-resources — 任务

## 1. 安装器清理

- [x] 1.1 新增 `tauri/src-tauri/installer-hooks.nsh`：`NSIS_HOOK_PREINSTALL` 中先执行既有的运行中实例检查（`CheckIfAppIsRunning`），再 `RMDir /r "$INSTDIR\binaries"`，只清理安装器管理的资源树
- [x] 1.2 在 `tauri/src-tauri/tauri.conf.json` 的 `bundle.windows.nsis.installerHooks` 接入该文件
- [x] 1.3 重新构建 Windows 安装包（`bun run build:desktop`），确认生成的 `installer.nsi` 在 `Section Install` 中插入了 preinstall hook（`!include` 于第 31 行，`!insertmacro` 于第 634 行，先于 `File` 复制）

## 2. 升级路径验证

- [x] 2.1 在已安装目录中构造上一版本残留（重建 `_internal/tokenizers-0.22.2.dist-info/` 与一个不属于当前构建的诱饵文件），确认打包应用因此出现 speech-LM 导入失败
- [x] 2.2 用新安装包在同一目录上静默安装，断言残留文件被清除、`_internal` 树与 `dist/asrbox-server` 构建产物逐文件一致（无缺失、无尺寸差异）
- [x] 2.3 启动打包应用，断言 `GET /runtime/health-report` 的 `transformers_qwen3_asr_available`、`granite_speech_available`、`granite_speech_plus_available`、`cohere_asr_available`、`voxtral_available` 均为 `true`
- [x] 2.4 确认升级安装未影响应用数据目录：已下载模型、`asrbox.db`、CUDA 加速套件仍在；并复跑至少一个 speech-LM 模型的真实转写以证明升级后可正常转写

## 3. 文档与校验

- [x] 3.1 文档：`CHANGELOG.md` 的 `[Unreleased]` 增加 Fixed 条目（面向用户），`docs/release.md` 的 Post-Build Verification 增加 Windows 升级安装检查项（面向维护者）
- [x] 3.2 `openspec validate --changes fix-windows-upgrade-stale-resources` 通过

## 验证证据（2026-09-23，Windows 11 + Python 3.14 打包应用）

- 修复前（真实升级场景）：`runtime.health-report` 的 speech-LM 探测器全为 `false`，`warnings` 报 `tokenizers>=0.23.1,<0.24.0 is required ..., but found tokenizers==0.22.2`；venv、构建产物、安装目录三处 `tokenizers/tokenizers.pyd` 的 SHA-256 一致，差异仅在元数据目录。
- 诱饵复现：植入 `tokenizers-0.22.2.dist-info`（3 个文件）与一个已移除模块的文件后，安装树相对构建产物多出 4 项、缺 0 项。
- 修复后安装：同一安装包在诱饵目录上静默安装（exit 0），残留全部清除，安装树与 `dist/asrbox-server` 一致（多出项仅安装器写入的 `.gitkeep`，缺失 0、尺寸差异 0），`asrbox-server.exe` SHA-256 与构建产物相同（`684ED59B517410AD0BD93AC4B72668A70C0858B0DEFF81141328B02BA9E87CAC`）。
- 修复后运行：5 个 speech-LM 探测器全部为 `true`；应用数据保留（10 个模型目录、`asrbox.db`、CUDA 套件）；`cohere-transcribe-2b` 复跑 18 分钟样例得到 136 句段 / 10,722 字符 / 99.3 秒，与升级前同模型结果一致。
