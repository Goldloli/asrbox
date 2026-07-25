# Design: add-moss-transcribe-diarize

## 背景

MOSS-Transcribe-Diarize 0.9B（HF: `OpenMOSS-Team/MOSS-Transcribe-Diarize`，Apache 2.0）是端到端音频理解模型：单次推理同时产出转写、时间戳、说话人标签（`[S01]`…），50+ 语言，单次最长约 90 分钟。架构为 Qwen3-0.6B 风格 decoder + Whisper-Medium encoder，经 `trust_remote_code=True` 以 `AutoModelForCausalLM` + `AutoProcessor` 加载。官方输出格式 `[start][Sxx]text[end]`，辅助包 `moss_transcribe_diarize`（仅 GitHub 分发，无 PyPI）提供 `build_transcription_messages` / `generate_transcription` / `parse_transcript` / `resolve_device`。

当前仓库状态：

- 本地引擎注册于 `backend/backends/local_asr.py:451` 的 `_backends` dict，catalog 硬编码于 `backend/backends/registry.py`（14 个模型）。
- 说话人分离是任务级 pyannote 后处理（`backend/services/tasks.py:938`），要求 `HF_TOKEN`，对开启了 `diarization` 选项的所有任务生效。
- 环境已满足 MOSS 硬性依赖：transformers 5.13.0.dev0（git pin）、torch 2.11.0、Python 3.13。
- 前端模型文案集中在 `app/src/lib/modelCatalog.ts`（`modelDescription()`/`modelBestFor()` 硬编码），卡片为 `app/src/components/models/ModelManagement.tsx` 的 `ModelListRow`。

## 目标 / 非目标

**目标：**

- 用户可在模型页下载 `moss-transcribe-diarize` 并用它转写，结果分段自带说话人标签，无需配置 `HF_TOKEN`。
- 引擎原生说话人标签不被 pyannote 后处理覆盖；使用 MOSS 模型时不再要求 diarization token。
- 模型下载页为每个本地模型提供详细中文/英文介绍：能力、语言覆盖、适用场景、限制。
- 兼容性检查、运行时检测、打包清单、文档同步。

**非目标：**

- 不引入 SGLang Omni / vLLM 服务化路径（仅 transformers 直接推理）。
- 不改 `ASRModelStatus` 字段与任何路由（contract 不变）。
- 不支持 MOSS 的自定义 prompt / 热词选项与声学事件标注展示（后续 change）。
- 不改动现有 14 个模型的引擎行为；详细文案仅展示层。
- 不做流式转写。

## 决策

### D1：推理走官方辅助包 + transformers 直接加载

新引擎类 `MossTranscribeDiarizeBackend`（仿 `Qwen3ASRBackend`，`backend/backends/local_asr.py`）：lazy 加载并缓存 model/processor，路径走 `_model_path()` + `local_hf_files_only()`。消息构造、生成、结果解析复用官方包 `moss_transcribe_diarize` 的 helper，不自研 `[start][Sxx]text[end]` 解析与 chat message 组装。

理由：官方包是唯一维护的 message 格式与解析实现，自研解析会与上游格式演进脱节。备选（纯 transformers 手写 message）被否：多模态 message 结构未文档化，风险高。

依赖以 git 来源 pin 进 `requirements-runtime.in` / `requirements-docker.in`（`moss-transcribe-diarize @ git+https://github.com/OpenMOSS/MOSS-Transcribe-Diarize.git@<commit>`），与现有 transformers git pin 同一模式，lock 重新生成。

### D2：`max_new_tokens` 按时长缩放

官方建议长音频调大 `max_new_tokens`（示例 65536）。默认按音频时长估算：`min(65536, max(4096, ceil(分钟数 × 800)))`，时长读取失败时回落 8192；`options["max_new_tokens"]` 可显式覆盖。理由：固定小值会截断长音频尾部转写（数据质量问题），固定 65536 则短音频生成循环开销无谓增大。

### D3：pyannote 跳过按"结果已含说话人"判定（内容驱动，非配置驱动）

`backend/services/tasks.py:938` 的 pyannote 分支前加早退：若 `result.segments` 中任一分段已有非空 `speaker`，跳过整个 pyannote 块（含 token 缺失报错）。理由：内容驱动对引擎零耦合，未来任何原生分离引擎自动受益；MOSS 标签与 pyannote 标签空间不同（`[S01]` vs `SPEAKER_xx`），二次分离只会覆盖不会增益。同时 `segment_altering_options` 的判定不受影响（分段未被 pyannote 改动时不应计入）。

### D4：catalog 条目与兼容性检查

`registry.py` 新增 `ASRModelConfig`：`engine="moss_transcribe_diarize"`、`repo_id="OpenMOSS-Team/MOSS-Transcribe-Diarize"`、`size_mb` 约 1900（bf16 权重 + processor）、`supports_timestamps=True`、`supports_diarization=True`、`allow_patterns` 必须包含 `*.py`（trust_remote_code 远程代码随快照下载）。ModelScope 候选源在实现时核实，存在则按 `source_candidates` 双源模式登记，否则仅 HuggingFace。

`services/models.py` 的 `check_model_compatibility()` 新增 engine 分支：必需文件 `config.json` + 权重（通用 `_has_weight_files`）+ processor/tokenizer 配置 + 远程代码 `.py`；运行时要求 `moss_transcribe_diarize` 可导入且 transformers >= 5。`services/platform.py` 加 `moss_transcribe_diarize_available()` 并纳入 `detect_runtime()`。

### D5：详细模型介绍留在前端本地文案（不动 API）

在 `app/src/lib/modelCatalog.ts` 增加结构化详情（tagline、capabilities、languages 详述、bestFor、limitations，中英文），`ModelListRow` 加可展开详情区展示。理由：现有 `modelDescription()`/`modelBestFor()` 就是前端本地文案模式；放后端会改 `ASRModelStatus` contract（牵动 typed client、contract test、OpenSpec api-compatibility），展示层文案不属于稳定 API。备选（后端 catalog 加字段）被否：成本与收益不匹配。

### D6：打包

`backend/build_binary.py` 的 hidden imports 增加 `moss_transcribe_diarize` 及其子模块。模型远程代码（`.py`）随模型快照存在于数据目录、运行时由 transformers 动态加载，不经 PyInstaller bundle；但 frozen binary 下动态远程代码加载需桌面启动验证确认（见风险 R2）。

## 风险 / Trade-offs

- R1：官方包仅 GitHub 分发，上游变更或删除会破坏安装 → requirements pin 具体 commit；lock 固化；兼容性检查给出可行动的报错。
- R2：frozen binary 中 `trust_remote_code` 动态加载模型目录内的 `.py` 可能受 PyInstaller import 机制影响 → 桌面启动验证覆盖；失败时兼容报错而非崩溃。
- R3：0.9B 模型 fp32 约 3.6GB 内存，CPU 推理慢（长音频可能数十分钟）→ 模型页 limitations 明确标注建议场景；device 走官方 `resolve_device("auto")`（cuda > mps > cpu）。
- R4：Python 3.13 未被官方测试（官方测 3.12）→ 聚焦测试验证；失败则报错可行动。
- R5：模型输出语言由模型自动判定，`language` 选项 v1 不生效 → UI 不为此模型暴露语言提示，文档说明。

## 回滚

纯增量：删除 catalog 条目 + `_backends` 注册行 + 依赖行即可整体下线；已下载的模型权重可由模型页删除动作清理。无持久化数据格式变更，无需迁移。
