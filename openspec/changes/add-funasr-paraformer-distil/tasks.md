# tasks

## 1. 仓库与元数据核实

- [x] 1.1 用脚本核实三个模型的源仓库可用性、文件清单与体积：ModelScope `iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch`、`FunAudioLLM/Fun-ASR-Nano-2512`、HF `funasr/paraformer-zh` 镜像、HF `Systran/faster-distil-whisper-large-v3`；确认 `allow_patterns` 匹配各仓库实际文件，产出核实记录供 registry 常量回填
- [x] 1.2 更新 `THIRD_PARTY_NOTICES.md`：登记 Paraformer 模型协议、Fun-ASR-Nano Apache 2.0、Distil-Whisper MIT，并核对署名要求

## 2. registry 目录条目

- [x] 2.1 在 `backend/backends/registry.py` 新增 `paraformer-zh`、`fun-asr-nano`（funasr 引擎，含核实后的 source_candidates / size_mb / 能力标志）条目，并扩展 `backend/tests/test_model_registry.py` 断言两条目的引擎、语言、时间戳与设备声明；跑 `pytest backend/tests/test_model_registry.py` 通过
- [x] 2.2 新增 `faster-whisper-distil-large-v3` 条目（仅英文语言声明），同文件补断言；跑 `pytest backend/tests/test_model_registry.py` 通过

## 3. FunASR adapter 与 VAD

- [x] 3.1 在 `backend/backends/local_asr.py` 引入模型名 → adapter 注册表（SenseVoice 清洗、Paraformer 解析、Fun-ASR-Nano 直通；未知条目回退现行为），重构 `FunASRBackend` 使用 adapter，保持 SenseVoice 输出与现状逐字段一致；stub AutoModel 单测对比重构前后结果
- [x] 3.2 实现 Paraformer 字级时间戳→句段聚合（标点/静默间隔切分，缺失 timestamp 时退化为整段文本且不伪造时间轴），stub 单测覆盖正常聚合、异常退化、时间轴单调性；跑 `pytest backend/tests/ -k funasr` 通过
- [x] 3.3 为 `paraformer-zh`、`fun-asr-nano` 默认挂 `fsmn-vad`（`max_single_segment_time=30000`），任务选项 `vad` 可覆盖；stub 单测断言 VAD 参数随模型默认与任务覆盖变化，且 SenseVoice 不挂 VAD；跑相关 pytest 通过

## 4. API 与状态集成

- [x] 4.1 验证模型状态/兼容性探测覆盖三个新条目（runtime probe、`supported_devices` 过滤、未下载文案复用现有原因码），补 `backend/tests/test_api.py` 模型目录断言；跑 `npm run test:backend` 通过
- [x] 4.2 跑 `npm run test:backend:contract` 确认无契约变化

## 5. 真机验证与文档

- [x] 5.1 真机下载并转写三个模型（中文长音频 + 英文音频样本），核对 Paraformer 句段时间轴覆盖与单调性、Fun-ASR-Nano 文本完整性、Distil 英文转写与词级时间戳；结果记录到 `backend/real_tests/`
- [x] 5.2 二进制 smoke：断言 frozen 注册表包含三个新条目（`backend/tests/test_binary_smoke.py` 或等价门禁），本地跑通对应测试
- [x] 5.3 更新 `docs/asr-models-roadmap.md` 阶段 1 状态与 README（如受维护模型清单存在）；跑 `npm run check:open-source` 通过

## 6. 真实场景基准与天梯实测

- [x] 6.1 以用户提供的 18:05 英文真实视频 + 90 秒中文片段，经生产推理路径实测三模型与 turbo 参照的速度与准确率，证据沉淀 `backend/real_tests/results/asrbox-real-video-benchmark-20260919*.md/json`
- [x] 6.2 将实测 S/A/B/C 等级与测量口径写入模型天梯 `app/src/lib/modelCatalog.ts`，未实测维度不虚构

## 7. 模型页视觉验证与文案一致性

- [x] 7.1 起本地前端与后端（仓库 `data/` 目录），在真实 `/models` 页面目视验证三个新模型与既有模型呈现一致：列表行显示「已下载」、CPU/GPU 徽标、速度/准确率等级与能力标签，操作区提供「设为默认」
- [x] 7.2 展开「模型天梯」，确认三条新条目显示实测等级（`S S B` / `S A B` / `C A B`）且不带「估算」`*` 标记；全表仅既有的 MLX Turbo 为估算条目
- [x] 7.3 逐条打开详情（ⓘ）核对能力/语言覆盖/设备/已知限制：Paraformer 声明段级时间戳（字级聚合）与「无词级时间戳」，Fun-ASR-Nano 声明近似时间轴，Distil 声明仅英文且能力列表不再出现「多语言识别」矛盾项
- [x] 7.4 核对分类过滤归属：「中文优先」包含 Paraformer 与 Fun-ASR-Nano，「Faster Whisper」包含 Distil
- [x] 7.5 修正两处文案偏差并重跑前端门禁：`faster-whisper-distil-large-v3` 详情能力列表改为「段级时间戳/词级时间戳/英文识别」（原复用 Faster Whisper 能力模板导致与「仅英文」自相矛盾），天梯脚注 `models.ladderNote` 更新为覆盖两轮实测口径；`npm run typecheck` 与 `npm run test:frontend:unit` 通过
- [x] 7.6 确认模型列表中未下载模型的红色内联提示（`compatibility_error_code = model_not_downloaded`）为既有行为而非本次回归：后端 `backend/services/models.py` 既有实现、`backend/tests/test_api.py` 既有断言，且本分支未改动 `ModelManagement.tsx` / `errorMessages.ts`

