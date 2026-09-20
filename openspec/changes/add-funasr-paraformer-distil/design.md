# design

## 背景

动机见 [proposal.md](proposal.md)。当前实现约束（见 `backend/backends/local_asr.py`）：

- `FunASRBackend.transcribe()`（`backend/backends/local_asr.py:287`）对 `AutoModel.generate()` 的输出统一走 `_clean_sensevoice_text` 清洗与 `_funasr_segments` 组段——清洗逻辑是 SenseVoice 特化（剥离 `<|zh|>` 等标签），对 Paraformer / Fun-ASR-Nano 的输出不适用也不充分。
- registry 的 `ASRModelConfig`（`backend/backends/registry.py:17`）已具备目录扩展所需的全部字段：`source_candidates`、`allow_patterns`、能力标志、`supported_devices`、`languages`。
- FunASR 依赖已在运行时 lock 中，`fsmn-vad` 可直接作为 `vad_model` 传入 `AutoModel`，无需新增任何依赖。
- faster_whisper 引擎按模型目录本地路径加载（`_model_path`），Distil 的 CTranslate2 仓库结构与现有 Systran 仓库一致，引擎无需改动。

## 目标 / 非目标

目标：

- 三个新目录条目在现有下载、状态、能力展示体系内可用。
- FunASR 引擎内建立按模型的输出解析 adapter，为阶段 2 的 `transformers_speech_lm` adapter 模式提供同构先例。
- Paraformer 字级时间戳 → 句段聚合在引擎内完成，产出符合既有 `TranscriptionResult` 契约。

非目标：

- 不引入 Fun-ASR-Nano 的流式模式与歌词识别等专项能力（仅作离线转写）。
- 不透出 Paraformer 词级/字级时间戳明细（目录声明为句段时间戳）。
- 不改动 SenseVoice Small 的任何转写行为。
- 不做 NeMo / transformers speech-LM 引擎（阶段 2+）。
- 不新增或修改任何 API 路由、响应字段与依赖。

## 决策

### D1：FunASR adapter 采用"模型名 → 解析函数"注册表，而非子类化

在 `local_asr.py` 内引入模块级 `_FUNASR_PARSERS`（sensevoice / paraformer / plain）与 `_funasr_model_spec`（VAD 默认值 + 解析器选择），`FunASRBackend` 加载时按 `model_config.model_name` 选择；无匹配时回退现有 SenseVoice 解析（保证未知 funasr 条目行为不变）。模型缓存键为 `(model_name, use_vad)`，任务选项覆盖 VAD 时加载对应实例，`unload` 释放同模型名的全部变体。

- 备选 A：每个模型一个 Backend 子类——过度设计，分发层已有 engine 维度，模型维度不该再进 `_backends`。
- 备选 B：把解析塞进 `ASRModelConfig`——registry 是纯数据目录，不应携带行为。

### D2：Paraformer 时间戳聚合成句段，词级不透出

Paraformer 的时间戳是**生成参数开关**：`generate(..., pred_timestamp=True)` 才会在每个结果项返回 `timestamp`（`[[start_ms, end_ms], ...]`，毫秒），否则只有纯文本。返回的 `text` 是 **token 用空格 join** 的字符串（中文一字一 token），`timestamp` 与 token 一一对应。adapter 以 token 为对齐单位：`text.split(" ")` 与 `timestamp` 等长时逐 token 聚合（静默间隔 > 0.8s 或累计 60 字断句，句段文本按中英智能拼接连回），不等长或缺失时退化为整段文本 + 首尾真实时间（不伪造句段时间轴）。VAD 多片时 funasr 已把片偏移合并进 `timestamp`（片间静默天然触发间隔断句）。

- 备选：整段文本 + 零时间轴（`fun-asr-nano` 路径）——浪费 Paraformer 核心优势，字幕场景不可用。
- 阈值（0.8s / 60 字）作为模块常量，实现时可按真机样本微调；不进入任务选项。

### D3：VAD 默认值按模型区分，写在 adapter 配置里

`paraformer-zh`、`fun-asr-nano` 的 adapter 配置声明 `vad=True`（挂 `fsmn-vad`，`max_single_segment_time=30000` 与 FunASR 官方示例一致）；SenseVoice adapter 显式 `vad=None`（不启用）。任务选项 `options["vad"]` 存在时覆盖默认。VAD 在 `AutoModel` 构造时传入——注意 `FunASRBackend` 按模型名缓存实例，VAD 属于构造参数，因此 adapter 配置需参与缓存键（模型名已天然唯一，无需额外处理）。

### D4：Distil-Whisper 仅加 registry 条目

`faster_whisper` 引擎零改动。仓库选 HF `Systran/faster-distil-whisper-large-v3`（CTranslate2 官方转换系）。语言覆盖声明为 `["en"]`（不含 `auto`——Distil 仅英文，无语言识别意义；与引擎 `language="auto"` 时不传语言参数的现有行为兼容）。实现前以任务形式核实仓库 ID、体积与文件清单，再落 `size_mb` 与 `allow_patterns`。

### D5：下载源候选

- `paraformer-zh`：ModelScope `iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch`（主源，FunASR 官方目录模型）+ HF `funasr/paraformer-zh`（镜像，`verified` 待实现期确认）。
- `fun-asr-nano`：ModelScope `FunAudioLLM/Fun-ASR-Nano-2512`（主源）；HF 镜像待确认，未确认前不列为候选。
- `faster-whisper-distil-large-v3`：仅 HF。
- 仓库 ID、体积与 allow_patterns 匹配情况在实现第一步用脚本核实（下载文件清单枚举），核实结果回填 registry 常量；`HF_ASO_ALLOW_PATTERNS` 已覆盖常规权重/配置文件。

## 风险

- [Paraformer 字级时间戳的输出结构随 funasr 版本变化] → adapter 对缺失/异常 `timestamp` 字段做防御：退化为整段文本成功产出（不伪造时间轴），并在 `raw_result_summary` 记录键集合供诊断。
- [VAD 挂载改变显存/内存占用] → VAD 仅对新两个模型生效；`max_single_segment_time` 限制单片时长，行为与 FunASR 官方示例一致。
- [Distil 仅英文被误选用于中文任务] → 目录与详情如实标注"仅英文"；语言选择器交集行为沿用现有前端逻辑，不在本 change 扩展。
- [ModelScope/HF 仓库 ID 或体积与预期不符] → 实现第一步核实，D5 的"未确认不列为候选"原则兜底；`size_mb` 只影响展示与预估，不影响下载正确性。
- [冻结二进制内 funasr 子模块加载差异] → 不新增子模块，但补一条 binary smoke 断言（三个新条目出现在 frozen 注册表中）。

## 回滚

纯增量变更：移除三个 registry 条目与 adapter 即回到现状；已下载模型目录残留在用户存储中，由既有模型删除操作清理，不涉及数据迁移。

## 开放问题

（无——仓库 ID/体积核实属于实现期可独立完成的验证步骤，不改变方案结构。）
