# transformers speech-LM 统一引擎真机冒烟（2026-09-20）

- 环境：macOS Apple Silicon（CPU 推理，统一引擎在无 CUDA 时强制 `device_map="cpu"`）、Python 3.13、transformers 5.17.0（PyPI）、torch 2.11.0。
- 音频：`测试音视频/10万代码量真实项目….mp4` 提取的 16 kHz 单声道片段（30s / 20s）。
- 方法：绕过任务管线，直接调用 `TransformersSpeechLMBackend` / 各 adapter 的 load + 转写路径，验证与旧 backend 的行为等价和新模型接入路径。

## 迁移等价性（旧模型走新引擎）

| 模型 | 结果 |
| --- | --- |
| `moss-transcribe-diarize` | 通过：5 个句段、`S01` 说话人标签、时间轴到 29.99s，`raw_result_summary` 携带 `{"engine": "transformers_speech_lm", "adapter": "moss_transcribe_diarize"}` |
| `qwen3-asr-0.6b` | 通过：`parsed: true`、语言 zh、中文转写准确（"前几期我一直在讲AI编程工程化…"） |

## 新模型冒烟

| 模型 | 结果 |
| --- | --- |
| `granite-speech-4.1-2b-plus`（4.2 GB，ModelScope 镜像下载） | 加载与双模式通过：SAA 模式产出 `[Speaker N]:` → `S01` 说话人句段；TS 模式 811 词、时间戳回绕解算后单调、按词聚合 78 个句段。测试音频为中文而该模型仅支持欧洲 5 语种，输出为预期内的幻觉文本——机制验证以形状/解析正确性为准，**语种内精度仍需英文音频补测** |
| `ark-asr-0.6b`（2.6 GB，HF 权重） | 通过：`trust_remote_code` 在 transformers 5.17 下加载成功，中文 20s 片段转写准确（"前几期我一直在讲AI编程工程化…"），句段时间轴 0–20s |
| `granite-speech-4.1-2b` | 未单测：与 plus 共用同一 native 加载路径与 processor（plus 已验证），风险低 |
| `cohere-transcribe-2b`（4.1 GB，ModelScope 镜像下载） | 通过：加载与显式语言路径正常，`auto_chunked: true`（processor 内建长音频分块），中文 30s 转写整体连贯（个别词错，如"评论区"→"平均区"）。注意 transformers 5.17 的 `processor.decode` 在传 `audio_chunk_index` 时必须同时传 `language`，adapter 已适配 |
| `voxtral-mini-3b`（9.4 GB，ModelScope 官方 `mistralai` org 镜像下载） | 通过：`apply_transcription_request` 原生路径 + mistral-common processor 正常，20s 中文片段转写连贯（zh 非官方支持语言，目录仍如实不声明）；句段时间轴 0–20s |

## 打包版验证（2026-09-21，PyInstaller + Tauri .app/DMG）

- 构建：`npm run build:desktop` 全链路成功（PyInstaller 后端 + Rust 壳 + DMG）；冻结二进制 smoke 门禁通过；`dist/asrbox-server` 冒烟后 `/runtime/status` 六个 speech-LM 探针全部 `True`（新模型 hidden imports 在冻结包中生效）。
- 冻结 worker 转写（remote code 路径）：ARK-ASR 0.6B 通过，60s 中文音频 2 句段、时间轴 0–59.98s。
- 打包版 GUI 实测（真实应用，任务中心数据目录）：
  - 模型管理：六个新模型全部在列，新增「语音大模型」分类；描述/能力/语言/限制正确；ARK 与 Cohere 被识别为已下载；详情展示「许可: Apache-2.0」；天梯出现估算行（如 `Cohere Transcribe 2B / C* / C* / A*`、`ARK-ASR 0.6B / C* / C* / A*`）。
  - 端到端任务：在打包应用内用 ARK-ASR 0.6B 转写 60s 中文视频，冻结 worker 完成并产出 6 个句段，任务中心正常展示字幕与导出入口；无时间戳模型显示「时间轴按音频均摊的近似值」提示。

### 打包测试中发现并修复的问题

- **adapter 分发缺陷（严重）**：`BaseSpeechLMAdapter.transcribe` 仍是 `NotImplementedError` 占位，四个新模型的 adapter 只能被直接调用、无法经 backend 真实分发路径使用（此前冒烟均直接调用 `transcribe_chunk`，未覆盖该路径）。已修复为委托 `transcribe_chunked`，补分发回归测试，并在冻结二进制中复验。
- **响应字段缺失**：四个新运行探测键未声明在 `RuntimeStatusResponse` 上，接口静默丢弃。已补声明 + 契约断言。
- **分类页签硬编码**：模型页分类页签清单为硬编码，新「语音大模型」分类不显示。已补。

