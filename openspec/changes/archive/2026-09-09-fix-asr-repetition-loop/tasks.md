# fix-asr-repetition-loop tasks

## 1. 引擎解码默认值

- [x] 1.1 `backend/backends/local_asr.py` `FasterWhisperBackend.transcribe`：kwargs 增加 `condition_on_previous_text`（默认 False）、`no_repeat_ngram_size`（默认 3）、`repetition_penalty`（默认 1.1）、`hallucination_silence_threshold`（默认 2.0），均可被 `options` 同名 key 覆盖；验证：扩展 backend 测试断言 mock `WhisperModel.transcribe` 收到的 kwargs 含上述默认值，且 options 覆盖生效
- [x] 1.2 `MLXWhisperBackend.transcribe`：kwargs 增加 `condition_on_previous_text=False`（可被 options 覆盖）；验证：测试断言 `mlx_whisper.transcribe` 收到该参数
- [x] 1.3 `TransformersWhisperBackend.transcribe`：`generate_kwargs` 增加 `no_repeat_ngram_size=3`（可被 options 覆盖）；验证：测试断言 pipeline 调用的 generate_kwargs

## 2. 后处理重复折叠

- [x] 2.1 `backend/services/postprocess.py`：实现 `_collapse_repetitions`（字符级与词级连续重复 ≥6 次折叠为保留 2 次，词级大小写不敏感比较、保留原形），接入 `process_segments` 清洗阶段；验证：新增测试覆盖 "par par …(×200)" 折叠、中文单字重复折叠、"very very" 短重复不变、折叠后 segment 时间轴与数量不变

## 3. 质量检测

- [x] 3.1 `backend/services/quality.py`：`analyze` 增加按空格分词的词级重复检测（tokens ≥20 且最高频词占比 >0.45 时追加 `REPETITIVE_TRANSCRIPT`）；验证：测试断言英文词级重复触发警告、纯中文文本不产生误报、既有字符级检测不受影响

## 4. 验证与收尾

- [x] 4.1 运行相关 pytest（local_asr / postprocess / quality 相关测试文件）全部通过，随后运行 `npm run test:backend`
- [x] 4.2 勾选全部 tasks，`openspec archive fix-asr-repetition-loop --yes` 归档，确认主 spec 同步且 `openspec validate --specs` 通过
