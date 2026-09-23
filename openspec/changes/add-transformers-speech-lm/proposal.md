# add-transformers-speech-lm

## 为什么

ASRbox 的本地模型目录缺少 Whisper/Qwen3/MOSS/SenseVoice 之外的精度梯队：2025–2026 年开源 speech-LM（Granite Speech 4.1、Cohere Transcribe、ARK-ASR、Voxtral Mini）在多语言转写精度上提供了新档位，其中 Granite Speech 4.1 plus 是目前唯一单遍输出**词级时间戳 + 说话人归属**的开放模型（Apache 2.0）。但 `Qwen3ASRBackend` 与 `MossTranscribeDiarizeBackend`（`backend/backends/local_asr.py`）各自重复"加载 → generate → 解析"逻辑，每加一个模型就要复制一个 backend 类；同时 transformers 被 pin 在 git commit `09835700`（内容上等于 v5.13.0，Qwen3-ASR 首个 release），而本批模型需要 ≥5.4/≥5.8，且 v5.15.0 起携带 Qwen3-ASR 解析修复与多项 Whisper 修复。本 change 是 [docs/asr-models-roadmap.md](../../../docs/asr-models-roadmap.md) 阶段 2 的落地：先抽统一引擎、先升依赖，再批量接入模型。

落地前事实核查（2026-09-20）已完成：

- **可行**：Granite Speech 4.1 2B（6 语言，开放）与 2B-plus（5 语言，词级时间戳+说话人归属，transformers ≥5.8 原生 API）；Cohere Transcribe 2B（14 语言含中文，无时间戳、无免token 语种检测，HF gated=auto 但 ModelScope 有同名镜像）；ARK-ASR 3B/0.6B（19 语言含中英，`trust_remote_code` 自定义代码，单条输入 30 秒）；Voxtral Mini 3B 离线版（8 语言，transformers ≥4.54 原生，但 processor 依赖 `mistral-common[audio]>=1.8.1`，单遍最长 30 分钟）。
- **剔除**：Belle-2——"Qwen3-ASR 底座"前提不成立，HF 上不存在该模型（`BELLE-2` org 实为 Whisper 中文微调系列）；MOSS-Transcribe-preview-2B——仅英语、`trust_remote_code`、无时间戳/说话人输出证明，相对 Distil-Whisper + MOSS-Diarize 无独特价值。
- **版本审计**：git pin ≈ v5.13.0 → 最新 stable 5.17.0 无硬障碍（MOSS 包约束 `>=5.6,<6.0` 允许；torch 最低 2.5 < 现有 2.11.0）。

## 变更内容

- **统一引擎重构**：`backend/backends/local_asr.py` 新增 `transformers_speech_lm` 引擎——共享"加载 processor/model → 构造输入 → generate → 解析输出"核心，每模型一个小 adapter（prompt 构造、输出解析、语言策略、切分上限）。`qwen3-asr-0.6b/1.7b` 与 `moss-transcribe-diarize` 迁移到新引擎，**行为保持不变**（`TranscriptionResult` 契约、时长感知输出预算、防幻觉护栏、原生说话人标签保留全部维持）；原两个 backend 类移除。
- **依赖升级**：transformers 从 git commit pin 改为 PyPI `transformers==5.17.0`（`requirements-runtime.in`、`requirements-docker.in`），重新生成 `requirements-runtime.lock`、`requirements-docker.lock`，同步 `requirements-windows.lock`；新增 `mistral-common[audio]>=1.8.1`（仅 Voxtral processor 需要，轻量纯 Python）；通过依赖审计与版本一致性检查。
- **模型目录新增 6 个条目**（能力声明如实，均 cpu/cuda，均 Apache 2.0）：
  - `granite-speech-4.1-2b`：en/fr/de/es/pt/ja，无时间戳、无说话人，transformers 原生 API；
  - `granite-speech-4.1-2b-plus`：en/fr/de/es/pt，**词级时间戳（厘秒标签，10 秒回绕需 unwrap）+ 说话人归属**，不支持标点/大小写（详情明示）；
  - `cohere-transcribe-2b`：14 语言含 zh，**不支持 auto 语种**（必须显式选语言，缺失时失败并给出可操作错误），无时间戳；HF gated，ModelScope 镜像主源，HF 源 401 时给出明确失败态与引导；
  - `ark-asr-0.6b`、`ark-asr-3b`：19 语言含中英，语种跟随音频（支持 auto），无时间戳，`trust_remote_code`（沿用 MOSS-Diarize 先例，仓库 pin + `allow_patterns` 白名单）；
  - `voxtral-mini-3b`：8 语言（无中文），auto 语种检测，无时间戳，单遍最长 30 分钟长音频。
- **长音频切分**：有输入时长上限的 speech-LM 模型（Cohere ~35s、ARK 30s、Granite plus 时间戳模式 ~3.5min / ASR ~9min）默认经 `fsmn-vad` 切分（沿用阶段 1 模式），句段与词级时间戳按块起点偏移。
- **许可与署名元数据**：registry 新增 `license` 与可选 `attribution` 字段并经 `ASRModelStatus` 暴露（同步 response_model、typed client、contract test）；模型详情展示许可；为 CC-BY-4.0 类需署名许可预留展示路径（阶段 4 模型落地时直接声明数据即可，本波 6 个模型均为 Apache 2.0）；`THIRD_PARTY_NOTICES.md` 同步。
- **文档回写**：`docs/asr-models-roadmap.md` 更新阶段 2 状态、剔除 Belle-2 与 MOSS-preview-2B、记录核查中发现的 Granite Speech 5 / granite-nar / Voxtral Small-24B / Realtime 等后续候选线索。

## 能力（Capabilities）

### 新增能力

（无）

### 修改的能力

- `model-management`：目录新增 6 个条目及如实能力/语言/设备声明（新 requirement：阶段二模型目录扩展）；gated 仓库下载的失败态与引导（并入同 requirement）；新增"模型许可与署名元数据" requirement。
- `transcription-lifecycle`：新增 speech-LM 引擎行为 requirement——输入受限模型的长音频 VAD 切分与时间戳偏移、显式语言缺失的失败态、Qwen3/MOSS 引擎迁移的行为等价。

## 影响

- 代码：`backend/backends/local_asr.py`（统一引擎 + 6 个 adapter + qwen3/moss 迁移）、`backend/backends/registry.py`（条目 + license/attribution 字段）、`backend/models.py` 与 `backend/services/models.py`（`ASRModelStatus` 新字段）、下载服务（gated 失败态）。
- 依赖：`requirements-runtime.in/.lock`、`requirements-docker.in/.lock`、`requirements-windows.lock`（transformers 5.17.0 + mistral-common[audio]）；`check-versions.mjs` 与依赖审计需通过。
- 前端：模型详情（许可、plus 版限制说明）、模型天梯估算行、转写选择器语言约束（Cohere 无 auto）；typed client 同步。
- 测试：registry 测试、adapter stub 单测（沿用 `test_repetition_guardrails.py` 替身模式）、qwen3 输出预算与防幻觉既有测试保持通过（迁移等价性）、contract test（新字段）、`real_tests/` 真机验证。
- 文档：`THIRD_PARTY_NOTICES.md`、`docs/asr-models-roadmap.md`。
- 风险集中点：`requirements-windows.lock` 需在 Windows 环境按项目流程重新冻结；ARK-ASR 官方未声明 transformers 最低版本（远程代码以 4.57.6 环境导出）；Cohere 的 ModelScope 镜像非官方渠道需在实现期校验文件一致性。
