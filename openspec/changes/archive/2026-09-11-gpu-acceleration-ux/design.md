# Design: gpu-acceleration-ux

## 背景

关键代码事实（已核实）：

- 门控探测：`cuda_kit.py:240-282`，`_gpu_detect_started/_gpu_detect_result` 模块级缓存，首次 status 请求时在守护线程跑一次 nvidia-smi，**含 False 的结果被永久提供**；`_reset_probe_cache()`（`:199-206`）只清 torch probe 缓存（`platform.runtime_probe_snapshot` 的 lru_cache），不清门控。
- 前端：`CudaAccelerationSettings.tsx` 的「刷新」仅 `query.refetch()`；`gpuUnavailable`（`:38-44`）禁用开关与下载；轮询 750ms（任务中）/15s（`queries.ts:109-117`）。
- 后端硬编码中文 reason：`cuda_kit.py:339,363,372,375,378`，前端 `:225,:264` 原样渲染。
- 平台事实：非 Windows 短路 `supported:false, gpu_detected:null`（`:334-345`）→ 右栏「检测中…」永远转圈；MPS：`platform.py` 探测 `torch_mps_available` 并经 `/runtime/status` 暴露；模型注册表 `supported_devices` 含 `mps`/`mlx`；面板无任何平台分支（`SettingsPage.tsx:296,533-535`）。
- About 页已有平台判定先例：`AboutSettings.tsx:52-56` 用 `get_app_version().target`。

## 目标 / 非目标

**目标：** 探测失败可恢复（用户触发 + 套件事件自动）；原因码本地化；去「后端」术语；CUDA 面板紧凑化；macOS 显示 Apple GPU 状态面板。

**非目标：** 不改套件下载/校验/注入与 CPU 回退；不加 per-model 设备选择；Linux/web 不提供任何加速控制。

## 决策

### D1: 显式 redetect 端点，而非门控探测自动重试

新增 `POST /settings/cuda-acceleration/redetect`：清门控缓存 + torch probe 缓存，守护线程重跑 nvidia-smi，返回当前 status（`gpu_detected=null` 表示探测中，前端 750ms 轮询收敛）。备选「缓存只存 True、False 每次重探」会让 15s 轮询在无显卡机器上每拍 fork 一次子进程，代价常量化；显式动作把成本绑定到用户意图。套件下载完成（前端轮询发现 job 结束）与 `_reset_probe_cache()` 的既有调用点（toggle/delete）连带重置门控缓存。

### D2: reason_code 枚举 + 前端映射

`CudaAccelerationStatusResponse` 增 `reason_code: str | None`；五个取值见 proposal。前端映射到 i18n 短文案，`reason` 原文（英文技术细节或空）作为次级小字保留。与 change1 的 `compatibility_error_code` 同一模式。

### D3: 平台分派发在 SettingsPage，数据源用后端 platform 字段

`SettingsPage` 的 acceleration 页签内容按 `useRuntimeQuery().platform` 分派：`Windows*` + desktop → CUDA 面板；`macOS*` + desktop → 新 `AppleGpuAccelerationSettings`；其余（web/Linux/未知）→ 通用说明卡（加速设置仅桌面端可用，不产生永远 pending 的卡片）。用后端 platform 而非 Tauri target：web 运行时也能正确降级。platform 字符串格式以实现时 `/runtime/status` 实际返回为准（`platform.platform()`），匹配前缀 `Windows`/`macOS`。

### D4: macOS 面板为纯信息展示

内容：MPS 可用性（runtime status 的 torch 探测）、MLX 可用性（复用 runtime 探测结果中的 mlx 字段，若无则以模型注册表 mlx 支持静态呈现）、supported_devices 含 mps/mlx 的模型列表（来自 `/models/status`）、文案「Mac 上符合条件的模型会自动使用 Apple GPU，无需手动设置」。无开关、无下载。实现时先核对 runtime status 实际字段，缺什么就只展示可证实的部分。

### D5: CUDA 面板紧凑布局

单栏两卡片：①控制卡——标题行（状态 Badge + 刷新按钮）、开关行、状态行（显卡名 · 套件/torch 版本 · 体积）、下载/进度/错误内联区；②详情卡——检测/显卡/CUDA/套件版本/路径的定义行 + 卸载按钮。关于说明与磁盘占用合并为底部两行 muted 小字。复用 weiui 现有组件（Panel/Badge/PathRow/Progress/Switch/ConfirmAction），不引入新组件库。

## 风险

- [redetect 端点被频繁调用刷子进程] → 端点内部对「探测进行中」去重（已 started 且未完成则直接返回），前端只在用户点击与下载完成时调用。
- [e2e/单测断言旧文案或旧结构] → 更新 `cuda-acceleration.spec.ts`；全局搜「重启后端/检测中」断言。
- [macOS 面板展示了未证实的运行状态] → 只展示 runtime status 实际提供的字段，静态信息标注为「支持」而非「已启用」。
- [平台字符串解析脆弱] → 前缀匹配 + 默认落通用说明卡，不产生错误控制面。

## 回滚

还原本 change 的前后端文件即可；`reason_code` 为 additive 字段，旧前端忽略之；无数据迁移。
