# 本地 ASR 模型扩充路线图

> **文档定位**：这是一份前瞻性规划文档，记录"扩充本地开源 ASR 模型目录"这一需求的完整意图、分阶段范围与实现程度。它**不是**产品行为的事实来源——已实现的行为以 `openspec/specs/` 为准，进行中的行为以 `openspec/changes/` 中的活动 change 为准。每个阶段落地后，本文同步更新该阶段状态与对应 change 归档链接。

## 需求背景

ASRbox 目前的本地模型目录以 Whisper 系（transformers / faster-whisper / MLX）、Qwen3-ASR、MOSS-Transcribe-Diarize 和 SenseVoice Small 为主。需求是：**把 2025–2026 年开源生态中值得引入的本地 ASR 模型分阶段加入目录**，保持：

- 每个新模型如实声明语言覆盖、时间戳/说话人/流式能力、设备矩阵（现有 `model-management` spec 的能力事实约束继续生效）；
- 不因引入模型而膨胀桌面发布包体积——新 runtime 必须论证打包与体积策略；
- 许可合规：许可证、署名义务与 `THIRD_PARTY_NOTICES.md` 同步维护；
- 每阶段一个独立 OpenSpec change，实现、测试、文档、spec 四方对齐后归档。

## 现状盘点（截至 2026-09）

现有引擎与模型注册于 `backend/backends/registry.py`，引擎分发在 `backend/backends/local_asr.py`：

| 引擎 | runtime | 已有模型 |
|---|---|---|
| `whisper_transformers` | transformers | whisper base/small/medium/large-v3/large-v3-turbo |
| `faster_whisper` | CTranslate2 | 同上五档 |
| `mlx_whisper` | MLX | whisper large-v3-turbo |
| `qwen3_asr` | transformers | Qwen3-ASR 0.6B / 1.7B |
| `moss_transcribe_diarize` | transformers | MOSS-Transcribe-Diarize 0.9B |
| `funasr` | FunASR | SenseVoice Small |

## 阶段总览

| 阶段 | 内容 | 新增 runtime | 状态 |
|---|---|---|---|
| 1 | FunASR 系扩展（Paraformer、Fun-ASR-Nano）+ Distil-Whisper | 无（复用 funasr / faster_whisper） | 已实现并通过真机验证（change：`add-funasr-paraformer-distil`，见 `openspec/changes/`；归档后链接回写此处） |
| 2 | transformers speech-LM 统一引擎重构 + Cohere Transcribe / Granite Speech 4.1 / MOSS-Transcribe-preview-2B / ARK-ASR / Belle-2 / Voxtral Mini | 无新 runtime，需 transformers 版本审计 | 未开始 |
| 3 | FireRedASR2-AED + 通用 forced-alignment 时间戳后处理 | FireRedASR 官方推理代码（vendored 最小集） | 未开始 |
| 4 | NeMo 引擎（Parakeet TDT v3 / Canary-Qwen / Canary-1B-Flash 等），仅 Docker/server 构建 | nemo_toolkit（不进桌面二进制） | 未开始 |

阶段 2–4 的任务通过 Beads 跟踪（`bd ready` 可见），每条任务描述引用本文。

## 阶段 1：FunASR 系扩展 + Distil-Whisper（零新依赖）

**模型与实现程度**：

| 模型 | 引擎 | 来源 | 能力声明 |
|---|---|---|---|
| Paraformer-large（zh，离线版，非 streaming） | `funasr` | ModelScope 主源 + HF 镜像 | 句段时间戳（由原生字级时间戳聚合），zh/en，cpu/cuda |
| Fun-ASR-Nano（800M） | `funasr` | ModelScope 主源 | 无原生时间戳，zh（含方言），cpu/cuda |
| Distil-Whisper large-v3 | `faster_whisper` | HF（CTranslate2 转换版） | 句段+词级时间戳，仅英文，cpu/cuda |

**验收程度**：

- FunASR 引擎内引入按模型的轻量 adapter（现 `_clean_sensevoice_text` 为 SenseVoice 特化）；Paraformer 的字级时间戳聚合为句段 `TranscriptSegment`，词级暂不透出。
- 新增 FunASR 系模型默认启用 `fsmn-vad` 切分长音频；SenseVoice 行为不变。
- Distil-Whisper 在模型目录如实标注"仅英文"，防止用户误用于中文。
- 注册、下载、能力展示走现有 `model-management` 生命周期，无 API 变更。
- 模型许可记录与 `THIRD_PARTY_NOTICES.md` 更新（Paraformer 为模型协议，Fun-ASR-Nano Apache 2.0，Distil MIT）。

