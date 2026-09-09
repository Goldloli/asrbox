# fix-qwen3-asr-output-cap tasks

## 1. 实现

- [x] 1.1 `backend/backends/local_asr.py`：`Qwen3ASRBackend.transcribe` 的 `max_new_tokens` 改为 `options.get("max_new_tokens")` 优先，否则按时长 `min(8192, max(1024, ceil(分钟 × 320)))`（时长来自已加载的 16kHz 音频数组）；验证：单元测试断言短音频默认 1024、3 分钟音频默认 ≥1024 且 ≈960→1024 取 max、显式覆盖生效、超长音频封顶 8192

## 2. 验证与收尾

- [x] 2.1 运行相关 pytest 及 `npm run test:backend` 全部通过
- [x] 2.2 真实模型回归：用 5:43 测试音频（data/tmp/reptest_audio.wav）以默认参数重跑 qwen3-asr-0.6b，确认输出 ~5950 字符（不再截断于 ~2400）
- [x] 2.3 勾选全部 tasks，`openspec archive fix-qwen3-asr-output-cap --yes` 归档，`openspec validate --specs` 通过，更新 CHANGELOG
