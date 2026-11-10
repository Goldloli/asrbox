## 1. 来源核验与模型目录

- [x] 1.1 核实 Granite Speech 5.0 2B 的 ModelScope 精确镜像 ID、官方 HF repo、revision、原生推理文件集及实际托管下载量，验证主源与 HF 回退；交付脱敏来源记录，无法核实的候选不得标记 `verified=True`，两个源均不可用时本项保持未完成。
- [x] 1.2 在 `backend/backends/registry.py` 新增独立 `granite-speech-5.0-2b` 条目，登记六种语言、CPU / CUDA、Apache-2.0 和全 false 的原生时间戳 / 说话人 / 流式能力；运行 `backend/tests/test_model_registry.py`，断言旧 4.1 / Plus ID、设备矩阵、源候选和目录集合继续保留。

## 2. 后端执行与完整性

- [x] 2.1 增加复用 Granite 实现的 `granite_speech_5` adapter，独立设置 120 秒策略并拒绝送入超长块，复用现有运行时探针与分发；测试 120 秒边界、过长 VAD 区间再切分、空 / 无效切分失败及尾块偏移，并断言旧普通版仍为 180 秒、Plus 行为不变。
- [x] 2.2 根据 1.1 的原生文件集补充新模型的完整性判定；在 `backend/tests/test_api.py` 覆盖缺少权重、tokenizer、processor 或聊天模板的失败状态和新目录记录经现有 response model 可见，验证本地执行不静默联网补齐文件，且旧模型判定不被收紧。
- [x] 2.3 在 `backend/tests/test_speech_lm_engine.py` 覆盖 registry → `transcribe_with_local_model` / `transcribe_local` → 引擎 → 新 adapter 的装配与长音频完整输出，运行相邻生命周期取消 / 重试回归；不能仅测试 adapter 内部方法，不能以其它模型结果替代 5.0 成功。
- [x] 2.4 在 `backend/tests/test_api.py` 的打包参数断言中验证新模型需要的 Granite configuration / feature extraction / modeling / processor 模块均被收集，必要时仅补 `backend/build_binary.py` 缺项；保留既有依赖版本和探针字段，源码探针结果为 `granite_speech_available=true` 才视为完成，冻结探针另见第 4 组。

## 3. 模型展示与默认值联动

- [x] 3.1 在 `app/src/lib/modelCatalog.ts` 补齐中英文描述、详情、用途和近似时间轴识别；检查模型页、选择器与结果提示均显示六种 ASR 语言、CPU / CUDA、无原生时间戳，不把模型列为中文或 Apple GPU 模型，不改用户默认值与全局推荐清单。
- [x] 3.2 在 `app/src/lib/modelCatalog.test.ts` 覆盖新条目、估算标记、近似时间轴与旧条目反例，并扩展已有模型 / 默认值 Playwright 场景，验证 `npm run test:frontend:unit` 与相关浏览器用例通过；确认用例仍分别由 `test:frontend:unit` 和 `test:e2e:maintained` 聚合入口覆盖。

## 4. 真实模型与冻结包验收

- [x] 4.1 使用合法的英文清晰语音、噪声语音、日语及超过两分钟的长音频，经托管下载后的完整 backend 路径对比 5.0 和 4.1 普通版，验证尾部覆盖和六种导出；交付有日期、上游 revision、环境、耗时、峰值内存与质量观察的脱敏报告，准确率评测使用人工核对参考文本，记录是否存在可复现的新增价值。
- [x] 4.2 真实复测旧 4.1 标点输出及 Plus 说话人、词级时间戳两个模式，验证旧权重无需重下、默认值和历史字幕版本保留；在同一验证报告中分别记录范围和结果，不能借新模型之名强制更新 Plus 权重。
- [x] 4.3 构建 macOS Apple Silicon 冻结 sidecar / 桌面候选，确认 `granite_speech_available=true`、5.0 独立条目可见，并通过完整 backend 路径至少完成一条新模型真实转写；交付冻结包 CPU 验收记录，源码测试或旧二进制结果不能替代。
- [x] 4.4 在 Windows x64 冻结候选及从 `0.4.0` 就地升级后的安装上验证新模型真实转写、运行时探针、旧模型 / 默认值 / 任务与字幕版本保留，确认安装目录没有旧依赖残留；交付 Windows 验收记录。2026-11-10 在 Windows 11 x64 完成：安装版 `granite_speech_available=true`，安装版 backend 完成 25.3 秒真实转写（412.2 s、390 字符、5 段、六种导出）；`0.3.2 → 0.4.0 → 0.4.1` 同目录覆盖升级后 18 个任务、2,358 个字幕段、18 个版本与 10 个模型目录原样保留，旧 `granite-speech-4.1-2b` 免重下可转写；安装树与新建产物字节一致、无旧依赖残留。记录：`backend/real_tests/results/asrbox-granite-speech-5.0-windows-verification-20261110.md`。
- [x] 4.5 有兼容 NVIDIA GPU 时独立验证 CUDA 执行；没有硬件时交付机器可读的 pending 记录，包含平台、设备、待执行命令、未验证原因和交接信息，并在发布说明中如实界定证据。本项只有在 CUDA 实测或完整 pending 移交记录存在时才可完成，不能以 CPU 结果宣称 CUDA 已验证。2026-11-10 在 RTX 2060 SUPER（8 GB、sm_75、驱动 560.94）完成实测：官方 CUDA 套件（torch 2.11.0+cu128）经 manifest 校验，`_speech_lm_device_map()` 返回 `auto`，模型加载到 `cuda:0`；源码 HTTP、进程内分发与冻结安装版（`ASRBOX_CUDA_KIT_DIR`）三条路径均完成真实转写，短音频输出与 CPU 逐字一致（冻结版 40.9 s vs CPU 412.2 s）；记录 8 GB 显存下 150 秒长音频触发 accelerate 部分下沉。记录：`backend/real_tests/results/granite-speech-5.0-cuda-verification-20261110.md`。

