# Tasks: add-moss-transcribe-diarize

## 1. 依赖与运行时

- [x] 1.1 在 `requirements-runtime.in` 与 `requirements-docker.in` 添加 `moss-transcribe-diarize`（GitHub pin commit），重新生成对应 lock
- [x] 1.2 `backend/services/platform.py` 新增 `moss_transcribe_diarize_available()` 检测并纳入 `detect_runtime()`

## 2. 后端引擎与 catalog

- [x] 2.1 `backend/backends/registry.py` 新增 `moss-transcribe-diarize` 的 `ASRModelConfig`（核实 ModelScope 候选源；`supports_diarization=True`；`allow_patterns` 含 `*.py`）
- [x] 2.2 `backend/backends/local_asr.py` 新增 `MossTranscribeDiarizeBackend`（lazy 加载、时长缩放 `max_new_tokens`、`parse_transcript` 产出带 `speaker` 的分段）并注册进 `_backends`
- [x] 2.3 `backend/services/models.py` 的 `check_model_compatibility()` 新增 `moss_transcribe_diarize` 分支（必需文件 + 运行时）
- [x] 2.4 `backend/services/tasks.py` pyannote 分支前加"分段已含 speaker 则跳过"早退
- [x] 2.5 `backend/build_binary.py` hidden imports 增加 `moss_transcribe_diarize` 子模块

## 3. 前端模型详情

- [x] 3.1 `app/src/lib/modelCatalog.ts` 新增结构化模型详情（capabilities/languages/bestFor/limitations，中英文），覆盖全部已注册模型
- [x] 3.2 `app/src/components/models/ModelManagement.tsx` 的 `ModelListRow` 增加可展开详情区展示上述信息

## 4. 测试与验证

- [x] 4.1 `backend/tests/test_api.py` 新增 MOSS backend 的 dispatch/transcribe 测试（monkeypatch 官方包）
- [x] 4.2 新增 pyannote 跳过逻辑的聚焦测试（分段已含 speaker 时不要求 token、不调用 apply_diarization）
- [x] 4.3 运行相关 pytest、`npm run typecheck`、`npm run build:web` 验证

## 5. 文档与收尾

- [x] 5.1 `docs/models.md` 模型目录表新增 MOSS 条目（能力、语言、许可证）
- [x] 5.2 核对 spec delta 场景与实现一致，更新 tasks 勾选状态
