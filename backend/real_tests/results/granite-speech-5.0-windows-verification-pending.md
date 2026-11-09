# Granite Speech 5.0 2B Windows 验收待办（prepare-v0-4-1 移交项 / task 4.4）

- 状态：**pending（未执行）**
- 记录日期：2026-11-09
- 涉及版本：`v0.4.1`（分支 `openspec/prepare-v0-4-1`）
- 未验证原因：当前实现环境为 macOS Apple Silicon，没有 Windows x64 运行环境；`v0.4.0 → v0.4.1` 就地升级缺陷只在 Windows 安装器路径上出现，无法用 macOS 结果替代。
- 负责方式：由维护者在 Windows 环境完成后，把结果补进本文件并勾选 `openspec/changes/prepare-v0-4-1/tasks.md` 的 task 4.4；在此之前发布说明不得写"Windows 已验证"。

## 必须完成的门禁

1. **Windows x64 冻结候选构建成功**：`v0.4.1` 的 sidecar（NSIS 安装包内）可启动，`/runtime/status` 中 `granite_speech_available=true`。
2. **目录条目可见**：模型页与 `/models/status` 出现 `granite-speech-5.0-2b`（六语种、CPU / NVIDIA GPU、无时间戳、近似时间轴），显示名与语言列表正确。
3. **真实转写**：经 Windows 冻结 backend 的完整 HTTP 路径，用托管下载的 5.0 权重至少完成一条真实转写（建议再用一条 >120 秒长音频确认 120 秒分块与尾部覆盖），六种导出可用。
4. **就地升级**：从 `v0.4.0` 安装在**同一目录**覆盖安装 `v0.4.1`，确认：
   - 已下载的旧模型（含 `granite-speech-4.1-2b` / `-plus`）无需重新下载、可直接使用；
   - 默认模型设置、历史任务、字幕不可变版本保持不变；
   - 安装目录没有上一版本的残留托管资源（参照 `docs/release.md` 第 12 项：安装器替换资源目录、无旧依赖文件残留、运行时健康报告无依赖导入失败）。
5. **记录**：平台、Windows 版本、安装方式（全新 / 升级）、GPU 与 CUDA 是否可用、耗时、结果、证据路径；Windows 上验证的默认目标为 CPU。

## 参考命令（Windows PowerShell / Git Bash）

```powershell
# 1) 环境依赖（Windows 专用 build lock）
pip install -r requirements-build-windows.lock

# 2) 构建 sidecar + Tauri 安装器（build-server.sh 需在 Git Bash 中执行）
npm run build:desktop

# 3) 冒烟：启动安装后的应用，检查运行时探针
#    应用启动后访问 http://127.0.0.1:17494/runtime/status（token 见应用内部传递）
#    期望 granite_speech_available == true
```

真实模型门禁参考 `backend/real_tests/test_real_models.py` 的执行方式：

```bash
ASRBOX_RUN_REAL_MODELS=1 ASRBOX_REAL_MEDIA_DIR=/path/to/sample/media \
  python -m pytest backend/real_tests/test_real_models.py -k "granite-speech-5.0-2b"
```

## 交接信息

- 关联变更：`openspec/changes/prepare-v0-4-1/`（task 4.4、6.2 的跨平台门禁）
- 相关证据：`backend/real_tests/results/asrbox-granite-speech-5.0-verification-20261109.md`（macOS CPU 源码路径）、`asrbox-granite-speech-5.0-frozen-macos.md`（macOS 冻结 sidecar）、`granite-speech-5.0-cuda-verification-pending.md`（CUDA）
- 完成判定：上述 1–5 全部通过并记录；若失败，保留失败日志与复现步骤，在 GitHub issue 或 `bd` 中登记后再决定是否阻断 `v0.4.1` 发布。
- 注意：按 `docs/release.md` 的约定，版本 bump 已落在 `v0.4.1`；合并到 `main` 后应尽快完成 release/tag，或回退 bump，避免 `main` 长期指向不存在的 Release。
