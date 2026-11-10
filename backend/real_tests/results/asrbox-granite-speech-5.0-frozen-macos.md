# Granite Speech 5.0 2B macOS 冻结包验收记录

- 日期：2026-11-09（Asia/Shanghai）
- 变更：`prepare-v0-4-1`（task 4.3）
- 环境：macOS 27.0.1 / Apple Silicon（arm64），16 核 CPU、128 GB 内存，无 NVIDIA GPU
- 构建命令：`bash scripts/build-server.sh`（PyInstaller，含 `--mlx`，产物 `dist/asrbox-server/`）
- 冻结二进制：`dist/asrbox-server/asrbox-server`（109,345,360 字节；整包约 1.2 GB）
- 说明：本次验收对象是 sidecar 二进制本身（桌面候选的运行时组件），不是 DMG/Tauri 安装器；源码测试与旧二进制结果均未用于替代本记录。

## 验收步骤与结果

1. **冻结包构建**：`python backend/build_binary.py --mlx` 成功，产物 1.2 GB。
2. **运行时探针**（`dist/asrbox-server/asrbox-server --runtime-check all`）：
   - `granite_speech_available: true`
   - `torch_available: true`、`torch_cuda_available: false`、`torch_mps_available: true`
   - 既有 speech-LM 探针同样为 true（`qwen3_asr_available`、`granite_speech_plus_available`、`cohere_asr_available`、`voxtral_available`）
3. **冻结 sidecar 启动**：`ASRBOX_DATA_DIR=/tmp/asrbox-frozen-data ASRBOX_MODEL_STORAGE_ROOT=<repo>/data dist/asrbox-server/asrbox-server --host 127.0.0.1 --port 17497`；`/health` 返回 healthy，`models_dir` 正确指向共享模型根。
4. **目录条目可见**：`GET /models/status` 返回 `granite-speech-5.0-2b`：显示名 `Granite Speech 5.0 2B`、`languages=[en,fr,de,es,pt,ja]`、`supported_devices=[cpu,cuda]`、`supports_timestamps=false`、`downloaded=true`、`installed_source=modelscope`、`installed_repo_id=ibm-granite/granite-speech-5.0-2b`。目录接口的 `compatible` 在该请求中为 `null`（目录渲染不阻塞加载重依赖），实际运行能力由第 2 步探针与本步真实转写确认。
5. **真实转写（冻结 backend 完整 HTTP 路径）**：用托管下载的 5.0 权重，经 `POST /transcriptions`（本地模型、6 种导出）转写 11.6 秒英文清晰语音；任务 `completed`，耗时 61.4 秒，输出 200 字符、3 个句段，TXT/SRT/Markdown 导出非空；文本与脚本原文一致（仅一处冠词差异）。

原始结构化结果：`backend/real_tests/results/asrbox-granite-speech-5.0-frozen-macos.json`。

## 未覆盖与限制

- 本记录只证明 **macOS Apple Silicon CPU** 的冻结 sidecar 路径；核显/GPU 未声明，也未在 CUDA 环境执行（CUDA 见 `granite-speech-5.0-cuda-verification-20261110.md`）。
- Windows x64 冻结候选与 `0.4.0 → 0.4.1` 就地升级已完成，见 `asrbox-granite-speech-5.0-windows-verification-20261110.md`（task 4.4）。
- 未构建完整 Tauri 桌面安装器（DMG/NSIS）；如发布流程需要，按 `docs/release.md` 的双平台门禁另行执行。
- 真实验收音频为本地合成的英文语音（未入仓），不是真人录音；质量对比结论见 `asrbox-granite-speech-5.0-verification-*.md`。
