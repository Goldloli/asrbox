# model-management Delta

## ADDED Requirements

### Requirement: 阶段一本地模型目录扩展

本地模型目录 SHALL 新增三个注册条目，并沿用既有的下载生命周期、状态判定与能力事实展示：`paraformer-zh`（FunASR 引擎，中文 Paraformer-large 离线版）、`fun-asr-nano`（FunASR 引擎，800M 中文模型）、`faster-whisper-distil-large-v3`（faster-whisper 引擎，Distil-Whisper large-v3）。各条目的能力与语言声明 SHALL 如实反映模型实际能力，不得夸大：

- `paraformer-zh`：支持句段时间戳（由原生字级时间戳聚合）、不支持词级时间戳、不支持原生说话人分离；语言覆盖为中文与英文；支持 CPU 与 CUDA。
- `fun-asr-nano`：无原生时间戳；语言覆盖为中文（含其训练方言）；支持 CPU 与 CUDA。
- `faster-whisper-distil-large-v3`：支持句段与词级时间戳；语言覆盖 SHALL 明确标注为仅英文，UI 与详情不得让用户误认为支持中文等其它语言；支持 CPU 与 CUDA。

三个条目 SHALL 通过受维护的模型源候选（ModelScope 主源 / HF 镜像，Distil-Whisper 为 HF 仓库）下载，下载进度、暂停、恢复、停止、重试、删除 SHALL 与既有本地模型一致。模型许可信息（Paraformer 模型协议、Fun-ASR-Nano Apache 2.0、Distil-Whisper MIT）SHALL 随目录维护并同步到第三方声明文档。

#### Scenario: 用户查看新增模型的能力事实

- **WHEN** 用户在模型管理页展开 `paraformer-zh`、`fun-asr-nano` 或 `faster-whisper-distil-large-v3` 的详情
- **THEN** 详情按条目声明如实展示时间戳能力、语言覆盖、推荐场景与已知限制，Distil-Whisper 的语言覆盖显示为仅英文

#### Scenario: 用户下载新增模型

- **WHEN** 用户对任一新增条目发起下载、暂停、恢复、重试或删除
- **THEN** 该条目走与既有本地模型相同的托管下载生命周期与状态展示，不出现新的下载机制

#### Scenario: 模型天梯与选择器覆盖新增条目

- **WHEN** 模型天梯视图或转写模型选择器渲染目录
- **THEN** 三个新增条目按其能力声明展示时间戳/设备/语言维度，未实测等级按引擎与体量回退估算并标注为估算

#### Scenario: 许可信息随目录维护

- **WHEN** 发布产物组装或第三方声明文档生成
- **THEN** 三个新增模型的许可来源与条款出现在受维护的第三方声明中，不引入与开源发布冲突的许可
