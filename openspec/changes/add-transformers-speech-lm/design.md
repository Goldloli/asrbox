# add-transformers-speech-lm — 设计

## 背景

- `backend/backends/local_asr.py:533`（`Qwen3ASRBackend`）与 `:639`（`MossTranscribeDiarizeBackend`）各自实现"懒加载 processor/model → 构造输入 → generate → 解析输出"，加载缓存、device/dtype 处理、输出预算（`_qwen_language`、`_moss_max_new_tokens`）互为副本；`backend/backends/registry.py` 每个 engine 对应一个 backend 类。
- transformers 当前 pin 在 git commit `09835700`，经查证内容上等于 v5.13.0（Qwen3-ASR 首个 release，2026-07-03）；最新 stable 为 5.17.0（2026-09-09）。约束核对：`moss-transcribe-diarize` 包声明 `transformers>=5.6.0,<6.0.0`；transformers 5.17 要求 `torch>=2.5`（现有 2.11.0 满足）。
- 候选模型事实核查（2026-09-20，HF API / model card / transformers 仓库 tag 交叉验证）结论见 proposal「为什么」。关键实现事实：
  - Granite Speech 4.1 base/plus 均为 transformers 原生 API（`AutoModelForSpeechSeq2Seq` + `AutoProcessor`），plus 的词级时间戳是输出文本中的 `[T:N]` 厘秒标签（mod 1000，10 秒回绕，需 unwrap），说话人归属是 `[Speaker N]:` 轮次标签，时间戳模式官方上限 ~3.5 分钟、ASR/SAA ~9 分钟；
  - Cohere Transcribe 2B 为 `CohereAsrForConditionalGeneration`（transformers ≥5.4 原生），无语种检测（必须显式传 language），二手来源称单 clip ~35 秒；HF 仓库 `gated=auto`，ModelScope 存在同名镜像；
  - ARK-ASR 两档走 `trust_remote_code`（`AutoModelForCausalLM` + 自定义 `processing/modeling`），config 内 `max_whisper_length: 1500`（30 秒），官方未声明 transformers 下限（导出环境 4.57.6）；
  - Voxtral Mini 3B（`mistralai/Voxtral-Mini-3B-2507`）transformers ≥4.54 原生，processor 需要 `mistral-common[audio]>=1.8.1`，单遍转写上限 30 分钟。
- 阶段 1 已建立的先例：fsmn-vad 切分长音频（FunASR 系）、按模型轻量 adapter（`_clean_sensevoice_text` 特化的反面）、`required_files` 完整性校验、ModelScope 主源 + HF 镜像的 `source_candidates` 模式。

## 目标 / 非目标

**目标：**

- speech-LM 类模型"registry 条目 + adapter"即可接入，不再复制 backend 类；
- transformers 升到受维护的 PyPI 版本并全平台 lock 同步；
- 六个新模型的能力事实、下载、长音频行为、许可信息全部走既有受维护机制，无新 API 路由。

**非目标：**

- 不引入新的重量级 runtime（无 vLLM/TensorRT/新推理框架）；mistral-common 是轻量纯 Python 依赖；
- 不做全局 HF token 下载通道（gated 处理只覆盖失败态与引导，token 化下载留待真实需求）；
- 不改变受维护路由与 `TranscriptionResult` 契约字段语义；
- 不在本波引入 CC-BY-4.0 模型（署名只铺数据与展示管道）；
- 不做流式/实时转写（Voxtral Realtime、Kyutai 等仍在排除项）；
- 不评估 Granite Speech 5、granite-nar、Voxtral Small 24B（记录到 roadmap 后续线索）。

## 决策

### 1. 统一引擎：adapter 协议 + 共享核心

新增 `TransformersSpeechLMBackend`（engine id `transformers_speech_lm`），核心负责：懒加载与缓存（`local_hf_files_only` 语境下的 processor/model 加载、device_map/dtype 回退）、VAD 切分循环、时长感知输出预算、重复幻觉护栏、时间戳偏移与合并。每模型一个 adapter 对象，声明：

- `load()`：模型类与加载参数（原生类 / `trust_remote_code`）；
- `build_inputs(processor, audio, options)`：prompt/输入构造（含语言注入策略）；
- `parse_output(processor, output, chunk_offset)`：输出解析（含 Granite plus 标签 unwrap、MOSS `parse_transcript`）；
- 声明式能力：`max_chunk_seconds`（None = 不切分）、`requires_explicit_language`、输出预算系数。

