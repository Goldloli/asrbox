## 背景

本地模型的静态目录定义在 `backend/backends/registry.py`，`backend/services/models.py::list_model_statuses` 将其转换为 `/models/status` 的 `ASRModelStatus`。前端通过 `app/src/lib/api.ts::ModelStatus` 同时驱动 `app/src/routes/TranscribePage.tsx` 的模型选择器，以及 `app/src/routes/ModelsPage.tsx` / `app/src/components/models/ModelManagement.tsx` 的下载、推荐和详情界面。

实际设备选择分散在各引擎实现中：标准 Whisper 选择 CUDA、MPS 或 CPU；Faster Whisper、FunASR 和 MOSS 选择 CUDA 或 CPU；Qwen3-ASR 的 Transformers 自动映射可选择 CUDA、MPS 或 CPU；MLX Whisper 只在 Apple Silicon 上通过 MLX 使用 Apple GPU。当前 API 没有表达这些差异，前端也不应通过 `engine` 字符串自行推断。

## 目标 / 非目标

**目标：**

- 由后端模型 registry 维护每个模型可使用的推理设备族，并通过受类型约束的模型状态 contract 返回。
- 在模型选择器中提供不会显著撑宽选项的 CPU / GPU 摘要。
- 在模型下载列表、推荐卡片和详情中提供更具体的 CUDA、MPS、MLX 标签与平台说明。
- 明确“支持 GPU”是能力信息，最终实际设备仍取决于当前机器、运行时可用性及既有回退逻辑。

**非目标：**

- 不增加手动设备选择器，也不改变任何引擎现有的自动选择顺序。
- 不测量或承诺具体速度，不把静态能力信息描述为当前任务已使用的设备。
- 不改变模型兼容性、下载生命周期、模型推荐算法或运行时依赖。

## 决策

1. 在 `ASRModelConfig` 和 `ASRModelStatus` 增加必需字段 `supported_devices`，值限定为 `cpu`、`cuda`、`mps`、`mlx`。
   - 选择结构化枚举而非后端返回自然语言，便于中英文展示、contract 校验和未来精确筛选。
   - 不复用全局 `gpu_available`，因为它描述当前设备而非单个模型能力，且无法区分 CUDA、MPS 与 MLX。

2. 元数据按 ASRbox 当前实际设备选择路径维护。
   - Whisper Transformers：`cpu`、`cuda`、`mps`。
   - Faster Whisper、SenseVoice/FunASR、MOSS：`cpu`、`cuda`。
   - Qwen3-ASR：`cpu`、`cuda`、`mps`。
   - MLX Whisper：`mlx`，同时沿用现有兼容性逻辑限制在 macOS Apple Silicon。
   - 备选方案是在前端按 `engine` 推导；拒绝该方案，因为新增引擎或后端行为调整会让两个页面静默失真。

3. 前端使用一个纯函数把详细设备枚举转换为两种表示。
   - 模型选择器使用紧凑摘要：`CPU / GPU`、`仅 CPU` 或 `仅 GPU`。
   - 模型管理页使用 `CPU`、`NVIDIA GPU`、`Apple GPU (MPS)`、`Apple GPU (MLX)` 的具体标签，并在详情内显示统一提示。
   - 备选方案是在下拉选项中列出全部后端名；拒绝该方案，因为窄窗口下会明显降低模型名称可读性。

4. 新字段作为 `/models/status` 的必需字段随 producer、Pydantic `response_model`、TypeScript client 和 contract 测试一同交付。旧字段和路由保持不变。

## 风险

- [设备枚举与引擎实现未来发生漂移] → registry 测试按引擎断言设备矩阵；修改设备选择逻辑时需同步 registry 元数据。
- [用户把 GPU 能力误解为当前已启用 GPU] → 两个页面均提供“最终设备取决于当前机器和运行时”的说明，不展示“正在使用”措辞。
- [窄窗口的选择器标签过长] → 下拉项只显示 CPU/GPU 聚合摘要，详细加速器名称放在模型管理页。
- [新增必需 API 字段影响旧后端与新前端的混用] → 前端格式化函数对缺失或空数组返回“设备未知”，但维护中的后端 contract 强制提供字段。

## 回滚

若展示导致兼容或布局问题，可同时移除 registry/Pydantic/TypeScript 的 `supported_devices` 字段及两个页面的展示辅助组件，并恢复对应 contract 测试和规格；该变更不迁移持久化数据，也不改变模型文件，可直接按代码版本回滚。
