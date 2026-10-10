# Design: add-nemo-server-engine

## 背景

- 模型目录与可见性：`backend/services/models.py` 的 `list_model_statuses`（:481）遍历 `get_all_model_configs()`，兼容性经 `_catalog_runtime_compatibility` 表达（mlx 在 Linux 容器显示不可用为既有先例 :435）；本 change 对 nemo 采用**隐藏**而非"显示不可用"（运行时不可能随桌面二进制分发）。
- Docker 依赖：`requirements-docker.in`（Linux 容器，python:3.14-slim-bookworm 基镜像），lock 由 Docker 构建流程再生成；桌面 `requirements-runtime.lock` / `requirements-windows.lock` 不动。
- 探针先例：`backend/services/platform.py`（funasr/qwen3/mlx 系列），模型状态文案在 `backend/services/models.py` 与本地化映射。
- 署名展示：registry `license`/`attribution` 字段 + `ModelManagement.tsx:243-246` 已渲染（阶段 2 落地）。
- 已核实（2026-10-10，hf-mirror API）：`nvidia/parakeet-tdt-0.6b-v3` 含 `parakeet-tdt-0.6b-v3.nemo`（2509MB）；`nvidia/canary-1b-flash` 含 `canary-1b-flash.nemo`（3541MB）；两者 CC-BY-4.0、非 gated。`nemo-toolkit` 3.0.0 为纯 py3 wheel（`requires_python>=3.10`），3.13 环境依赖解析通过（pip dry-run）。
- 仓库 CI 无 CUDA runner，本机无 NVIDIA GPU——真实 NeMo 转写无法在本环境执行（AGENTS 引擎门禁的"探针 true + 真实转写跑通"不可达）。

## 目标

- server/Docker 上 NeMo 双模型可下载、可转写（代码路径完整 + stub 测试），署名与许可如实。
- 桌面二进制零体积影响：nemo 不进 hidden imports、不进桌面 lock、条目冻结态隐藏，静态断言防回归。
- 验证边界如实呈现：未在 CUDA 真机验证前条目带「未验证」标注，移交项记录在案。

## 非目标

- 不引入 canary-qwen-2.5b（仓库无 `.nemo` 文件，仅 transformers 格式，`restore_from` 不适用；待上游提供 .nemo 或另行评估 transformers 路径）。
- 不引入 indicparakeet-7b（AI4B 仓库从当前网络不可核实、历史上需申请访问；待单独核实）。
- 不做 NeMo 流式、说话人、翻译方向控制等高级参数暴露（先最小可用）。
- 不在本环境伪造 CUDA 验证结论。

## 决策

### 1. restore_from 而非 from_pretrained

`ASRModel.from_pretrained("nvidia/...")` 走 NeMo 自带缓存/网络下载，绕过 ASRbox 的下载生命周期（进度、暂停、校验、存储位置）。改为 registry 源候选（HF 主源，`allow_patterns`/`required_files` 锁定 `.nemo` 单文件）经既有下载服务落地后 `ASRModel.restore_from(str(nemo_path))`。备选"from_pretrained + 手动缓存"被否决：与模型管理契约割裂。

### 2. 桌面隐藏的实现层

`get_all_model_configs()` 增加过滤：`getattr(sys, "frozen", False)` 时跳过 `engine == "nemo"` 条目。过滤放在 registry 出口（单一权威列表），`list_model_statuses` 与转写前置检查自然继承。开发运行（非冻结、未装 nemo）仍可见条目并以 `nemo_available` 探针缺失呈现——与 mlx 先例的"显示不可用"一致；只有冻结桌面（运行时绝无可能）才隐藏。

### 3. 防御性输出解析

NeMo 3.x `transcribe()` 返回结构随模型族与版本波动（字符串列表 / dict 列表 / `timestamps` 字段形态）。引擎层做防御性归一（str 或 dict.text；词级时间戳字段存在才映射），解析失败降级为整段单句结果而非崩溃。该决策降低无法真机验证带来的 API 漂移风险。

### 4. 验证边界的呈现

UI 无既有"实验性/未验证"标记体系——不新增 API 字段；以 `raw_result_summary` 之外的文档层呈现：模型详情描述文案（modelCatalog 既有描述体系）注明「需 CUDA；server/Docker 部署」；Beads asrbox-jwm 与 real_tests 待办记录 CUDA 验证移交项。这样零 contract 变化，如实信息经既有展示面传达。

### 5. requirements-docker 的 nemo extras

`nemo-toolkit==3.0.0`（pin 精确版本，NeMo 破坏性变更频繁）；**不带 `[asr]` extra**——已实测（python:3.14 容器 dry-run）该 extra 的 `nv_one_logger_pytorch_lightning_integration>=2.3.1` 在 Python 3.14 无发行版，而核心 `nemo.collections.asr`（restore_from/transcribe）在基础包内；备选方案（基镜像降 3.13 以启用 extra）保留记录，除非后续需要 extra 内的集成。不在桌面 in/lock 出现。`build_binary.py` 增加静态断言：hidden imports 与 collect 列表不得包含 nemo。

## 风险

- **NeMo API 漂移**：无法真机验证——防御性解析 + stub 测试锁住我方侧契约；CUDA 验证移交后如发现解析偏差，修复面集中在引擎单文件。
- **Docker 镜像体积**：nemo-toolkit 及其依赖使镜像显著变大——只进 Docker（用户显式选择 server 部署），记录于 docs/docker.md。
- **python 3.14 兼容**：声明 `>=3.10` 且 wheel 为纯 py3；lock 在 Docker 构建环境再生成时若解析失败，回退方案为 Docker 基镜像固定 3.13（与桌面 runtime lock 的 Python 一致化），该决策留给 lock 再生成时按实际结果定。

## 回滚

删除引擎/条目/探针/过滤/依赖改动即可整体回滚；无 API、持久化与事件变化。已下载 `.nemo` 权重为用户数据，不受影响。
