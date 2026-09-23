# fix-windows-upgrade-stale-resources

## 为什么

Windows x64 的 NSIS 安装包在升级时是"就地覆盖"：新版本包含的文件会被写入，而**上一版本包含、新版本已不再包含的文件会留在安装目录**（`tauri/src-tauri/target/release/nsis/x64/installer.nsi` 只在卸载段逐项删除资源，安装段不做清理）。PyInstaller 的 onedir 布局对这个差异很敏感——残留的 `<dist>-<旧版本>.dist-info` 会让 `importlib.metadata.version()` 继续报告旧版本号。

0.3.2 把 transformers 从 git pin（内容等于 v5.13.0）升到 5.17.0 后，transformers 在导入时会校验 `tokenizers>=0.23.1,<0.24.0`。从 0.3.1 升级上来的安装目录同时存在 `tokenizers-0.22.2.dist-info`（0.3.1 遗留）与 `tokenizers-0.23.2.dist-info`（0.3.2 新增），元数据解析先命中旧目录，于是 **qwen3-asr、moss-transcribe-diarize、granite、cohere、ark、voxtral 全部 speech-LM 模型在升级后的打包应用里都无法导入**，转写直接失败并给出底层 ImportError。

实测证据（2026-09-23，Windows 11 + Python 3.14 打包应用）：升级安装后 `GET /runtime/health-report` 返回 `granite_speech_available=false`、`cohere_asr_available=false`、`voxtral_available=false`、`transformers_qwen3_asr_available=false`，`warnings` 为 `ImportError: tokenizers>=0.23.1,<0.24.0 is required ..., but found tokenizers==0.22.2`；三处 `tokenizers/tokenizers.pyd` 的 SHA-256 完全一致，差异只在元数据目录。全新安装无该残留在先，因此这是一个只出现在升级路径上的发布缺陷，0.3.2 已发布，需要随修复提供给升级用户。

## 变更内容

- Windows NSIS 安装包新增 preinstall hook（新增 `tauri/src-tauri/installer-hooks.nsh`，经 `tauri.conf.json` 的 `bundle.windows.nsis.installerHooks` 接入）：在复制文件前删除安装器自行管理的资源树 `$INSTDIR\binaries`，使升级结果与全新安装一致。
- 清理范围仅限安装器管理的目录：模型、数据库、上传、导出与 CUDA 加速套件都位于应用数据目录，不受影响。
- 不改变应用运行时行为、后端 API、前端表现与依赖锁；对全新安装而言 hook 是无操作。
- 验证方式：在带有旧版本残留文件的安装目录上安装新安装包，断言残留文件被清除、安装树与 `dist/asrbox-server` 构建产物逐文件一致（无缺失、无尺寸差异）、打包应用 `health-report` 中 speech-LM 探测器恢复为 `true`。

## 能力（Capabilities）

### 新增能力

- 无

### 修改的能力

- `release-readiness`: 新增"Windows 安装包升级一致性"要求——升级安装必须清除上一版本遗留且新版本不再提供的安装器管理文件，使升级后的安装树与全新安装一致，且不得影响应用数据目录中的用户数据。

## 影响

- 打包：`tauri/src-tauri/installer-hooks.nsh`（新增）、`tauri/src-tauri/tauri.conf.json`。
- 发布：仅影响 Windows x64 NSIS 安装包的升级路径；macOS DMG 不使用该 hook。
- 文档：`docs/ci.md` 的发布说明与本次修复相关时可补充一句安装器升级行为；不改变依赖锁、API、持久化数据与模型元数据。
