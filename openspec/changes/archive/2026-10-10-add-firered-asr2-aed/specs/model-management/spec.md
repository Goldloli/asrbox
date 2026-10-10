# model-management Delta

## ADDED Requirements

### Requirement: 阶段三 FireRedASR2 模型条目

本地模型目录 SHALL 新增 `firered-asr2-aed`（FireRedASR2 AED 1.1B，独立 `firered_asr` 引擎），沿用既有下载生命周期、状态判定与能力事实展示。能力与语言声明 SHALL 如实：词级时间戳由模型原生输出并聚合为句段时间轴、不支持原生说话人分离、不支持流式；语言覆盖为中文（普通话及训练方言）与英文（含中英语码切换）；支持 CPU 与 CUDA（registry 不声明 MPS，加载设备按声明集合显式选择）。条目 SHALL 通过受维护的源候选下载：ModelScope 主源 `xukaituo/FireRedASR2-AED`、Hugging Face 备源 `FireRedTeam/FireRedASR2-AED`（均非 gated，Apache-2.0），完整性检查 SHALL 按该仓库实际文件集（`cmvn.ark`、`config.yaml`、`dict.txt`、`model.pth.tar`、`train_bpe1000.model`）声明必需文件，不假设通用 tokenizer 文件组。vendored 推理代码与模型权重的许可（均为 Apache-2.0）及来源 SHALL 记录于第三方声明文档。

#### Scenario: 用户下载并使用 FireRedASR2 AED
- **WHEN** 用户从模型目录下载 `firered-asr2-aed` 并以该模型转写中英音频
- **THEN** 下载经 ModelScope 主源（备源 HF）完成并校验必需文件；转写输出带词级时间戳聚合的句段时间轴，CPU 或 CUDA 按可用性显式选择，不落到未声明的 MPS

#### Scenario: 运行时缺少 FireRedASR 依赖
- **WHEN** 当前运行时无法导入 vendored FireRedASR 推理代码或其依赖（torchaudio/kaldiio/sentencepiece）
- **THEN** 模型状态呈现 `firered_asr_available` 探针缺失的本地化提示，不静默把模型显示为可用，也不在执行时才崩溃

#### Scenario: 长音频转写
- **WHEN** 音频超过 AED 单次 60 秒输入上限
- **THEN** 系统经 fsmn-vad 切分为不超过上限的语音块逐块转写，时间戳按块起点偏移后合并为连续时间轴；VAD 不可用时给出可操作错误而不是幻觉输出
