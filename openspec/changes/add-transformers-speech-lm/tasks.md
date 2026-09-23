# add-transformers-speech-lm — 任务

## 1. 依赖升级（前置门槛）

- [x] 1.1 `requirements-runtime.in` / `requirements-docker.in` 把 transformers 从 git commit pin 改为 `transformers==5.17.0`，新增 `mistral-common[audio]>=1.8.1`；重新生成 `requirements-runtime.lock` 与 `requirements-docker.lock`，确认 lock 内 transformers/torch/moss-transcribe-diarize 版本一致且无冲突
- [ ] 1.2 按 Windows + Python 3.14 流程同步冻结 `requirements-windows.lock`（含 transformers 5.17.0 与 mistral-common），在 Windows 环境安装验证 `pip check` 通过；无法本地完成时明确报告"未验证"，不得手工拼造
- [x] 1.3 在新依赖环境跑全量后端测试（`npm run test:backend`）与 `scripts/check-versions.mjs`、依赖审计（`scripts/audit-dependencies.sh`），确认 Whisper/Qwen3/MOSS 既有路径无回归

## 2. 统一引擎重构（行为等价迁移）

- [x] 2.1 在 `backend/backends/local_asr.py` 实现 `transformers_speech_lm` 引擎核心（懒加载缓存、device/dtype 回退、VAD 切分循环与时间戳偏移、时长感知输出预算、重复护栏挂钩）与 adapter 协议，核心逻辑 stub 单测通过
- [x] 2.2 实现 `qwen3_asr` adapter（`apply_transcription_request` 输入构造 + `decode(return_format=...)` 解析，保持 `_qwen_language` 行为），把 registry 中 `qwen3-asr-0.6b/1.7b` 的 engine 迁移为 `transformers_speech_lm`；`test_qwen3_output_budget.py` 与 `test_repetition_guardrails.py` 不改断言全部通过
- [x] 2.3 实现 `moss_transcribe_diarize` adapter（`build_transcription_messages`/`generate_transcription`/`parse_transcript`，保持 `_moss_max_new_tokens` 行为与原生说话人标签产出），registry engine 迁移；既有 MOSS 相关测试不改断言全部通过
- [x] 2.4 删除 `Qwen3ASRBackend`/`MossTranscribeDiarizeBackend` 类与旧 engine 注册，`raw_result_summary` 携带 `{"engine": "transformers_speech_lm", "adapter": ...}`；全仓 grep 旧 engine id（backend/前端/文档），确认无残留引用
- [x] 2.5 真机冒烟：qwen3-asr 与 moss-transcribe-diarize 各转写一条样例音频，结果字段、说话人标签与迁移前一致（`real_tests/` 记录）

## 3. 六个新模型接入

- [x] 3.1 registry 新增 `granite-speech-4.1-2b` 与 `granite-speech-4.1-2b-plus` 条目（语言、词级时间戳、diarization、size_mb、HF/ModelScope source_candidates、allow_patterns、license 元数据），`test_model_registry.py` 新条目断言通过
- [x] 3.2 实现 Granite base adapter（chat template prompt + `generate`，无时间戳直通），stub 单测覆盖输入构造与输出解析
- [x] 3.3 实现 Granite plus adapter：`[T:N]` 厘秒标签 unwrap（mod 1000 回绕）→ `words` 字段、`[Speaker N]:` 轮次 → 句段 speaker；单测覆盖回绕边界与多块合并单调性
- [x] 3.4 registry 新增 `cohere-transcribe-2b` 条目 + adapter（`CohereAsrForConditionalGeneration` 原生加载、显式语言注入、`requires_explicit_language` 声明）；语言缺失/auto 时以机器可读原因码失败，错误映射与本地化文案就绪
- [x] 3.5 registry 新增 `ark-asr-0.6b` 与 `ark-asr-3b` 条目 + adapter（`trust_remote_code=True`，30s 切分上限，语种跟随音频）；真机 smoke 验证 remote code 在 transformers 5.17 下可加载，失败则剔除条目并回写 roadmap
- [x] 3.6 registry 新增 `voxtral-mini-3b` 条目 + adapter（`VoxtralForConditionalGeneration` + `mistral-common` processor，30min 上限切分，auto 语种）
- [x] 3.7 对声明 `max_chunk_seconds` 的模型接入 fsmn-vad 切分（Cohere/ARK/Granite plus/Voxtral），VAD 不可用时抛可操作错误；长音频 stub 单测验证块偏移后时间轴连续
- [x] 3.8 真机验证：六个模型各转写短样例（Granite plus 验证词级时间戳与说话人、Cohere 验证显式语言与长音频切分、Voxtral 验证 >30min 不需要时的常规路径），记录进 `real_tests/`

## 4. gated 源与下载失败态

- [x] 4.1 下载服务把 gated 源 401/403 映射为机器可读原因码（`GATED_REPO_ACCESS`），UI 本地化描述与访问引导；新增下载失败测试断言原因码与文案键
- [x] 4.2 校验 Cohere 的 ModelScope 镜像可用性与文件一致性（`required_files`/分片大小），确定 source_candidates 优先级并标注 verified；镜像不可用时降级 HF-only 并确认 gated 失败态可触达

## 5. 许可与署名元数据

- [x] 5.1 `ASRModelConfig` 新增 `license`/`attribution` 字段并为全部既有条目补齐许可标识（与 `THIRD_PARTY_NOTICES.md` 对齐）；registry 测试断言六个新条目均为 Apache 2.0
- [x] 5.2 `ASRModelStatus`（`backend/models.py`）新增 `license`/`attribution` 字段，`backend/services/models.py` 映射，typed client 同步；`test_contract.py` 断言两字段存在于 OpenAPI schema，`test_api.py` 断言响应携带
- [x] 5.3 前端模型详情消费许可字段渲染（替换硬编码许可文案），声明 `attribution` 的条目渲染署名块；`npm run typecheck`、`npm run build:web` 通过，相关 Playwright 场景接入 `test:e2e:maintained`
- [x] 5.4 `THIRD_PARTY_NOTICES.md` 增补六个新模型的许可与来源记录；`npm run check:open-source` 通过

## 6. 前端目录呈现

- [x] 6.1 模型详情页为六个新条目补齐推荐场景与已知限制文案（Granite plus 无标点/大小写、Cohere 需显式语言、Voxtral 无中文、ARK 无时间戳），中英 i18n 同步
- [x] 6.2 模型天梯为新条目添加估算级行（标注估算）并确认排序/能力列随 `supported_devices`/`supports_timestamps`/`supports_diarization` 动态渲染；转写选择器中 Cohere 不出现 auto 语言选项且选 auto+该模型时给出前端引导
- [x] 6.3 覆盖模型页与转写流程的相关 Playwright 场景跑通并接入维护聚合命令

## 7. 验证与文档收尾

- [x] 7.1 `npm run test:backend`、`npm run test:backend:contract`、`npm run test:frontend:unit`、`npm run test:e2e:maintained`、`npm run check:open-source` 全部通过
- [x] 7.2 更新 `docs/asr-models-roadmap.md`：阶段 2 状态回写、Belle-2/MOSS-preview-2B 剔除及理由、后续候选线索（Granite Speech 5、granite-nar、Voxtral Small-24B/Realtime）；`openspec validate --changes add-transformers-speech-lm` 通过
- [ ] 7.3 实现与验证完成后勾选全部任务，`openspec archive add-transformers-speech-lm --yes`，归档后确认主 spec 合并、`openspec validate --specs` 通过；Beads 任务 `asrbox-2h4` 关闭
