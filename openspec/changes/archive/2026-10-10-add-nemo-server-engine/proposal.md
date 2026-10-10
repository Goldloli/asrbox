# add-nemo-server-engine

## 为什么

[docs/asr-models-roadmap.md](../../../docs/asr-models-roadmap.md) 阶段 4：NVIDIA NeMo 的 Parakeet TDT 0.6B v3（25 欧洲语言、吞吐王 RTFx 3332、长音频能力）与 Canary 1B Flash（en/de/fr/es 高速多语）为 server/Docker 部署提供独有档位。`nemo_toolkit` 体积大且推理 CUDA-only，硬约束为**不进 PyInstaller 桌面二进制**：仅注册到 server/Docker 构建，冻结桌面端隐藏条目。模型均 CC-BY-4.0 非 gated（已核实 HF 元数据），署名展示路径已在阶段 2 就绪。

## 变更内容

- **新引擎 `nemo`（import 守护）**：`backend/backends/local_asr.py` 新增 `NemoASRBackend`——经 `nemo_toolkit` 的 `ASRModel.restore_from` 加载本地下载的 `.nemo` 文件（registry 管理下载，不经 `from_pretrained` 自带缓存），CUDA 设备显式选择，转写输出与时间戳解析映射到 `TranscriptionResult`；`nemo_toolkit` 不可导入时给出明确运行时缺失态（探针 `nemo_available`），不崩溃。
- **模型目录新增两个条目**：`parakeet-tdt-0.6b-v3`（25 欧洲语言、词级时间戳、cpu/cuda 声明为 cuda-only、CC-BY-4.0 署名）与 `canary-1b-flash`（en/de/fr/es、词级时间戳、CC-BY-4.0 署名）。`supported_devices=["cuda"]`，长音频上限按官方声明处理（超过即经既有 fsmn-vad 切分）。
- **桌面不可见过滤**：冻结桌面运行时（`sys.frozen`）的模型列表过滤 `nemo` 引擎条目（引擎运行时无法随二进制分发，与 mlx 在 Linux 上"显示但不可用"的语义不同：NeMo 在桌面必然不可用，显示只会误导）；server/Docker/开发运行完整可见，缺 CUDA 时按设备能力显示不可用。
- **Docker 依赖**：`requirements-docker.in` 增加 `nemo-toolkit==3.0.0`（纯 py3 wheel，`requires_python >=3.10`；不带 `[asr]` extra——该 extra 的 one-logger 依赖在 Python 3.14 无发行版，已实测；核心 ASR 能力在基础包内），lock 在 Docker 构建环境按项目流程再生成；桌面两套 lock 不动。
- **署名**：两个模型的 `attribution` 字段填入 CC-BY-4.0 要求的署名文本，模型详情经既有展示位渲染；`THIRD_PARTY_NOTICES.md` 同步。
- **验证边界（如实声明）**：本仓库 CI 无 CUDA runner、开发机无 NVIDIA GPU——真实 NeMo 转写无法在本环境执行。本 change 覆盖：registry/引擎/过滤/署名的单元与契约测试（stub 引擎）、Docker 构建含 nemo 依赖的解析、桌面二进制不含 nemo 的静态断言；**真实 CUDA 转写验证**（AGENTS 引擎门禁：探针 true + 至少一条真实转写）作为显式移交项记录于 Beads 与 real_tests 待办，未完成前引擎条目在 UI 中保持「未验证」标注。

## 能力（Capabilities）

### 新增能力

（无）

### 修改的能力

- `model-management`：新增"NeMo server 专属引擎" requirement——目录条目、桌面隐藏语义、CUDA-only 设备声明、CC-BY-4.0 署名、运行时缺失态。
- `transcription-lifecycle`：新增 NeMo 引擎行为 requirement——restore_from 本地权重、设备显式选择、长音频 VAD 切分、验证边界声明。

## 影响

- 代码：`backend/backends/local_asr.py`（引擎）、`backend/backends/registry.py`（条目 + 冻结过滤）、`backend/services/platform.py`（`nemo_available` 探针）、`backend/services/models.py`（过滤与文案）、`requirements-docker.in/.lock`、`THIRD_PARTY_NOTICES.md`。
- 桌面二进制与桌面 lock 零变化；`build_binary.py` 不引入 nemo（新增静态断言防回归）。
- 范围裁剪（如实记录）：`canary-qwen-2.5b` 仓库无 `.nemo` 文件（仅 transformers 格式），restore_from 路径不适用，待上游提供或另立 transformers 路径评估；`indicparakeet-7b`（AI4B）仓库从当前网络不可核实且历史上需申请访问，暂缓。
- 风险：NeMo transcribe API 的返回结构随版本变化（3.0.0）——实现以官方文档/源码为准并做防御性解析；CUDA 真机行为未验证（显式移交）。
