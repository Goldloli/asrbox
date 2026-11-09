# Granite Speech 5.0 2B CUDA 真机验证待办（prepare-v0-4-1 移交项）

- 状态：**pending（未执行）**
- 记录日期：2026-11-09
- 涉及模型：`granite-speech-5.0-2b`（`transformers_speech_lm` 引擎，registry 声明 `supported_devices=["cpu","cuda"]`）
- 验证环境：macOS Apple Silicon 开发机，16 核 CPU、128 GB 内存；`torch.cuda.is_available() == False`，本机无 NVIDIA GPU
- 未验证原因：仓库 CI 与开发机都没有可用的 NVIDIA CUDA 设备，无法在本次实现中执行 CUDA 路径

## 必须完成的门禁

以下项目只有在具备兼容 NVIDIA GPU（CUDA）的环境执行后，才可以宣称 CUDA 已验证；CPU 结果不能替代：

1. `granite_speech_available` 运行时探针为 `true`（`transformers` 已安装）。
2. 经托管下载后的完整 backend 分发路径，用 `granite-speech-5.0-2b` 真实转写至少一条音频：
   - 走 `backend.services.transcribe.transcribe_with_local_model` → `TransformersSpeechLMBackend` → `GraniteSpeech5Adapter`，而不是只调用 adapter 内部方法；
   - 确认生成时设备为 CUDA（`_speech_lm_device_map()` 在 `torch.cuda.is_available()` 为真时返回 `auto`），且结果非空、六种导出可用。
3. 记录耗时、峰值显存/内存、转写文本长度与句段数量（与 CPU 结果分开记录）。

## 待执行命令

```bash
# 1) 运行时探针（源码或冻结均可）
python -c "import transformers; from transformers import AutoModelForSpeechSeq2Seq; print('granite_speech_available=true')"

# 2) 真实模型门禁（参考 backend/real_tests/test_real_models.py 的执行方式）
ASRBOX_RUN_REAL_MODELS=1 \
ASRBOX_REAL_MEDIA_DIR=/path/to/sample/media \
ASRBOX_REAL_MODEL_DOWNLOAD_TIMEOUT=3600 \
ASRBOX_REAL_MODEL_TASK_TIMEOUT=1800 \
python -m pytest backend/real_tests/test_real_models.py -k "granite-speech-5.0-2b"

# 3) 若需要与 4.1 对比，追加
ASRBOX_RUN_REAL_MODELS=1 ASRBOX_REAL_MEDIA_DIR=/path/to/sample/media \
python -m pytest backend/real_tests/test_real_models.py -k "granite-speech-4.1-2b and not plus"
```

## 交接信息

- 移交对象：具备 NVIDIA GPU（CUDA 12.x，torch cu128 基线）与 Windows 或 Linux 桌面/服务器环境的维护者
- 关联变更：`openspec/changes/prepare-v0-4-1/`（tasks 4.5）
- 完成判定：上述命令全部通过并把环境、日期、结果补充到本文件与 `asrbox-granite-speech-5.0-verification-*.md`；在此之前，发布说明与模型详情不得把 CUDA 写成“已验证”
