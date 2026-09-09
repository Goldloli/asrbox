# fix-asr-repetition-loop 设计

## 背景

参见 proposal.md 的"为什么"。关键现状：

- `backend/backends/local_asr.py` 三个 Whisper 系 backend 的转写调用均为裸默认参数：
  - `FasterWhisperBackend.transcribe`（local_asr.py:213-221）：kwargs 只有 `vad_filter` / `word_timestamps` / `language`；faster-whisper 默认 `condition_on_previous_text=True`、`no_repeat_ngram_size=0`、`repetition_penalty=1.0`、`hallucination_silence_threshold=None`。
  - `MLXWhisperBackend.transcribe`（local_asr.py:321-325）：kwargs 只有 `language`；mlx-whisper 同样默认 `condition_on_previous_text=True`。
  - `TransformersWhisperBackend.transcribe`（local_asr.py:153-161）：`generate_kwargs` 只有 `language`；HF Whisper greedy 解码无重复抑制。
- 本地任务 >2 分钟按 2 分钟窗口 + 2 秒重叠切块（`backend/services/tasks.py:51-53`），拼接逻辑（`_combine_local_worker_results`）只删不增，已排除为重复来源。
- `backend/services/postprocess.py` 的 `process_segments` 只做空白/标点清洗、短句合并、长句切分，无重复检测。
- `backend/services/quality.py:19-24` 的 `REPETITIVE_TRANSCRIPT` 按字符统计：`"par par par ..."` 中各字符占比约 25%，永远到不了 0.45 阈值，英文词级重复不产生任何警告。
- options 经 `options_json` 透传到 worker 子进程，新增 option key 协议兼容，无需改 API contract。

## 目标 / 非目标

**目标：**

- Whisper 系本地引擎默认阻断"幻觉重复跨窗口自我强化"的解码路径。
- 引擎层失效时（非 Whisper 引擎、用户覆盖参数），postprocess 提供跨引擎的重复折叠兜底，且不改变 segment 时间轴与数量。
- 英文词级重复能在质量报告中暴露为 `REPETITIVE_TRANSCRIPT` 警告。
- 所有新默认值可通过任务级 options 覆盖。

**非目标：**

- 不改变 chunk 划分/重叠/拼接逻辑（已确认非根因）。
- 不改 FunASR / Qwen3-ASR / MOSS backend 的解码参数（非 Whisper 解码路径，由 postprocess 兜底覆盖）。
- 不引入 VAD 参数调优、语言自动纠错等相邻改进。
- 不修改任何 API 路由、response_model 或持久化 schema。

## 决策

### D1：引擎层默认值（主修复）

- `FasterWhisperBackend` kwargs 增加默认值（均可被 `options` 同名 key 覆盖）：
  - `condition_on_previous_text=False` —— 切断幻觉文本作为下一窗口 prompt 的自我强化链路，这是本次 bug 的直接根因。
  - `no_repeat_ngram_size=3`、`repetition_penalty=1.1` —— 解码期重复抑制（faster-whisper 原生支持）。
  - `hallucination_silence_threshold=2.0` —— 配合既有 `vad_filter`，跳过长静音段这一幻觉高发触发源。
- `MLXWhisperBackend` kwargs 增加 `condition_on_previous_text=False`。mlx-whisper 对齐 openai-whisper 的 DecodingOptions，该参数受支持；其余重复抑制参数 mlx 端支持面不确定，不盲目透传未知 kwarg（会 TypeError），由 postprocess 兜底。
- `TransformersWhisperBackend` `generate_kwargs` 增加 `no_repeat_ngram_size=3`（HF `generate` 原生支持；`repetition_penalty` 对 greedy 解码收益小且可能劣化正常文本，不加）。
- 备选方案：在 worker/任务编排层统一注入参数 —— 否决，backend 各自封装引擎差异，参数注入属于 backend 职责。

### D2：postprocess 重复折叠（兜底）

在 `process_segments` 的清洗阶段之后增加 `_collapse_repetitions(text)`：

- 字符级：任意单字符连续重复 ≥6 次折叠为保留 2 次（覆盖 CJK "的的的的…" 型幻觉）。
- 词级：按空白分词后，同一 token（大小写不敏感比较，保留原形）连续重复 ≥6 次折叠为保留 2 次（覆盖英文 "par par …" 型幻觉）。
- 阈值 6 与保留 2 的依据：正常强调/口吃/笑声（"very very"、"ha ha ha"）极少超过 3-4 次，阈值 6 留有安全边距；保留 2 次而非删空，避免误伤真实重复语义，同时消除字幕刷屏。
- 折叠只改 text，不动 start/end/speaker，因此 segment 数量与时间轴不变（满足 spec 约束），也不影响后续合并/切分步骤的正确性。
- 备选方案：折叠为 0 次（整段删除）——否决，幻觉段可能夹带真实首尾词，且空文本会干扰时间轴连续性。

### D3：质量检测按词统计

`quality.analyze` 在既有字符级检测外增加词级检测：`tokens = stripped.split()`，当 `len(tokens) >= 20` 且最高频 token 占比 > 0.45 时追加 `REPETITIVE_TRANSCRIPT`。纯中文无空白文本 `split()` 只得 1 个 token，自然跳过，无回归。警告码不变，前端与诊断链路零改动。

## 风险

- [关闭 `condition_on_previous_text` 可能轻微降低长句连贯性] → 这是 Whisper 社区对防幻觉的标准取舍；保留 options 覆盖入口，用户可回退旧行为。
- [`hallucination_silence_threshold` 需要 VAD 开启才生效] → 与既有默认 `vad=True` 一致；用户关 VAD 时该参数自动失效，无副作用。
- [折叠阈值误伤真实重复] → 阈值 6 远高于自然语言重复频次；保留 2 次降低误伤观感。
- [mlx-whisper 参数支持面] → 只透传确认支持的 `condition_on_previous_text`，其余靠 postprocess 兜底。

## 回滚

全部为后端默认值与纯函数变更：回滚即 revert 三个文件的 diff。无 schema、依赖、持久化数据变化；既有任务的历史版本不受影响（版本不可变快照）。