## 5. 版本与发布文档准备

- [x] 5.1 更新 `README.md`、`README.en.md`、`docs/models.md`、`docs/asr-models-roadmap.md` 和 `THIRD_PARTY_NOTICES.md`，核对本地模型数量为 26、另有 2 个 server-only 条目，并写明 5.0 六语种、近似时间轴、许可、来源与实际验收范围；不改写历史版本文档或把未实测能力写成已通过。
- [x] 5.2 模型验收可进入版本候选后运行 `npm run version:bump -- 0.4.1`，核对工具管理的全部版本源、Bun / Cargo 工作区版本与发布引用；`npm run check:versions` 和 `bun install --frozen-lockfile` 通过，锁文件达到不再改写的状态，diff 不混入新的无关依赖升级。
- [x] 5.3 按 `v0.4.0..HEAD` 整理已经合入的维护与本次模型接入，填完 `CHANGELOG.md`、`docs/releases/v0.4.1.md` 和 `docs/release.md`，移除发布说明骨架 TODO；核对版本、下载资源名、比较链接、平台限制与证据日期，不重复把 0.4.0 功能列为新增。

## 6. 集成门禁与归档

- [x] 6.1 完成相关聚焦 pytest、`npm run test:backend`、`npm run test:backend:contract`、`npm run test:frontend:unit`、`npm run typecheck`、`npm run build:web` 与相关 Playwright 验证；记录命令、结果及覆盖的新行为，保留已有测试断言语义。
- [x] 6.2 运行 `npm run test:release-tools`、`npm run check:open-source`、`npm run audit:dependencies` 与 `npm run test:docker`；按既有 release-readiness 核验双平台 CI、冻结 smoke 和候选产物校验。不可执行的必需门禁明确留待交接，本项保持未完成，不以本地单平台通过替代发布就绪。 2026-11-10 复核通过：CI run https://github.com/Goldloli/asrbox/actions/runs/42759413572 全绿（macOS Typecheck/tests/Rust、Windows backend、Docker build+deployment smoke）；Release run https://github.com/Goldloli/asrbox/actions/runs/42759425524 全绿（Docker verify、CUDA kit、macOS DMG + frozen smoke、Windows NSIS + frozen smoke、publish），产物校验与 SHA256SUMS 由发布工作流生成；本地补充：test:release-tools 22 passed、audit:dependencies 通过、check:versions 0.4.1。
- [x] 6.3 按 proposal 的接触点和非目标审阅最终 diff，确认源码、测试、文档与两份 delta 一致，无 API / 事件 / 持久化 contract 扩展，也没有用户媒体、字幕、权重、构建产物或交互记录入仓；运行 `openspec validate --changes prepare-v0-4-1` 通过。
- [x] 6.4 仅在实施及所有必需验收完成后勾选 tasks，并执行 `openspec archive prepare-v0-4-1 --yes`、`openspec list --json` 与 `openspec validate --specs`，确认主规格已同步且 change 已归档；本 change 交付发布准备，commit、push、tag 和正式发布由用户另行明确授权。 2026-11-10 执行 `openspec archive prepare-v0-4-1 --yes` 归档，delta 合入主 spec，Release：https://github.com/Goldloli/asrbox/releases/tag/v0.4.1。
