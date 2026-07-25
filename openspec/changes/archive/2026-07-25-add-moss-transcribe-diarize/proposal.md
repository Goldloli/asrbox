# Proposal: add-moss-transcribe-diarize

## 为什么

ASRbox 当前的说话人分离依赖任务级 pyannote 后处理：需要额外的 pyannote 模型、`HF_TOKEN` 配置，且与 ASR 引擎解耦导致分离质量受限于两段式拼接。[MOSS-Transcribe-Diarize 0.9B](https://github.com/OpenMOSS/MOSS-Transcribe-Diarize)（Apache 2.0）是 OpenMOSS 开源的端到端模型，单次推理同时产出转写文本、时间戳和说话人标签（`[S01]`、`[S02]`…），支持 50+ 语言、最长约 90 分钟音频，在 INTERSPEECH 2026 MLC-SLM Challenge 中排名第一。接入它可以为桌面用户提供零配置、端到端的高质量多人转写。

同时，模型下载页当前对每个模型只有一句话描述，用户无法判断该选哪个模型、各自支持什么语言和什么能力，需要更详细的模型介绍。

## 变更内容

- 新增本地引擎 `moss_transcribe_diarize`：基于 `transformers`（>=5.x，已满足）+ 官方 `moss-transcribe-diarize` 辅助包（GitHub 来源）实现 `LocalASRBackend`，模型原生输出带 `speaker` 的分段。
- 模型 catalog 新增 `moss-transcribe-diarize` 条目（0.9B，`supports_diarization=True`，HuggingFace / ModelScope 双 source candidate）。
- 任务链路识别"引擎自带说话人标签"的结果，跳过 pyannote 后处理，避免二次分离覆盖原生标签。
- 模型下载页为**全部**本地模型提供更详细的介绍：能力列表（时间戳/词级时间戳/说话人分离/流式等）、语言覆盖、适用场景、限制说明；以可展开的详情区展示，不改变现有卡片主布局。
- 新引擎的兼容性检查（必需文件 + 运行时）与平台检测（`services/platform.py`）。

## 能力（Capabilities）

### 新能力

无。

### 修改的能力

- `model-management`：`Registered local model catalog` requirement 扩展——catalog 面向用户的展示 SHALL 包含每个模型的能力、语言覆盖与适用场景等详细事实；catalog 新增端到端说话人分离模型条目，引擎原生说话人标签 SHALL 被保留而不被任务级后处理覆盖。

## 影响

- 后端：`backend/backends/registry.py`（新条目）、`backend/backends/local_asr.py`（新 engine）、`backend/services/models.py`（兼容性分支）、`backend/services/platform.py`（运行时检测）、`backend/services/tasks.py`（pyannote 跳过逻辑）。
- 依赖：`requirements-runtime.in` / `requirements-docker.in` 新增 `moss-transcribe-diarize`（GitHub 来源）并重新生成 lock；打包清单 `backend/build_binary.py` 增加 hidden imports。
- 前端：`app/src/lib/modelCatalog.ts`（详细模型文案结构）、`app/src/components/models/ModelManagement.tsx`（详情展示 UI）。
- API contract：`ASRModelStatus` 字段不变，无路由变更，contract test 不受影响。
- 文档：`docs/models.md` 模型目录表。
- 测试：`backend/tests/test_api.py` 新 engine 测试；前端相关测试。
