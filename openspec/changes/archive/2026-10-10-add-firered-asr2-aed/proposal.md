# add-firered-asr2-aed

## 为什么

[docs/asr-models-roadmap.md](../../../docs/asr-models-roadmap.md) 阶段 3 的引擎部分：FireRedASR2-AED 1.1B 是中文公开基准第一的开放模型（AISHELL-1 CER 0.57%，普通话 4 集均值 3.05%，超过 Qwen3-ASR-1.7B 与 Fun-ASR），自带词级时间戳与置信度，权重与推理代码均为 Apache-2.0（2026-02-12 发布，已核实 HF 卡 `license:apache-2.0` 与 GitHub LICENSE）。本地目录目前缺少这一精度档位。阶段 3 的通用对齐后处理（Qwen3-ForcedAligner）在后续独立 change 落地，两个 change 共同构成路线图阶段 3。

## 变更内容

- **Vendored 最小推理集**：从 [FireRedTeam/FireRedASR2S](https://github.com/FireRedTeam/FireRedASR2S)（Apache-2.0）引入 AED 推理所需最小 Python 集（约 11 个文件，剔除 LLM/LID/VAD/Punc/CLI/textgrid 输出），置于 `backend/vendor/fireredasr2/`，保留上游版权头并记录来源 commit。
- **fbank 提取替换**：上游 `kaldi_native_fbank` 无 Windows wheel（已核实 PyPI：macOS arm64 有、win_amd64 无），vendored 代码的特征提取改为 `torchaudio.compliance.kaldi.fbank`（Kaldi 兼容实现，torchaudio 已是运行时依赖），参数对齐上游（80 mel、25/10ms、snip_edges=True、推理 dither=0）；CMVN 读取沿用 `kaldiio`（已在 lock）。**不引入任何新依赖**。
- **新引擎 `firered_asr`**：`backend/backends/local_asr.py` 新增 `FireRedASRBackend`——加载 vendored `FireRedAsr2`（beam 3、return_timestamp），设备按 cuda→cpu 显式选择（registry 不声明 mps，禁止 device_map 落 MPS）；AED 单次输入上限 60s，长音频经既有 `fsmn-vad` 切分（≤59s 窗口）并按块起点偏移时间戳（沿用阶段 1/2 模式）；词级时间戳聚合成句段 `TranscriptSegment`（沿用 Paraformer 字级聚合先例），词级数据透出。
- **模型目录新增 `firered-asr2-aed`**：ModelScope 主源 `xukaituo/FireRedASR2-AED` + HF 备源 `FireRedTeam/FireRedASR2-AED`（均 Apache-2.0、非 gated）；`allow_patterns`/`required_files` 显式列 5 个权重侧文件（cmvn.ark、config.yaml、dict.txt、model.pth.tar、train_bpe1000.model）；能力如实声明：zh/en（含语码切换），词级时间戳 ✓，说话人 ✗，流式 ✗，cpu/cuda。
- **运行时探针**：`firered_asr_available`（vendored 包导入 + torchaudio/kaldiio/sentencepiece 就绪），模型详情缺失时给出可读提示；`backend/build_binary.py` hidden imports 覆盖 vendored 模块；冻结路径测试与打包静态断言同步。
- **许可与署名**：`THIRD_PARTY_NOTICES.md` 记录 FireRedASR2S 代码（Apache-2.0，来源 URL + commit）与模型权重（Apache-2.0）。
- **真机验证**：下载真实模型（约 4.4GB），经 backend 真实分发路径转写中英样本，确认文字与词级时间戳合理（fbank 替换的特征等价性验证）；记录写入 `backend/real_tests/results/`。

## 能力（Capabilities）

### 新增能力

（无）

### 修改的能力

- `model-management`：目录新增 `firered-asr2-aed` 条目及能力/语言/设备/许可声明；新 runtime 探针 `firered_asr_available`。
- `transcription-lifecycle`：新引擎行为 requirement——AED 60s 输入上限的 VAD 切分与时间戳偏移、词级时间戳聚合、设备显式选择。

## 影响

- 代码：`backend/vendor/fireredasr2/`（新增）、`backend/backends/local_asr.py`、`backend/backends/registry.py`、`backend/services/platform.py`（探针）、`backend/build_binary.py`、`THIRD_PARTY_NOTICES.md`。
- 依赖：零新增（torchaudio/kaldiio/sentencepiece 均已在 lock）。
- 测试：registry 断言、引擎 stub 单测（沿用 `test_repetition_guardrails.py` 替身模式）、分发路径行为测试、探针测试；`backend/real_tests/` 真机验证（`ASRBOX_RUN_REAL_MODELS=1` 门禁）。
- 风险：torchaudio fbank 与 kaldi_native_fbank 的特征等价性——以真实模型转写质量验证；模型 4.4GB 体积如实展示；上游代码仅官方测试过 Linux（macOS/Windows 上的兼容性由本项目真机验证背书）。
