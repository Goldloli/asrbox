# Granite Speech 5.0 2B CUDA 真机验证记录

- 日期：2026-11-10（Asia/Shanghai）
- 变更：`prepare-v0-4-1`（task 4.5）
- 硬件：NVIDIA GeForce RTX 2060 SUPER（8,192 MiB 显存，compute capability 7.5 / sm_75）；驱动 560.94（CUDA 12.6 驱动 API）；Windows 11 企业版 10.0.22631 x64
- 运行时：`torch 2.11.0+cu128`（CUDA 12.8 runtime）、`transformers 5.17.0`、Python 3.14.7
- 套件来源：官方 Release `v0.4.0` 的 `asrbox-cuda-kit-windows-x64.zip.part1/part2`（各 1.29 GiB）。拼接后 zip 为 2,759,849,393 字节，SHA-256 `e373c5c94fc2250780150781e9dad0589079a33a79eb0778ae6d2daf0a9ca3fa`，与 `cuda-kit-manifest.json` 一致；解压 2,285 文件 / 4.03 GiB；`python scripts/build-cuda-kit.py --check` 输出 `kit matches manifest: 2285 files, torch 2.11.0+cu128`。
- 注入方式：
  - 源码运行：`PYTHONPATH=<kit>;<repo>`（与冻结包的 `ASRBOX_CUDA_KIT_DIR` 注入等价）；
  - 冻结安装版：`ASRBOX_CUDA_KIT_DIR=<kit>` 启动安装目录 sidecar，stderr 输出 `CUDA acceleration kit active: <kit>`（`backend/pyi_rth_cuda_kit.py` 生效）。
- 验证路径：`backend.services.transcribe.transcribe_with_local_model` → `TransformersSpeechLMBackend` → `GraniteSpeech5Adapter`；任务经 `POST /transcriptions` 走本地 worker 子进程，设备解析 `_speech_lm_device_map()` 返回 `auto`。
- 音频：本机 TTS 合成的 25.3 秒英文语音与 150 秒长音频（未入仓）。

## 结果总表

| 路径 | 音频 | 耗时 | 输出 | 六种导出 | 显存 |
| --- | ---: | ---: | --- | :---: | --- |
| 源码 HTTP（worker 子进程） | 25.3 s | 66.7 s | 390 字符 / 5 段 | ✓ | nvidia-smi 峰值 5,612 MiB（基线 1,018；13 次采样 >4 GiB；GPU util 峰值 46%） |
| 源码进程内分发 | 25.3 s | 28.6 s | 390 字符 / 1 段（单块） | — | torch 分配峰值 4,501.9 MiB / 保留 4,560.0 MiB |
| 冻结安装版 + `ASRBOX_CUDA_KIT_DIR` | 25.3 s | 40.9 s | 390 字符 / 5 段 | ✓ | nvidia-smi 峰值 5,086 MiB（基线 499；GPU util 峰值 38%） |
| 源码进程内分发（长音频） | 150.0 s | 288.1 s | 2,491 字符 / 20 段 | — | torch 分配峰值 6,859.7 MiB（部分下沉） |

## 设备证据

- `torch.cuda.is_available() == True`；`torch.cuda.get_device_name(0) == NVIDIA GeForce RTX 2060 SUPER`；capability `(7, 5)`；`torch.version.cuda == 12.8`。
- 加载后模型 `device == "cuda:0"`、`dtype == torch.bfloat16`。
- 25.3 秒短音频：`hf_device_map` 为空（单设备全量加载）。
- 150 秒长音频：出现 accelerate 自动部分下沉——encoder、projector 与 LLM 第 0–9 层在 GPU，第 10–39 层与 `lm_head` 在 CPU，并输出 `Some parameters are on the meta device because they were offloaded to the cpu`。
- 冻结安装版 `/runtime/status`：`torch_cuda_available=true`、`cuda_device_name=NVIDIA GeForce RTX 2060 SUPER`、`cuda_capability=7.5`、`granite_speech_available=true`。

## 与 CPU 的一致性

- 25.3 秒短音频：CPU（源码 410.4 s、冻结 503.0 s、安装版 412.2 s）与 CUDA（源码 66.7 s、安装版 40.9 s）均为 390 字符 / 5 段，文本逐字一致，六种导出非空。
- 冻结安装版同一任务 CPU → CUDA：412.2 s → 40.9 s（约 10.1×）。
- 150 秒长音频：不同设备分配下输出不同（worker 全 GPU 路径 2,017 字符 / 25 段；进程内部分下沉 2,491 字符 / 20 段），两者末段都结束于 150.0 s，尾部无截断。差异来自混合设备执行的数值路径，属预期风险而非失败。

## 未覆盖与限制

- 仅验证 RTX 2060 SUPER（8 GB / sm_75）；未覆盖 L4、A100 等更大显存下的全 GPU 常驻，也未覆盖多卡。
- 未通过 GUI「设置 → 显卡加速」开关执行端到端下载/安装套件（套件取自官方 Release 分卷并按 manifest 校验）；套件下载失败/回退的 UI 状态未验证。
- 未复测六语种与加噪样本的 CUDA 输出；语种与噪声覆盖沿用 macOS CPU 记录。
- 未单独测 CUDA 上 120 秒分块边界，仅以 150 秒音频确认尾部覆盖完成。

## 结论

- `granite-speech-5.0-2b` 在 Windows + NVIDIA CUDA 上可经完整 backend 分发路径真实转写；冻结安装版通过 `ASRBOX_CUDA_KIT_DIR` 同样生效，输出与 CPU 在短音频上逐字一致。
- 8 GB 显存下长音频会触发 accelerate 自动部分下沉，属可用但明显变慢的混合执行；发布说明不得写成「全 GPU 加速」或给出无条件的性能承诺。
- task 4.5「有兼容 NVIDIA GPU 时独立验证 CUDA 执行」已完成，本记录取代原 `granite-speech-5.0-cuda-verification-pending.md`。
