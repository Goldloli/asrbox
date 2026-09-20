# transcription-lifecycle Delta

## ADDED Requirements

### Requirement: FunASR 新模型的时间戳与 VAD 行为

`paraformer-zh` 与 `fun-asr-nano` 的本地转写 SHALL 默认启用 VAD 长音频切分（含受维护的最大单片时长约束），任务选项 SHALL 允许覆盖该默认值。`paraformer-zh` SHALL 将模型原生字级时间戳聚合为带起止时间的句段时间轴，输出不得退化为无时间轴的整段文本；词级时间戳 SHALL NOT 透出（与目录声明一致）。`fun-asr-nano` 无原生时间戳时 SHALL 以完整文本成功产出结果，且 SHALL NOT 伪造句段时间轴。既有 SenseVoice Small 的转写行为 SHALL 保持不变（不默认启用 VAD 切分、清洗与时间轴产出与现状一致）。

#### Scenario: Paraformer 长音频产出句段时间轴

- **WHEN** 使用 `paraformer-zh` 转写超过单片时长上限的音频且未显式覆盖 VAD 选项
- **THEN** 结果按 VAD 切分转写，句段携带单调、落在音频时长内的起止时间，全文由句段文本组成

#### Scenario: 任务选项覆盖 VAD 默认值

- **WHEN** 任务选项显式设置 VAD 开关或最大单片时长
- **THEN** 引擎使用任务提供的值而非默认值

#### Scenario: Fun-ASR-Nano 不伪造时间轴

- **WHEN** 使用 `fun-asr-nano` 转写音频
- **THEN** 任务成功完成、全文完整，时间轴呈现方式与模型真实输出一致，不出现虚构的句段起止时间

#### Scenario: SenseVoice 行为不回归

- **WHEN** 使用既有 SenseVoice Small 模型转写
- **THEN** 转写行为与本变更前一致：不默认启用 VAD 切分，文本清洗与结果结构与现状相同