## 阶段 2：transformers speech-LM 统一引擎（多语言精度梯队）

**动机**：`Qwen3ASRBackend` 与 `MossTranscribeDiarizeBackend` 已重复"加载 processor/model → 构造输入 → generate → 解析输出"逻辑。抽成 `transformers_speech_lm` 引擎 + 每模型小 adapter（prompt 构造 / 输出解析），后续模型只需 registry 条目 + adapter。

**候选模型**（落地前逐个核实 transformers 版本要求与仓库可用性）：

- Cohere Transcribe 2B（Apache 2.0；无时间戳/无语种检测，HF gated repo 需处理 401 与 token 引导）
- IBM Granite Speech 4.1 2B 与 `-plus`（Apache 2.0；plus 带词级时间戳 + 说话人归属）
- MOSS-Transcribe-preview-2B（Apache 2.0）
- ARK-ASR-3B / 0.6B（Apache 2.0）
- Belle-2（中文增强，Qwen3-ASR 底座）
- Voxtral Mini 3B 离线版（Apache 2.0）

**实现程度**：引擎重构不改变 `TranscriptionResult` 契约；transformers 版本升级需同步两个 runtime lock 并通过依赖审计；CC-BY-4.0 模型（如后续引入 Parakeet/Canary/Scribe）的署名展示在本阶段一并设计。

## 阶段 3：FireRedASR2-AED + 通用对齐后处理

- FireRedASR2-AED 1.1B：中文公开基准第一，自带 VAD/标点/语种识别/时间戳；官方推理代码独立，需 vendored 最小推理集 + fsmn-vad 切分（AED 单次 60s 限制）。
- Qwen3-ASR 官方 forced-aligner 作为**通用对齐后处理服务**：任何 `supports_timestamps=false` 的模型转写后可选执行对齐，把无时间戳结果升级为带字幕轴的句段。一次投入、全家族受益；对齐失败不影响基础转写成功（遵守 `transcription-lifecycle` 的可选后处理隔离约束）。

## 阶段 4：NeMo 引擎（仅 Docker/server）

Parakeet TDT 0.6B v3、Canary-Qwen-2.5B、Canary-1B-Flash、IndicParakeet-7B。`nemo_toolkit` 体积大且 CUDA-only，**不进 PyInstaller 桌面二进制**，只注册到 server/Docker 构建；registry 以 `supported_devices=["cuda"]` 过滤，桌面端不可见。CC-BY-4.0 署名义务在此阶段随模型引入落地。

## 明确排除项

| 模型 | 排除理由 |
|---|---|
| Meta MMS | CC-BY-NC 非商用，与开源发布冲突 |
| Moonshine 中文版 | Community License（年营收 >$1M 需授权）；中文 CER ~36% 无实用价值 |
| Kyutai STT、Voxtral Realtime | 流式导向，ASRbox 为批处理产品；待产品引入实时场景再议 |
| diffusion-gemma-asr | 研究性质，明确不可部署 |
| GigaAM 等小语种专用模型 | 等明确语种需求再评估 |
| Moonshine 英文版、Vibe、Scribe 等英文专用模型 | 暂缓：Distil-Whisper 已覆盖英文提速需求；阶段 2 后按需重评 |

## 横切约束（每个阶段的 change 都须覆盖）

- **许可证与署名**：新模型许可写入 registry 元数据与 `THIRD_PARTY_NOTICES.md`；CC-BY-4.0 模型需在模型详情与关于页展示署名（阶段 2 设计、阶段 4 落地）。
- **打包与体积**：新 runtime 必须走 `backend/build_binary.py` hidden imports 与 frozen 路径测试（`pyi_rth_funasr.py` 为先例）；桌面二进制体积预算是硬约束。
- **设备矩阵**：`supported_devices` 如实反映引擎可用路径；NeMo/MLX 等平台专属引擎在其余平台自然隐藏。
- **下载源**：沿用 `source_candidates`（ModelScope 主源 + HF 镜像）与 `allow_patterns` 白名单；gated repo 需明确失败态与引导。
- **测试**：adapter 单测（stub 替身，见 `backend/tests/test_repetition_guardrails.py` 模式）、registry 测试、`real_tests/` 真机验证；不削弱既有断言。
- **API 契约**：模型扩充不改变受维护路由与字段；如需新增能力字段，同步 response_model、typed consumer 与 contract test。

## 新会话接手指南

1. `openspec list --json` 查看活动 change；`bd ready` 查看阶段 2–4 任务。
2. 读本文了解全局意图与边界，读对应主 spec 了解必须保持的行为。
3. 按活动 change 的 tasks.md 实施；实现与验证完成后及时归档并回写本文的阶段状态。
