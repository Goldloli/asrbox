# add-funasr-paraformer-distil

## 为什么

ASRbox 本地模型目录目前以 Whisper 系和 Qwen3-ASR 为主，缺少"中文字幕带原生时间戳"和"英文更快转写"的低成本补强选项：Paraformer-large 原生输出字级时间戳且 FunASR 生态成熟，Fun-ASR-Nano（2025/12，Apache 2.0）补强方言，Distil-Whisper large-v3 以约 2 倍速覆盖英文场景。三者均可复用现有 `funasr` / `faster_whisper` 引擎，零新增 runtime 依赖，是 [docs/asr-models-roadmap.md](../../../docs/asr-models-roadmap.md) 阶段 1 的落地。

## 变更内容

- 模型目录（`backend/backends/registry.py`）新增三个注册条目：
  - `paraformer-zh`（Paraformer-large 中文离线版，非 streaming）：`funasr` 引擎，ModelScope 主源 + HF 镜像，声明句段时间戳（字级聚合）、zh/en、cpu/cuda；
  - `fun-asr-nano`（800M）：`funasr` 引擎，ModelScope 主源，声明无原生时间戳、zh、cpu/cuda；
  - `faster-whisper-distil-large-v3`：`faster_whisper` 引擎，HF CTranslate2 转换版仓库，声明句段+词级时间戳、**仅英文**、cpu/cuda。
- `FunASRBackend`（`backend/backends/local_asr.py`）引入按模型的轻量输出 adapter：现 `_clean_sensevoice_text` 为 SenseVoice 特化，改为按 model_name 选择 SenseVoice 清洗 / Paraformer 字级时间戳→句段聚合 / Fun-ASR-Nano 直通。
- 新增 FunASR 系模型（paraformer-zh、fun-asr-nano）默认启用 `fsmn-vad` 切分长音频（`vad_model` + `max_single_segment_time`）；**SenseVoice 现状不变**。
- Distil-Whisper 在模型目录与详情中如实标注"仅英文"，沿用现有能力事实展示，不产生误导性语言声明。
- 模型许可信息更新（Paraformer 模型协议、Fun-ASR-Nano Apache 2.0、Distil-Whisper MIT），同步 `THIRD_PARTY_NOTICES.md`。
- 不改变任何受维护 API 路由、响应字段或依赖清单；下载、状态、能力展示全部走现有 `model-management` 生命周期。

## 能力（Capabilities）

### 新增能力

（无）

### 修改的能力

- `model-management`：目录新增三个本地模型条目及其如实的能力/语言/设备声明（新 requirement：阶段 1 模型目录扩展）。
- `transcription-lifecycle`：新增 FunASR 系引擎行为 requirement——Paraformer 字级时间戳聚合为句段时间轴、新 FunASR 模型默认 VAD 切分且任务选项可覆盖、Fun-ASR-Nano 无时间戳时按整段文本产出。

## 影响

- 代码：`backend/backends/registry.py`（目录条目）、`backend/backends/local_asr.py`（FunASR adapter 与 VAD 默认）、`backend/services/models.py`（如需模型状态映射补充）。
- 测试：`backend/tests/test_model_registry.py`（新条目断言）、FunASR adapter 单测（stub AutoModel，沿用 `test_repetition_guardrails.py` 的替身模式）、`backend/tests/test_api.py` 相关断言、`real_tests/` 真机验证记录。
- 文档：`THIRD_PARTY_NOTICES.md`、`docs/asr-models-roadmap.md`（阶段 1 状态回写）、README 模型清单（如受维护清单存在）。
- 不影响：API contract、依赖 lock、打包 hidden imports（无新 runtime）、前端组件（模型页自动渲染目录）。
