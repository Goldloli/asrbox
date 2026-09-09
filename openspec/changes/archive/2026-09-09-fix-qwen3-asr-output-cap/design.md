# fix-qwen3-asr-output-cap 设计

## 背景

见 proposal.md。关键现状：`Qwen3ASRBackend.transcribe`（`backend/backends/local_asr.py:410`）中 `max_new_tokens=int(options.get("max_new_tokens", 512))`；同文件 `_moss_max_new_tokens`（local_asr.py:452-464）已有"按音频时长推算 token 预算"的成熟模式（每分钟 800 token，下限 4096，上限 65536），但其用 soundfile 读时长。Qwen3 路径在 generate 前已通过 `load_audio(..., sampling_rate=16000)` 拿到 16kHz 音频数组，可直接用 `len(audio) / 16000` 求时长，无需 soundfile。

## 目标 / 非目标

**目标：** 默认值随音频时长自适应；显式 `max_new_tokens` 覆盖不变；默认上限有界。

**非目标：** 不改 chunking、不改其他引擎、不暴露新的 API 字段。

## 决策

- D1：默认值公式 `min(8192, max(1024, ceil(分钟 × 320)))`。依据：英文正常语速约 150 词/分 ≈ 200 token/分，320 token/分 覆盖快速语音与 CJK（字密度更高）并留 60% 边距；1024 下限覆盖短音频停顿重采样；8192 上限对齐长 chunk 实际不会超过 2 分钟（≈640 token）的事实，仅为直接调用长音频兜底。
- D2：时长取自已加载音频数组长度而非 soundfile —— 零新依赖、零额外 IO；`load_audio` 失败本就会先抛错，无新增失败路径。
- 备选：复用 `_moss_max_new_tokens` —— 否决，其参数（800/分、4096 下限）面向 90 分钟级 diarized 长文，对 2 分钟 chunk 会产生过大的 KV cache 预算；且引入 soundfile 依赖到 Qwen3 路径。

## 风险

- [更大 KV cache 预算略微增加显存峰值] → 上限 8192 有界；0.6b/1.7b 模型规模下可忽略。
- [默认值变更属于行为变化] → 仅影响输出完整性（更多文本），不改格式；显式覆盖路径不变。

## 回滚

Revert 单文件 diff 即可，无 schema/依赖/持久化变化。
