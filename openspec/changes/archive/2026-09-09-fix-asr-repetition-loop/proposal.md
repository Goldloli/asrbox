# fix-asr-repetition-loop

## 为什么

本地转写英文视频时，结果中出现两大段各连续两百余次的 `par par par ...` 重复单字块。根因是 Whisper 系本地引擎（faster-whisper / mlx-whisper / transformers-whisper）全部以裸默认参数解码：`condition_on_previous_text` 默认为 `True`，且未设置任何重复抑制参数（`no_repeat_ngram_size`、`repetition_penalty`、`hallucination_silence_threshold`）。一旦某个 30 秒解码窗口在静音/音乐/低质量音频段触发幻觉重复，该文本会作为 prompt 自我强化地延续到 chunk（2 分钟）边界，与用户观察到的"两大段"精确吻合。下游 postprocess 与质量检测（`quality.py` 的 `REPETITIVE_TRANSCRIPT` 按字符统计，英文词级重复永远达不到 0.45 阈值）均无法拦截。

## 变更内容

- Whisper 系本地引擎默认启用防幻觉解码参数：`condition_on_previous_text=False`（faster-whisper、mlx-whisper），`no_repeat_ngram_size=3` 与 `repetition_penalty`（faster-whisper、transformers-whisper），faster-whisper 增加 `hallucination_silence_threshold`；均保留 `options_json` 覆盖入口。
- `postprocess.process_segments` 增加重复折叠兜底：同一 token（空格分词为词、CJK 为字）连续重复超过阈值（默认 ≥6 次）时折叠为保留 2 次，折叠行为跨引擎生效且不改变时间轴。
- `quality.analyze` 的 `REPETITIVE_TRANSCRIPT` 检测扩展为同时按词（空格分词）统计，使英文词级重复也能产生质量警告。

## 能力（Capabilities）

### Modified Capabilities

- `transcription-lifecycle`: 新增 requirement——本地 Whisper 系引擎的转写结果 SHALL 具备重复幻觉防护（解码参数默认值 + postprocess 折叠兜底 + 质量检测覆盖英文词级重复）。

## 影响

- `backend/backends/local_asr.py`：FasterWhisper / MLXWhisper / TransformersWhisper 三个 backend 的转写 kwargs 默认值。
- `backend/services/postprocess.py`：`process_segments` 增加重复折叠步骤。
- `backend/services/quality.py`：`REPETITIVE_TRANSCRIPT` 检测逻辑。
- 测试：`backend/tests/` 新增/扩展针对三个 backend 传参、postprocess 折叠、quality 英文重复检测的用例。
- 无 API contract、持久化数据、依赖变化；`options_json` 协议兼容（新 key 可透传覆盖）。
