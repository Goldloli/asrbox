## 背景

版本动机与业务范围见 [proposal.md](proposal.md)。本 change 涉及后端分发、模型展示和发布准备，需要把新模型的分块策略与旧模型隔离，因而保留独立 design。

已检查的接触点：

- `backend/backends/registry.py:142` 的 `_speech_lm_config` 已声明 CPU / CUDA、候选源与能力字段；`:304` 起保留 Granite 4.1 和 Plus 两个独立条目。
- `backend/backends/local_asr.py:928` 的 `GraniteSpeechAdapter` 使用 `AutoModelForSpeechSeq2Seq` 和现有标点转写 prompt，当前 `max_chunk_seconds=180.0`；`:577` 的 `_plan_speech_lm_chunks` 负责 VAD 与过长语音区间再切分。
- `backend/services/transcribe.py:9` 的 `transcribe_with_local_model` 与 `backend/backends/local_asr.py:1638` 的 `transcribe_local` 是真实分发入口；仅测试 adapter 内部方法不足以覆盖模型装配。
- `backend/services/models.py:430` 附近按 adapter 检查 tokenizer 与 processor 文件；`backend/backends/registry.py:42` 的白名单已包含 JSON、权重、BPE 文件及 `chat_template*`。
- `app/src/lib/modelCatalog.ts` 维护中英文描述、详情、用途、估算天梯和近似时间轴模型集合；新模型不能只加入后端目录。
- `backend/build_binary.py:45` 起已收集 Granite 的 configuration、feature extraction、modeling 和 processing 模块；当前 macOS 与 Windows lock 均包含 Transformers 5.17.0。
- `scripts/bump-version.mjs` 管理所有版本源并生成发布说明骨架；现有 [release-readiness](../../specs/release-readiness/spec.md) 与 [发布流程](../../../docs/release.md) 已定义版本一致性、全量门禁、产物校验和 Windows 就地升级要求。

上游依据（2026-11-09 查阅）：

