# fix-qwen3-asr-output-cap delta: transcription-lifecycle

## ADDED Requirements

### Requirement: Duration-aware Qwen3-ASR output budget
Qwen3-ASR 本地转写的 `max_new_tokens` 上限 SHALL 默认按输入音频时长自适应（每分钟至少 320 token、下限 1024、上限 8192），不得使用会导致长音频静默截断的固定默认值；任务选项显式设置 `max_new_tokens` 时 SHALL 使用用户提供的值。

#### Scenario: 长音频默认不被截断
- **WHEN** 使用 Qwen3-ASR 转写转写内容超过 512 token 的音频且未显式设置 `max_new_tokens`
- **THEN** 输出按完整转写内容生成，不因固定 512 token 上限在中途截断

#### Scenario: 显式上限优先
- **WHEN** 任务选项显式设置 `max_new_tokens`
- **THEN** 引擎使用该值而非时长自适应默认值

#### Scenario: 上限有界
- **WHEN** 输入音频极长
- **THEN** 默认 `max_new_tokens` 不超过 8192，防止显存与耗时失控
