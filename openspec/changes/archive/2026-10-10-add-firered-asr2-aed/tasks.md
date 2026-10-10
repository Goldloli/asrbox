# Tasks: add-firered-asr2-aed

## 1. Vendored 推理集

- [x] 1.1 从 FireRedTeam/FireRedASR2S（main 分支）引入 AED 最小推理集到 `backend/vendor/fireredasr2/`（asr.py、data/asr_feat.py、data/token_dict.py、models/fireredasr_aed.py、models/param.py、models/module/{adapter,conformer_encoder,ctc,transformer_decoder}.py、tokenizer/aed_tokenizer.py、包 `__init__.py`），保留版权头，包级注明来源仓库/commit/Apache-2.0/本地改动。
- [x] 1.2 `asr_feat.py` 的 `KaldifeatFbank` 改为 torchaudio.compliance.kaldi.fbank（参数对齐：num_mel_bins=80、frame_length=25、frame_shift=10、snip_edges=True、推理 dither=0），删除 kaldi_native_fbank import；`asr.py` 删除 LLM/ELM 分支与对应 import。
- [x] 1.3 权重加载处理 torch 新版 `weights_only` 默认（显式 `weights_only=False` 或兼容回退），确认 kaldiio 读 cmvn.ark 正常。

## 2. 引擎与注册

- [x] 2.1 `backend/backends/local_asr.py` 新增 `FireRedASRBackend`：加载 vendored FireRedAsr2（beam 3、return_timestamp=True、设备 cuda→cpu 显式选择）、复用 fsmn-vad 语音块规划（≤59s）、逐块元组输入转写、时间戳偏移、词级时间戳聚合句段（flush 语义沿用 Paraformer 先例）、words 透出、`raw_result_summary` 记录引擎/块数。
- [x] 2.2 `backend/backends/registry.py` 新增 `firered-asr2-aed` 条目（能力/语言/设备/许可/源候选/allow_patterns/required_files 如 design 所列）。
- [x] 2.3 `backend/services/platform.py` 增加 `firered_asr_available` 探针并接入 runtime_probe_snapshot 与模型状态本地化文案（沿用 funasr/qwen3 先例）。

## 3. 打包与声明

- [x] 3.1 `backend/build_binary.py` hidden imports 覆盖 `backend.vendor.fireredasr2` 全部子模块；同步打包静态断言/冻结路径测试。
- [x] 3.2 `THIRD_PARTY_NOTICES.md` 记录 vendored 代码（Apache-2.0、来源 URL、commit）与模型权重（Apache-2.0、双源仓库）。

## 4. 测试与验证

- [x] 4.1 单元/契约测试：registry 条目断言（含 required_files 与源候选）、引擎 stub 单测（monkeypatch vendored FireRedAsr2，验证 VAD 切分调用、时间戳偏移、聚合、设备选择）、探针缺失态文案、经 backend 分发路径的行为测试（沿用既有本地模型测试模式）。
- [x] 4.2 聚焦测试通过后跑 `npm run test:backend` 全量。
- [x] 4.3 真机验证：`ASRBOX_RUN_REAL_MODELS=1` 下经 backend 真实路径转写中英样本（模型已下载到 data/models/firered-asr2-aed），确认输出文字与词级时间戳合理（fbank 等价性），结果记录 `backend/real_tests/results/`。
- [x] 4.4 冻结二进制 smoke：本地构建后确认 `firered_asr_available` 探针 true 且至少一条真实转写跑通（或明确记录未验证项与原因）。

## 5. 文档与归档

- [x] 5.1 `docs/asr-models-roadmap.md` 阶段 3 状态更新（引擎部分完成、对齐后处理另行跟进）；CHANGELOG Unreleased 增加 Added 条目。
- [x] 5.2 `openspec validate --changes add-firered-asr2-aed` 通过；全部勾选后归档并复核 `openspec validate --specs`。