- [IBM 官方模型卡](https://huggingface.co/ibm-granite/granite-speech-5.0-2b)：六种 ASR 语言、Apache-2.0、Transformers 原生支持，建议按约两分钟分段转写。
- [官方文件清单](https://huggingface.co/ibm-granite/granite-speech-5.0-2b/tree/main)：约 5.05 GB，包含 `config.json`、`model.safetensors`、tokenizer / processor 配置、`chat_template.jinja`、`merges.txt` 和 `vocab.json` 等；仓库总量不直接等于应用实际下载量。
- ModelScope 的同名镜像页面在本次只读核验中无法访问，尚不能认定该源可用。源候选的验证事实必须在实施中的受控下载验证中补齐，不把推测写成已验证。

## 目标 / 非目标

目标是以独立模型标识和小范围 adapter 扩展完成接入，保留现有 API、缓存、数据目录、默认模型与字幕版本语义，并让源码运行、冻结运行与用户可见能力声明一致。

设计不扩展 `ASRModelConfig` 对外字段、不新增运行时探针字段、不引入新引擎或依赖升级。模型自身支持的热词与语音翻译功能不自动变成本次产品入口；其它非目标沿用 proposal。

## 决策

### 1. 新增独立目录记录，保留旧模型

新增 `model_name=granite-speech-5.0-2b`，沿用现有模型根下按标识隔离的托管目录。登记六种语言，`supported_devices=[cpu, cuda]`，所有原生时间戳、说话人和流式能力标志为 false，许可为 Apache-2.0。无 CUDA 时走现有 CPU 路径，不因 macOS 存在 MPS 就使用未声明设备。

`granite-speech-4.1-2b` 与 `granite-speech-4.1-2b-plus` 保留原 ID、目录、adapter 和能力，不自动迁移权重、不更改用户默认值。发布后本地模型为 26 个，server-only NeMo 仍为 2 个。

备选方案是把 4.1 的 repo ID 原地改为 5.0；这会混淆已下载权重与历史任务的模型身份，因此不采用。也不在本次删除旧条目或调整全局推荐清单。

### 2. 复用 Granite 实现，隔离 120 秒策略

为 5.0 增加轻量 `GraniteSpeech5Adapter`，继承 `GraniteSpeechAdapter` 的加载、prompt 与解析，使用独立 key `granite_speech_5` 和 `max_chunk_seconds=120.0`，注册到既有 adapter 映射。继续使用 `granite_speech_available` 探针和 `transformers_speech_lm` 引擎，不复制模型加载器。

120 秒是 ASRbox 根据上游建议选择的保守策略，不是新发现的模型硬上限。保留 4.1 的 180 秒值及 Plus 行为。复用 `_plan_speech_lm_chunks`；新 adapter 在调用模型前复核实际音频块长度，若无效 VAD 区间导致 planner 回退到超长原音频，必须走现有失败路径，不能把超长块直接送入推理。此防御只作用于新 adapter。

初始复用当前标点转写 prompt，不额外增加语言 ID prompt、热词选项或翻译模式。若 5.0 的真实 processor / 输出要求局部差异，只在新 adapter 覆盖相应方法，并先补充失败测试；若需要依赖升级或其它子系统变更，则先修订规划。

备选方案是把共享 Granite adapter 全局改为 120 秒，或增加全局可配置分块字段；前者会改变旧模型行为，后者引入不必要的配置与 contract 接触点，均不采用。

### 3. 下载与完整性复用现有机制，事实单独核验

候选源遵循 ModelScope 主源、官方 HF 备源策略；实施任务需核实镜像的精确 repo ID、文件清单和下载结果，再设置 `verified`。未核实的候选保留未验证事实，不得复制相邻条目的 `verified=True`；镜像失败时 HF 备源仍必须经过真实下载证明。沿用现有失败码与 UI 映射，不新建来源错误 contract。

现有 allow patterns 已能覆盖模型卡列出的原生推理文件。以实际受托管文件集统计体积，记录验证使用的上游 revision；不把目录页总量或不同量化版本的体积作为精确下载量。验证权重、tokenizer、processor 和聊天模板缺失时的状态，必要的完整性收紧仅限新模型，不全局重写其它 adapter 的识别规则。推理维持 local-files-only，不访问上游自动补文件。

备选方案是仅提供 HF 源或依赖运行时自动补齐文件；前者跳过项目的默认源策略，后者破坏可预测的离线行为，均不作为本次默认方案。

### 4. 前端补齐模型事实，沿用既有用户流程

在 `app/src/lib/modelCatalog.ts` 补齐中英文描述、详情、用途与 `isApproximateTimelineModel`。模型页和选择器消费既有 typed status；CPU / CUDA 摘要、下载控制和「设为默认」继续走原通路。未经同口径实测时不写入代表已实测的 `MODEL_LADDER` 条目，保留估算标记。

官方的噪声、准确率或热词基准可在文档中注明出处，但不宣称为 ASRbox 当前设备的实测提速，也不宣传中文 ASR、精确时间轴或新增 Apple GPU 加速。无新增页面、设置项或品牌系统改造。

备选方案是仅注册后端条目并让 UI 使用通用描述；这会遗漏近似时间轴提示和语言限制，因此不采用。

### 5. 真实模型验收是进入版本候选的前置条件

使用合法、未入仓的英文清晰语音、噪声语音、日语和超过两分钟的长音频，经托管模型目录与完整 backend 路径运行。对同一素材、设备和解码条件比较 5.0 与 4.1 普通版，记录上游 revision、文本质量、耗时、峰值内存及长音频尾部覆盖。需要评价准确率时使用经人工核对的参考文本，不能把 4.1 输出当成 ground truth。

复测旧 4.1 的标点输出、Plus 的说话人模式与词级时间戳模式，以及默认值和旧权重复用。结果只作为有日期、环境、语种和范围的证据，不要求每条素材都优于 4.1；若出现影响可用性的回归或没有可复现的新增价值，先修订接入决策，不能为凑版本保留未验收模型。

macOS Apple Silicon 和 Windows x64 的冻结包必须满足 Granite 运行时探针为 true，并各至少完成一条新模型真实转写；Windows 还要从 `0.4.0` 原位升级后执行，确认旧模型、默认设置、任务数据库与字幕版本保留。CUDA 有硬件时独立验证；没有硬件时，留下包含平台、设备、状态、待执行命令和责任交接信息的机器可读待验证记录，不宣称 CUDA 已实测。macOS 上验证的默认目标为 CPU。

源码成功不能替代冻结包成功，真实模型测试也不能替代完整发布门禁。无法完成的维护平台门禁应保持未完成，不能勾选为通过。

### 6. 版本准备使用现有工具，发布保持独立授权

模型验收和文档事实稳定后，实施阶段运行 `npm run version:bump -- 0.4.1`，检查其管理的应用 manifests、后端、Tauri、Docker / Compose / env 默认版本、Bun / Cargo 工作区版本与 README / 发布指南引用。锁文件只应包含已合入依赖状态和本次版本记录，不借 bump 再做一轮依赖升级；`bun install --frozen-lockfile` 必须达到不再改写 lock 的状态。

填完 `docs/releases/v0.4.1.md`，替换工具生成的 TODO 骨架；CHANGELOG 与发布说明按 `v0.4.0..HEAD` 整理模型接入和已合入的维护，不把 0.4.0 已发布功能重复描述为新增，也不把未验证平台或设备写成成功。更新模型指南、双语 README 的模型数量与边界、路线图和第三方声明。

本次规划不运行版本 bump；未来 apply 也只准备可审阅变更。正式 commit、push、tag 和发布按用户授权执行。版本 bump 提交不得在未获发布授权时单独合入 main 长期挂起，遵守现有发布流程的版本与 Release 同步要求。

备选方案是手工逐文件改版本或在建模前先 bump；前者容易遗漏版本源，后者增加未验证候选长期占用发布版本的风险，均不采用。

## 风险

| 风险 | 处理方式 |
| --- | --- |
| ModelScope 镜像当前未核实，两个源内容也可能不一致 | 在实施第一步记录精确 repo、revision 和原生文件集；诚实标记验证状态，证明 HF 回退，不伪造镜像可用 |
| 同一加载 API 不保证新权重在现有 lock 或冻结环境可运行 | 维持 5.17.0 基线，先跑真实分发和冻结包；必须升级依赖时先修改规划与对应 lock 验证范围 |
| 新模型共用 Granite 名称，误改旧分块或缓存身份 | 独立模型 ID 与 adapter key；断言旧 ID、文件目录、180 秒路径及 Plus 模式不变 |
| VAD 空结果、无效区间或较长素材造成尾部遗漏 | 检查 120 秒边界、过长连续语音区间、失败路径和末尾内容；新 adapter 对超长块拒绝继续推理 |
| 用户把近似时间轴或官方分数当作精确、本机结论 | 补齐中英文限制和结果提示；估算天梯与实测证据区分 |
| 单一开发机无法证明 Windows 升级与 CUDA 表现 | 分别建立冻结包 / 就地升级验收记录；未执行项保持 pending，不能用历史结果顶替 |
| 版本工具改写大量文件或缺少真实发布说明 | 核对受维护版本源与 lock 不动点，检查生成骨架已填完，引用既有 release-readiness 门禁 |

## 验证

聚焦检查围绕变更行为组织：

- `backend/tests/test_model_registry.py`：新模型的能力、语言、源候选、许可与旧模型完整集合；`backend/tests/test_api.py`：新目录记录经现有响应模型可见、缺失文件状态和打包 hidden imports。
- `backend/tests/test_speech_lm_engine.py`：120 秒边界、VAD 再拆分、无效切分拒绝、末块与偏移；通过 `transcribe_with_local_model` / `transcribe_local` 覆盖真实 registry → 引擎 → adapter 装配，不能只调用 `transcribe_chunk`。
- 前端在 `app/src/lib/modelCatalog.test.ts` 增加语种、近似时间轴、估算标记和旧条目反例，自动被 `test:frontend:unit` 收集；在已纳入 `test:e2e:maintained` 的模型 / 默认值场景中覆盖新条目，避免新建未纳入门禁的孤立用例。
- 实施迭代运行上述聚焦 pytest、`npm run test:backend:contract`、`npm run test:frontend:unit`、`npm run typecheck`、`npm run build:web` 及对应 Playwright 场景。准备完成后运行 `npm run test:backend`。
- 版本准备后运行 `npm run check:versions`、`npm run test:release-tools`、`npm run check:open-source`、`npm run audit:dependencies`；Docker、双平台 CI、冻结 smoke、Windows 升级与产物检查遵循现有发布指南，不复制或削弱现有工作流清单。
- 真实模型、冻结探针、六种导出和平台证据按决策 5 执行。报告可以保存脱敏的结构化指标与待验证记录，不入仓用户媒体、字幕、模型权重或构建产物。

## 回滚

无需数据库或模型目录 migration。下载 / 推理失败使用已有错误状态和重试，取消优先与不可变字幕版本机制保持原样；禁止静默回退到 4.1 并冒充 5.0 成功。

若新模型未通过接入门禁，停止将其纳入版本候选，保留当前源码版本和旧模型。未发布时可在该变更分支撤回新条目、adapter、UI 和版本准备的对应 diff，不删除用户新下载的目录或修改旧任务。已发布版本不移动标签、不覆盖安装包；如需撤下错误条目，应以新的修复版本处理，并保留旧任务的模型身份与结果。