备选：保留每模型 backend 类（拒绝：重复随模型数线性增长，正是本阶段要消除的）；backend 基类继承（拒绝：加载顺序与设备处理的模板方法耦合，adapter 数据+函数组合更易 stub 单测，沿用 `test_repetition_guardrails.py` 替身模式）。

`qwen3-asr-*` 与 `moss-transcribe-diarize` 的 registry `engine` 字段迁移为 `transformers_speech_lm`，原 backend 类删除；`raw_result_summary` 记 `{"engine": "transformers_speech_lm", "adapter": "qwen3_asr"}` 形态。迁移保持可观察行为不变（见 specs：迁移等价 scenario），既有 `test_qwen3_output_budget.py`、`test_repetition_guardrails.py` 断言不动。

### 2. transformers 升级：PyPI `5.17.0`

从 git commit pin 改为 `transformers==5.17.0`（`requirements-runtime.in`、`requirements-docker.in`），重新生成对应 lock，`requirements-windows.lock` 按项目流程在 Windows 环境同步冻结。理由：git pin 内容即 v5.13.0，PyPI 版本等价且可复现；5.15.0 携带 Qwen3-ASR hotword/语言解析修复与 Whisper `max_new_tokens` 修复，5.16.0 携带四项 Whisper 修复；本批模型需求（≥4.54 / ≥5.4 / ≥5.8）全部覆盖；MOSS 包上界 `<6.0.0` 满足。备选：仅升到 5.8（拒绝：错过修复且会再次 churn）；继续 git pin v5.17.0 tag（拒绝：lock 复杂度无收益）。5.15–5.17 的 breaking（T5 SDPA 默认、cache 裁剪仅负值、TP API）与现有引擎路径无交集，以全量后端测试兜底。

### 3. 模型取舍：6 进 2 出

- 剔除 Belle-2：核查证明"Qwen3-ASR 底座的 Belle-2"不存在（`BELLE-2` org 为 Whisper 中文微调系列，2024 年产物），前提不成立；
- 剔除 MOSS-Transcribe-preview-2B：仅英语、`trust_remote_code`、无输出时间戳与说话人能力证明，对中文为主的产品无边际价值（英文提速已有 Distil-Whisper，时间戳+说话人已有 MOSS-Diarize）；
- 保留 ARK-ASR（中英 + 17 语种，接受 remote-code 集成成本）与 Voxtral Mini（原生 API + 30 分钟单遍，接受 mistral-common 依赖与 9.4 GB 体积，能力如实标注无中文）。

### 4. 长音频切分与时间戳偏移

复用阶段 1 的 fsmn-vad 路径：声明 `max_chunk_seconds` 的 adapter 默认启用 VAD 并收紧 `max_single_segment_time`；逐块转写后句段/词级时间戳统一加块起点偏移，多块合并保持单调。各模型上限：Cohere ~35s（二手来源，实现期以真机与 processor 官方 chunking 行为校准）、ARK 30s、Granite plus 按模式 3.5min/9min（取保守值统一按时间戳模式 3.5min 切分）、Voxtral 30min；Granite base 与 Qwen3/MOSS 维持现状不切。VAD 不可用时对"必须切分"的模型报可操作错误，不静默截断（对应 specs scenario）。

### 5. gated 仓库：镜像主源 + 明确失败态

`cohere-transcribe-2b` 的 `source_candidates`：ModelScope 镜像 priority 0 + HF priority 10。HF 源 401/403 映射为新机器可读原因码（如 `GATED_REPO_ACCESS`），UI 本地化描述并引导到"需在模型平台获得该仓库访问授权"；不静默重试、不伪装网络错误。镜像真实性以 `required_files`/分片大小抽查校验（沿用 `required_files` 机制）。备选：实现 HF token 下载通道（拒绝：本波唯一 gated 模型有镜像可用，token 管理是独立的产品决策，列为非目标）。

### 6. ARK-ASR 的 `trust_remote_code` 路径

沿用 MOSS-Diarize 先例：pin 仓库 + `allow_patterns`（`HF_ASR_ALLOW_PATTERNS` 已含 `*.py`）+ `required_files` 校验，加载经 `AutoModelForCausalLM(trust_remote_code=True)`。风险见下；条目级回滚独立可行。

### 7. Voxtral 的 `mistral-common[audio]` 依赖

