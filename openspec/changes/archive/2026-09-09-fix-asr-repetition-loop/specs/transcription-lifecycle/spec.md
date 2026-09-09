# fix-asr-repetition-loop delta: transcription-lifecycle

## ADDED Requirements

### Requirement: Repetition hallucination guardrails
本地 Whisper 系引擎（faster-whisper、mlx-whisper、transformers-whisper）的转写 SHALL 默认启用防幻觉重复解码：不将上一解码窗口文本作为后续窗口的 prompt，并启用重复抑制参数；任务级选项 SHALL 允许覆盖这些默认值。转写后处理 SHALL 折叠同一 token 的超长连续重复（默认连续 ≥6 次折叠为保留 2 次），且该折叠不得改变 segment 的时间轴与数量。质量报告 SHALL 同时按字符与按词检测重复文本，使英文词级重复也能产生重复警告。

#### Scenario: Whisper 引擎默认阻断重复循环
- **WHEN** 使用 faster-whisper、mlx-whisper 或 transformers-whisper 本地模型转写且任务未显式设置解码覆盖项
- **THEN** 引擎以 `condition_on_previous_text=False` 及重复抑制参数解码，单个 chunk 内不产生跨窗口自我强化的重复文本

#### Scenario: 任务选项可覆盖防幻觉默认值
- **WHEN** 任务选项中显式设置了 `condition_on_previous_text`、`no_repeat_ngram_size`、`repetition_penalty` 或 `hallucination_silence_threshold`
- **THEN** 引擎使用任务提供的值而非内置默认值

#### Scenario: 后处理折叠超长重复
- **WHEN** 任一引擎返回的 segment 文本中同一 token 连续重复达到折叠阈值
- **THEN** 后处理将该重复折叠为保留 2 次，segment 的时间轴、speaker 与数量保持不变

#### Scenario: 短重复不受影响
- **WHEN** segment 文本中同一 token 连续重复次数低于折叠阈值（如正常强调 "very, very"）
- **THEN** 后处理保持原文不变

#### Scenario: 英文词级重复触发质量警告
- **WHEN** 转写文本中某一空格分词后的词占全部词数的比例超过重复阈值
- **THEN** 质量报告暴露 `REPETITIVE_TRANSCRIPT` 警告，与既有中文字符级检测一致
