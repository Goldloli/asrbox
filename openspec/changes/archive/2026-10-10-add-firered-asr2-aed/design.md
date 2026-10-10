# Design: add-firered-asr2-aed

## 背景

- 引擎注册与分发：`backend/backends/registry.py`（`ASRModelConfig` + `get_all_model_configs`）、`backend/backends/local_asr.py`（`_backends` dict + `get_backend`）。speech-LM 引擎的 adapter 架构（`BaseSpeechLMAdapter.transcribe_chunked` + `_plan_speech_lm_chunks` + `_fsmn_vad_speech_spans`）是时长受限模型 VAD 切分的现成模式；Paraformer 的 `_paraformer_segments`（local_asr.py:181-233）是字级时间戳聚合句段的先例。
- FireRedASR2S 官方仓库（Apache-2.0）：AED 推理核心为 `fireredasr2/asr.py`（`FireRedAsr2.from_pretrained("aed", dir, config)` + `transcribe(batch_uttid, batch_wav_path)`，wav 参数支持 `(sample_rate, ndarray)` 元组）、`data/asr_feat.py`（fbank+CMVN）、`models/`（Conformer encoder + Transformer decoder + CTC）、`tokenizer/aed_tokenizer.py`（中文单字 + 英文 SPM）。输出 dict：`text`（小写）、`confidence`、`dur_s`、`timestamp: [[token, start, end], ...]`（上游已做 60ms 前移修正与边界修补）。
- 上游 fbank 用 `kaldi_native_fbank`：PyPI 无 Windows wheel（已核实），macOS arm64 有。ASRbox 支持 Windows 桌面端 → 不能作为运行时依赖。
- 依赖现状（requirements-runtime.lock）：kaldiio 2.18.1 ✓、sentencepiece 0.2.1 ✓、soundfile ✓、torchaudio ✓、torch ✓。
- 模型仓库文件（HF/ModelScope 已核实）：`cmvn.ark`、`config.yaml`、`dict.txt`、`model.pth.tar`、`train_bpe1000.model`，无 `.py` 远程代码，非 gated，Apache-2.0。
- 模型限制（官方 FAQ）：AED 单次输入 ≤60s（更长会幻觉，>200s 位置编码报错）。

## 目标

- `firered-asr2-aed` 进入目录并可经 backend 真实路径转写，长音频自动 VAD 切分，词级时间戳聚合句段并透出。
- 零新增 Python 依赖；Windows 无 wheel 的上游特征库被 torchaudio 等价替代。
- vendored 代码最小、可追溯（来源 commit、许可、改动点明确）。

## 非目标

- 不引入 FireRedASR2-LLM、FireRedVAD/LID/Punc 独立模块（VAD 复用既有 fsmn-vad；标点为模型原生输出，不外加 Punc 模型）。
- 不实现通用对齐后处理（阶段 3 Part B，独立 change）。
- 不改 `TranscriptionResult` 契约、API、事件或持久化。

## 决策

### 1. torchaudio.compliance.kaldi.fbank 替代 kaldi_native_fbank

`torchaudio.compliance.kaldi` 是 PyTorch 官方的 Kaldi 特征兼容实现（fbank 支持 num_mel_bins/frame_length/frame_shift/dither/snip_edges 全部对齐参数），torchaudio 已是运行时依赖且冻结包已含。备选：a) 平台分支（macOS 用 knf、Windows 用替代）——双路径特征发散风险更高且 knf 仍会进 macOS lock；b) 自写 numpy fbank——重复造轮子。替代后特征等价性由真实模型验证兜底（中英样本输出合理即为通过标准；log-mel 的常数级差异会被 CMVN 吸收）。上游 `KaldifeatFbank` 调用点集中在 `asr_feat.py` 一处，替换面小。

### 2. vendored 位置与裁剪

`backend/vendor/fireredasr2/`，包内相对导入改为相对（上游即相对导入），文件级改动仅 `data/asr_feat.py`（fbank 实现）与 `asr.py`（删除 LLM/ELM 分支与相关 import）。每个文件保留上游版权头，包级 `__init__.py` 或 README 记录来源仓库、commit、Apache-2.0 与本地改动清单。剔除：llm/lstm 模型、llm_tokenizer、utils/io.py（textgrid 依赖）、speech2text.py（CLI）、fireredlid/fireredvad/fireredpunc 整目录。

### 3. 引擎复用 VAD 切分与时间戳偏移

不进 `transformers_speech_lm`（非 transformers 模型）。`FireRedASRBackend` 直接复用 `_fsmn_vad_speech_spans` 与 `_plan_speech_lm_chunks` 的切分算法（把 chunk 规划函数抽出共用或按同样语义实现，窗口上限 59s < 官方 60s），逐块以 `(16000, float32 ndarray)` 元组传给 `FireRedAsr2.transcribe`（上游 feat 提取器原生支持元组输入，无需临时文件），时间戳 + 块起点偏移。词→句段聚合沿用 `_paraformer_segments` 的 flush 语义（按标点/长度/时长断句）。

### 4. registry 条目与完整性检查

`allow_patterns` 显式 5 文件（ModelScope 下载忽略 patterns、HF 备源按 patterns 拉，遵循 Paraformer 先例注释）；`required_files` 同列表；`size_mb=4400` 如实；`supported_devices=["cpu","cuda"]`；`supports_timestamps=True, supports_word_timestamps=True`；`license="Apache-2.0"`；源候选 ModelScope `xukaituo/FireRedASR2-AED` 主 + HF `FireRedTeam/FireRedASR2-AED` 备。

### 5. 探针与打包

`backend/services/platform.py` 增加 `firered_asr_available`（import `backend.vendor.fireredasr2.asr` 成功 + torch/torchaudio 就绪），接入 runtime_probe_snapshot 与模型状态文案（platform.py:253 附近模式）。`backend/build_binary.py` hidden imports 增加 vendored 子模块（Conformer/decoder/ctc/tokenizer/data 均为动态 import 风险点）+ 打包静态断言测试。

## 风险

- **特征等价性**：torchaudio 与 knf 的 fbank 数值差异若超出 CMVN 吸收范围，输出质量下降——以真实模型验证为发布门禁；若验证失败，回退方案是接受 macOS-only（knf 有 arm64 wheel）并把 Windows 标记为不支持，此为最后手段。
- **torch.load 权重加载**：`model.pth.tar` 以 torch.load 载入，torch 2.6+ 默认 `weights_only=True` 可能拒载含非张量对象的 checkpoint——加载处显式 `weights_only=False`（本地受信文件，风险可控）或按异常回退。
- **4.4GB 体积**：如实展示 size_mb，不夸大不隐藏。
- **上游仅测 Linux**：macOS 真机验证背书 + Windows CI 冻结探针断言。

## 回滚

删除 `backend/vendor/fireredasr2/` 与引擎/registry/探针/打包改动即可整体回滚；无数据迁移、无 API 变化。已下载模型目录为用户数据，不受回滚影响。
