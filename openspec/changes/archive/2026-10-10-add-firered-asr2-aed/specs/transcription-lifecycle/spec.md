# transcription-lifecycle Delta

## ADDED Requirements

### Requirement: FireRedASR AED 引擎行为

`firered_asr` 引擎 SHALL 以 vendored 最小推理集（上游 Apache-2.0 代码，特征提取使用 torchaudio 的 Kaldi 兼容 fbank 替代无 Windows 构建的 kaldi_native_fbank，参数与上游对齐：80 mel、25ms/10ms、snip_edges、推理零 dither）执行推理，不引入新的 Python 依赖。加载设备 SHALL 按 registry 声明的设备集合显式选择（无 CUDA 时 CPU），不得经 `device_map="auto"` 落到 MPS。模型原生词级时间戳与置信度 SHALL 聚合为句段 `TranscriptSegment`（时间戳含上游 60ms 前移修正），词级数据 SHALL 随结果透出；时间轴经 VAD 块偏移后 SHALL 单调且覆盖全部语音块。fbank 替换的特征等价性 SHALL 由真实模型转写验证（中英样本文字与时间戳合理）后方可发布。

#### Scenario: fbank 提取参数对齐上游
- **WHEN** vendored 引擎提取音频特征
- **THEN** 使用 torchaudio.compliance.kaldi.fbank 且参数与上游 kaldi_native_fbank 配置一致（80 mel bins、frame 25ms/10ms、snip_edges=True、dither=0），CMVN 从模型目录 `cmvn.ark` 读取并应用

#### Scenario: 词级时间戳聚合为句段
- **WHEN** 模型对单个语音块返回带词级时间戳的假设
- **THEN** 词级时间戳按句读聚合成句段时间轴（沿用既有 Paraformer 聚合先例），句段时间轴随块偏移保持全局连续，词级数据保留在结果的 words 字段

#### Scenario: 真实模型验证门禁
- **WHEN** 该引擎或 vendored 代码发生变更
- **THEN** 经 backend 真实分发路径的真实模型转写（`ASRBOX_RUN_REAL_MODELS=1` 门禁）须通过，冻结二进制上 `firered_asr_available` 探针为 true 且至少一条真实转写跑通
