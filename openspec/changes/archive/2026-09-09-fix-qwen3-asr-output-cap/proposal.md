# fix-qwen3-asr-output-cap

## 为什么

`Qwen3ASRBackend` 的 `max_new_tokens` 默认写死为 512（`backend/backends/local_asr.py:410`）。实测 5:43 英文音频默认输出正好生成 509 个 token 后被硬截断（2401 字符 vs 提高到 2048 后的 5950 字符，与 Whisper 系引擎一致）。这是确定性行为：任何转写内容超过 ~512 token 的输入都会静默丢失结尾。生产管线按 2 分钟分块，一块正常语速约 450-500 token，语速快或信息密度高的块会越过上限静默截断。

## 变更内容

- `Qwen3ASRBackend` 的 `max_new_tokens` 默认值改为按音频时长自适应：`max(1024, ceil(分钟数 × 320))`，上限 8192；`max_new_tokens` 任务选项仍可显式覆盖（**行为变更**：默认值不再是 512）。

## 能力（Capabilities）

### Modified Capabilities

- `transcription-lifecycle`: 新增 requirement——Qwen3-ASR 本地转写的输出长度上限 SHALL 随输入音频时长自适应，长音频不得因固定 token 上限被静默截断。

## 影响

- `backend/backends/local_asr.py`：`Qwen3ASRBackend.transcribe` 的 `max_new_tokens` 默认值计算（复用已加载的 16kHz 音频数组求时长，不引入新依赖）。
- 测试：`backend/tests/test_repetition_guardrails.py` 或新文件中断言默认值随时长缩放、显式覆盖仍生效。
- 无 API contract、持久化数据、依赖变化。
