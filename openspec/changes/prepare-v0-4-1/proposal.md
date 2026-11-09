## 为什么

当前源码版本仍为 `0.4.0`，其发布后已合入多轮前端、Rust 与构建依赖维护。`0.4.1` 需要将这些维护成果整理为可验证的发布，并跟进一个能复用现有运行体系的新模型：Granite Speech 5.0 2B，改善英语、日语及欧洲语言的文件转写选择。

## 变更内容

- 唯一新增本地模型 `granite-speech-5.0-2b`，展示名称为 Granite Speech 5.0 2B；使用现有 `transformers_speech_lm` 引擎，声明 CPU / CUDA、`en/fr/de/es/pt/ja`、Apache-2.0，不声明中文 ASR、原生时间戳、说话人分离或流式输入能力。
- 为 5.0 设置独立的 120 秒推理分块策略，复用现有加载、VAD、结果合并与错误处理；该值是依据官方约两分钟建议制定的应用策略，不宣称为模型硬性架构上限。保留 4.1 普通版与 Plus 的条目、下载文件、默认选择和既有执行行为。
- 补齐模型页、选择器、天梯与中英文详情；新模型的字幕时间轴明确标注为近似值，未经项目实测的性能等级保持估算标识。沿用托管下载及来源回退，不把权重装入安装包。
- 使用既有工具准备 `0.4.1` 版本源、Bun / Cargo 工作区版本记录、CHANGELOG 与版本发布说明；基于 `v0.4.0..HEAD` 汇总已经合入的维护内容，不追加一轮无关依赖升级。
- 实现验收包含真实音频对比、完整后端分发、冻结包与 Windows 从 `0.4.0` 就地升级验证；所有未执行的环境或设备检查均明确记录，不能由 mock 或历史测试结果替代。

保持不变：受维护 API 路由、响应字段、事件集合、字幕不可变版本、用户数据位置、默认模型选择，以及已有模型的能力声明。非目标包括 TurboCTC、Ming、Nemotron、R2T2、CocktailASR、通用强制对齐、新的热词或语音翻译入口、MLX / MPS 新适配、4.1 Plus 权重强制更新和 sidecar 自愈。

## 能力（Capabilities）

### 新增能力

无新增顶层能力，扩展现有规格。

### 修改的能力

- `model-management`：增加 Granite Speech 5.0 2B 独立目录条目、真实能力展示、下载来源与旧模型共存要求。
- `transcription-lifecycle`：增加仅作用于该模型的 120 秒分块、近似时间轴及失败隔离要求。

## 影响

- 后端接触点：`backend/backends/registry.py`、`backend/backends/local_asr.py`、必要的 `backend/services/models.py` 完整性识别，以及相应模型 / API / 分发测试。复用 `granite_speech_available` 探针；`backend/build_binary.py` 原有 Granite 模块集合需核验，只有发现缺项才补充。
- 前端接触点：`app/src/lib/modelCatalog.ts` 与既有模型、转写默认值、任务字幕显示的验证场景；通过已有 typed response 消费新目录记录，不新增 contract 字段。
- 文档与版本接触点：`README.md`、`README.en.md`、`docs/models.md`、`docs/asr-models-roadmap.md`、`THIRD_PARTY_NOTICES.md`、`CHANGELOG.md`、`docs/releases/v0.4.1.md`、`docs/release.md`，以及 `scripts/bump-version.mjs` 管理的版本源和锁文件版本记录。预计本地模型由 25 个变为 26 个，另外 2 个 server-only NeMo 条目保持原状。
- 预计无新增 Python / JavaScript 依赖、数据迁移或模型权重迁移；现有 Transformers 5.17.0 是实现基线。若必须改变依赖或其它子系统边界，先更新本 change 的范围与验证计划。
- 失败与回滚：下载或推理失败沿用可操作错误与重试，不静默切换模型；模型验收未通过时阻止该功能进入发布候选，保留 `0.4.0` 可用路径与用户数据。未发布时可撤销新增条目及相应版本准备；已发布版本不覆盖标签，以后续修复版本处理。
- 发布继续遵守 [release-readiness](../../specs/release-readiness/spec.md)、[贡献与验证规则](../../../CONTRIBUTING.md) 和 [发布流程](../../../docs/release.md)，不改变这些门禁，因此不新增 release-readiness delta。本 change 的实施范围是发布准备，commit、tag、push 与正式发布仍需用户另行明确授权。