加入 `requirements-runtime.in`（全平台共享，纯 Python 轻量，audio extra 的 torchaudio 需求已被现有依赖覆盖），随 lock 同步与依赖审计。备选：仅 Docker/server 安装（拒绝：桌面 catalog 条目与运行时不一致会造成假兼容）。

### 8. 许可与署名元数据管道

`ASRModelConfig` 新增 `license: str` 与 `attribution: str | None`；`ASRModelStatus` 同步暴露两字段（`backend/models.py:68` 响应模型、`backend/services/models.py:502` 映射、typed client、`test_contract.py` 断言字段存在）。UI 详情渲染许可，声明了 `attribution` 的条目渲染署名块——阶段 4 引入 CC-BY-4.0 模型时只需填数据。既有散落在前端硬编码的许可文案迁移为消费该字段。

### 9. 语言策略

adapter 声明 `requires_explicit_language`（仅 Cohere）。引擎在语言缺失或 auto 时抛机器可读错误（`LANGUAGE_REQUIRED` 类原因码），任务层映射为失败态 + 本地化引导；Qwen3 维持现有 auto→省略 参数行为；ARK/Voxtral 语种跟随音频，语言选项不传给模型。

### 10. 实现期发现与修正（2026-09-20）

- **Granite plus 的说话人与时间戳是互斥 prompt 模式**（model card 核实）：adapter 按任务 `word_timestamps` 选项切换——默认 SAA 模式输出说话人轮次（时间轴近似），开启选项后切 TS 模式输出词级时间轴。spec delta 已同步该语义。
- **transformers 5.17 的 `granite_speech_plus` 在 MPS 上存在 projector 形状错位 bug**（`device_map="auto"` 在 Apple Silicon 上选中 mps 后推理崩溃，CPU 正常）：统一引擎的 native 加载在无 CUDA 时强制 `device_map="cpu"`，与目录 cpu/cuda 声明一致；MPS 待上游修复后另行评估。
- **ModelScope 镜像实测可用**：granite plus 已从 ModelScope 同名镜像完整下载并推理成功，验证了"镜像主源"策略。
- **huggingface_hub 1.x 经 hf-mirror.com 的 HEAD resolve 不稳定**（本机网络下 ARK 快照下载反复失败，curl GET 正常）：仅影响本机手动取权重，不影响应用内下载路径（ModelScope 官方 API + HF 官方端点）；ARK 冒烟权重改用 curl 逐文件获取完成。

## 风险

- [Windows lock 冻结依赖外部环境] → `requirements-windows.lock` 必须在 Windows + Python 3.14 环境按项目流程重新冻结并跑全量测试后合入；无法本地完成时明确报告未验证项，不得手工拼 lock。
- [ARK-ASR 官方未声明 transformers 下限，remote code 在 5.17 上未经官方验证] → 实现期先跑真机 smoke（加载 + 30s 内样例），失败则该条目从本波剔除并回写 roadmap，不影响其余条目。
- [Cohere 35 秒上限来自二手来源] → 实现期以 processor 官方 chunking 行为与真机长音频实测校准切分参数；宁紧勿松。
- [ModelScope 镜像非官方渠道] → `required_files` + 分片大小校验 + registry `verified` 标志；异常时降级为 HF-only 并暴露 gated 失败态。
- [transformers 5.15–5.17 行为变化] → 全量后端测试 + 契约测试；Whisper/Qwen3 路径有既有测试护栏。
- [4.2–9.4 GB 下载体积] → 目录如实标注 `size_mb`（既有机制），无额外措施。
- [MPS 路径未验证] → 六个条目仅声明 cpu/cuda；真机验证通过后另行扩 mps（不属本 change）。
- [Granite plus 厘秒标签回绕解析错误会破坏词级时间轴] → unwrap 逻辑单测覆盖回绕与多块合并边界；real_tests 校验单调性。

## 回滚

- 条目级：每个新条目是 registry 中的独立 `ASRModelConfig`，删除条目即完全回滚该模型，无持久化残留（模型文件在用户模型目录，走既有删除生命周期）。
- 引擎级：qwen3/moss 迁移与旧类删除在同一 commit 边界内，revert 即恢复原 backend；registry `engine` 字段随之回退。
- 依赖级：transformers pin 回 git commit `09835700`（内容等于 v5.13.0）并成对恢复两平台 lock；mistral-common 移除只影响 voxtral 条目。