## 打包应用实测后用户反馈问题（2026-09-23）：Voxtral 报 "Missing required files: tokenizer"

- 现象：客户端用 `voxtral-mini-3b` 转写提示"加载失败 / Missing required files: tokenizer"。
- 根因：Mistral 仓库用 `tekken.json`（Tekken 分词器）替代经典 tokenizer 文件组，`transformers_speech_lm` 兼容性检查的通用 tokenizer 文件组（tokenizer.json / tokenizer_config.json / vocab.json / merges.txt）未包含它，完整下载被误判为文件不完整。
- 修复：分词器文件组改为 adapter 级声明（`BaseSpeechLMAdapter.tokenizer_files`），`VoxtralMiniAdapter` 声明 `("tokenizer.json", "tekken.json")`；兼容性检查与 `speech_lm_compat_spec` 同步。补单测（spec 级）与 API 级测试（tekken 布局的 voxtral 目录不再报缺 tokenizer）。
- 复验：真实用户存储下四个新模型 `missing=[]`；voxtral 20s 中文片段经 backend 分发完整转写成功（1 句段、0–20.02s）；全量后端 576 通过；打包应用重建并装机复测。

## 六模型客户端全量实测（2026-09-23，打包应用内逐一手动跑通）

在打包应用（`/Applications/ASRbox.app`，含 voxtral 兼容修复的构建）中对全部六个新模型逐一创建真实转写任务并确认完成：

| 模型 | 素材 | 结果 |
| --- | --- | --- |
| `ark-asr-0.6b` | 中文 60s | 完成，6 句段（02:27 复跑验证） |
| `ark-asr-3b` | 中文 60s | 完成，6 句段；文本与 0.6B 输出不同，确认为真实 3B 推理 |
| `cohere-transcribe-2b` | 中文 60s，显式 `zh` | 完成，5 句段，输出带标点与大小写（模型标点能力生效） |
| `granite-speech-4.1-2b` | 英文 30s（9/11 演讲片段） | 完成，4 句段，英文带标点大小写、质量良好 |
| `granite-speech-4.1-2b-plus` | 英文 30s | 完成，4 句段，默认 SAA 模式产出 `S01` 说话人标签 |
| `voxtral-mini-3b` | 中文 20s | 完成，2 句段（修复后） |

- 素材来源：中文片段从项目测试视频截取；英文片段从真实任务 `60cdcaa9…` 的派生音频中截取 30s。
- 测试期间顺带核实：ModelScope 存在 ARK-ASR 两个尺寸的镜像（`Edge0/ARK-ASR-0.6B` / `Edge0/ARK-ASR-3B`），ARK-3B 已从 ModelScope 完整下载并实测可用；registry 中 ARK 两个条目已从 HF 单源升级为 **ModelScope 主源 + HF 备源**（与 granite/cohere/voxtral 一致），registry 测试同步更新。
- `granite-speech-4.1-2b-plus` 的词级时间戳模式（任务开启"词级时间戳"选项时切换）此前已在开发环境双模式验证，客户端本次验证的是默认 SAA 模式。

## 已知问题

- transformers 5.17 `granite_speech_plus` 在 MPS 上 projector 形状错位（CPU 正常），统一引擎已规避（无 CUDA 强制 CPU）；建议上游反馈。
- hf-mirror.com 对 huggingface_hub 1.x 的 HEAD resolve 不稳定（本机网络），手动取权重改用 curl；不影响应用内下载。
- **Voxtral 仓库重复权重（未修复，独立发现）**：`voxtral-mini-3b` 仓库同时含 `consolidated.safetensors`（9.35 GB）与分片 `model-*.safetensors`（合计 ~9.36 GB），应用下载会把两份都拉下来（多占约 9.3 GB）。transformers 走 index 加载分片，consolidated 对本项目路径冗余；是否加入下载忽略清单（需按模型范围评估，避免影响仅提供 consolidated 的仓库）待定。
- 自动化交互限制：打包应用内的 Radix 下拉对合成鼠标/键盘事件不响应（工具限制，非应用缺陷），GUI 中的模型选择未做点击级验证；转写任务经由应用自身带令牌的 API 创建（同一后端进程、同一数据目录）。