## 8. 打包版（DMG）真实转写验证与冻结包修复

用户在打包版客户端用新模型转写真实视频直接失败，据此定位并修复两处冻结包缺口：

- [x] 8.1 复现并定位：18:05 英文视频 + `faster-whisper-distil-large-v3` 在打包版失败，`error_code = MODEL_LOAD_FAILED`，错误为 `Load model .../faster_whisper/assets/silero_vad_v6.onnx failed: File doesn't exist`——`backend/build_binary.py` 对 funasr/mlx 都做了 `--collect-data`，唯独漏了 faster_whisper，VAD 资源未随包分发
- [x] 8.2 修复并加静态断言：`--collect-data faster_whisper`；`backend/tests/test_api.py` 的打包断言改为断言 `--collect-data` 全序 `["funasr", "faster_whisper", "mlx", "mlx_whisper"]`
- [x] 8.3 冻结二进制实测暴露第二处缺口：带 VAD 的 FunASR 加载失败（`model 'Paraformer' is not registered`）。根因是 `funasr.models.paraformer.cif_predictor` 用 `@torch.jit.script`，而 PyInstaller 从 PYZ 导入、包内无 `.py` 源码，TorchScript 报 `Expected a single top-level function` 导致模块导入失败、模型类未注册
- [x] 8.4 修复并加静态断言：`backend/build_binary.py` 构建期扫描已安装 funasr 中包含 `torch.jit.script` 的源码文件并逐个 `--add-data` 到对应包路径（随版本自适应，不硬编码文件名）；打包断言新增对 `cif_predictor.py:funasr/models/paraformer` 的检查
- [x] 8.5 冻结二进制端到端复测：以临时数据目录（软链三个模型）启动 `dist/asrbox-server`，经 `POST /transcriptions/path` 实测 distil（英文真实视频）、paraformer-zh、fun-asr-nano（90 秒中文片段）三条转写全部 `completed` 并产出非空字幕段（21/8/7 段）；同日前一版二进制上 distil 全片 18:05 视频产出 256 段
- [x] 8.6 重新打包 DMG 并验证产物（挂载核对 sidecar 与前端产物）

## 9. 打包版 distil 转写过慢（线程上限）

用户实测打包版转写同一 18:05 视频明显慢于预期，定位为冻结包内的线程上限：

- [x] 9.1 复现并量化：打包版 distil 90 秒片段 57–60s（同任务开发环境 21.1s）；推理期间 worker 进程 CPU ≈ 100%（单核），开发环境同口径 ≈ 395%（约 4 核）
- [x] 9.2 定位根因：`backend/pyi_rth_numpy_torch.py` 运行时钩子 `os.environ.setdefault("OMP_NUM_THREADS", "1")` 被推理 worker 继承，CTranslate2 的 CPU 推理随之退化为单线程；实测同机线程数扫描 1→57s、4→21.1s、8→15.1s、16→15.2s
- [x] 9.3 修复：`backend/services/tasks.py` 新增 `_local_worker_environment(concurrency)`，worker 子进程按 `cpu_count // 并发上限` 显式设置 `OMP_NUM_THREADS`（并发默认 1、可配 1–4），主进程保留启动期保守设置；钩子内补注释说明两侧的依赖关系，避免被误删
- [x] 9.4 单测覆盖：`backend/tests/test_local_task_worker.py` 新增线程上限解除与并发分摊断言，并补齐既有 settings 桩缺失的 `max_concurrent_local_tasks` 字段
- [x] 9.5 冻结二进制复测：重建后 `dist/asrbox-server`（不做任何外部环境变量覆盖）distil 90 秒 15.1s（两次一致），18:05 全片 129.6s（修复前 600.9s），字幕结果与修复前逐字一致（256 段 / 10777 字符）
- [x] 9.6 回归与重打包：`npm run test:backend` 550 通过、`npm run test:backend:binary-smoke` 通过，随后重打 DMG
- [x] 9.7 逐引擎排查影响面（进程内 A/B，`OMP_NUM_THREADS` 1 vs 16，90 秒片段）：CTranslate2 大模型影响严重（distil 56.8s → 13.1s，约 4.3 倍），CTranslate2 小模型无影响（faster-whisper-base 4.1s → 6.1s，单线程反而略快），torch/transformers 与 FunASR 无影响（whisper-base 5.8s 持平、fun-asr-nano 27.4s 持平），MOSS 轻微（19.9s → 16.8s）
- [x] 9.8 修复后全模型复测（打包版热态 vs 开发环境热态，7 模型覆盖 4 引擎，90 秒片段）：whisper-base 8.1/8.1s、faster-whisper-base 8.1/8.1s、faster-whisper-large-v3-turbo 16.1/16.1s、distil 14.1/14.1s、moss 22.1/20.1s、paraformer-zh 12.1/12.1s、fun-asr-nano 30.1/30.1s；全部 `completed` 且段数/字符数与开发环境一致。唯一残留差异是安装新构建后的首个任务偏慢（冷启动：whisper-base 首跑 42.3s vs 热态 8.1s）
