# fix-windows-upgrade-stale-resources — 设计

## 背景

- `tauri/src-tauri/tauri.conf.json` 的 `bundle.resources` 声明两项安装器管理的资源：`binaries/asrbox-server`（PyInstaller onedir 产物）与 `binaries/ffmpeg`。
- Tauri 生成的 `tauri/src-tauri/target/release/nsis/x64/installer.nsi` 在 `Section Install` 内只做文件复制与注册表写入，`!ifmacrodef NSIS_HOOK_PREINSTALL` 提供了复制前的扩展点（第 631 行）；资源删除只出现在 `Section Uninstall`（第 9623 行起，逐项 `Delete`）。因此升级安装是"就地覆盖"，**上一版本包含、新版本不再包含的文件不会被删除**。
- `dist/asrbox-server/_internal/` 中每个依赖都带 `<dist>-<version>.dist-info` 目录，`importlib.metadata.version()` 依据这些目录回答版本；同名分布存在多个目录时，先命中的目录胜出。
- `backend/backends/local_asr.py` 的 speech-LM adapter（granite / cohere / ark / voxtral / qwen3 / moss 六类）在导入时依赖 transformers 对 tokenizers 的版本校验（`tokenizers>=0.23.1,<0.24.0`）。
- 实测故障（2026-09-23）：从 0.3.1 升级到 0.3.2 的安装目录同时存在 `tokenizers-0.22.2.dist-info`（上一版本遗留）与 `tokenizers-0.23.2.dist-info`；`GET /runtime/health-report` 的 `transformers_qwen3_asr_available`、`granite_speech_available`、`granite_speech_plus_available`、`cohere_asr_available`、`voxtral_available` 全为 `false`，`warnings` 为 `ImportError: tokenizers>=0.23.1,<0.24.0 is required for a normal functioning of this module, but found tokenizers==0.22.2`。清理残留后同样请求全部恢复为 `true`，且 `tokenizers/tokenizers.pyd` 的 SHA-256 在 venv、构建产物与安装目录三处一致——差异只在元数据目录。

## 目标 / 非目标

目标：

- 升级安装后的安装器管理目录与全新安装结果一致，不残留上一版本文件。
- 不触碰应用数据目录中的模型、数据库、上传、导出与 CUDA 加速套件。
- 修复可在本机被验证：构造带残留的安装目录，安装新包，断言残留被清除且安装树与构建产物一致。

非目标：

- 不改变应用运行时行为、后端 API、前端表现与依赖锁。
- 不为已发布的 0.3.2 产物做追溯修改；修复随下一个 Windows 安装包发布。
- 不引入跨平台通用的"清理安装目录"逻辑（macOS DMG 的安装方式不同，不受该缺陷影响）。

## 决策

**D1：用 NSIS preinstall hook 在复制前删除 `$INSTDIR\binaries`。**

hook 内容只有一条 `RMDir /r "$INSTDIR\binaries"`，通过 `tauri.conf.json` 的 `bundle.windows.nsis.installerHooks` 接入。理由：安装器本来就完整拥有该目录（其中所有文件都由 `bundle.resources` 提供），复制前清空即可让升级结果等于全新安装，且不需要修改 Tauri 模板。

备选方案：

- **应用启动时清理重复 dist-info**（拒绝）：需要运行时修改自身安装目录，Program Files 安装方式下没有写权限，并且把发布缺陷转移成运行时逻辑，违反"应用不修改自身安装目录"的既有边界。
- **只删除 `*.dist-info` 残留**（拒绝）：遗漏其它类别的残留（上一版本存在、本版本已删除的模块文件），例如 5.13→5.17 之间被移除的 transformers 子模块，属于治标不治本。
- **让 PyInstaller 不打包 dist-info**（拒绝）：`importlib.metadata` 的版本查询会被破坏，部分库依赖它；也无法清掉用户机器上已经存在的历史残留。
- **维护自定义 `installer.nsi` 模板**（拒绝）：需要跟随 Tauri 模板演进，维护成本远高于 hook。

**D2：保留全新安装路径的无操作语义。** `RMDir /r` 对不存在的目录不会中止脚本，全新安装行为不变。

**D3：清理范围限定在 `$INSTDIR\binaries`。** 安装目录内其余内容只有 `asrbox.exe` 与 `uninstall.exe`，二者由安装器直接覆盖；应用数据全部位于应用数据目录（`%APPDATA%\com.goldloli.asrbox`），不进入安装目录。

**D4：hook 内先执行运行中实例检查，再做删除。** Tauri 的 `CheckIfAppIsRunning` 宏插入点在 `NSIS_HOOK_PREINSTALL` 之后（生成的 `installer.nsi` 中先 `!insertmacro NSIS_HOOK_PREINSTALL`，再 `!insertmacro CheckIfAppIsRunning`）。若不先行检查，用户正在使用应用时删除会部分失败：非锁定文件被删掉，随后宏才提示关闭应用；用户此时取消安装就会留下不完整的资源树。因此 hook 内先调用同一个宏（静默安装走既有 kill 分支、交互安装先提示），确保应用已关闭再清理。`${...}` 在宏插入时求值，因此 hook 文件可以先于 `PRODUCTNAME`/`MAINBINARYNAME` 定义被 include。

## 风险

- 若运行中实例无法被关闭（权限不足等），`CheckIfAppIsRunning` 会按既有逻辑中止或提示安装，删除不会执行，不会留下半清理状态。
- 删除后若安装中断（磁盘空间不足、断电），安装树会处于资源缺失状态，需要重新运行安装包；这与任何中断安装的后果一致。
- hook 仅在 Windows NSIS 路径生效，Docker、源码运行与 macOS 路径不受影响。

## 回滚

移除 `tauri.conf.json` 中的 `installerHooks` 配置与 `tauri/src-tauri/installer-hooks.nsh` 即可回到原行为；本变更不涉及数据迁移、依赖锁或持久化状态。
