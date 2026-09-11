# 提案：Windows CUDA 加速套件（windows-cuda-installer）

## 为什么

Windows 桌面端（`windows-desktop-support`，0.1.9）发布的是 CPU-only torch 构建：PyPI 默认 wheel 不含 CUDA，后端引擎的 `torch.cuda.is_available()` 自动选路恒为 False，NVIDIA GPU 机器上本地模型全程 CPU——实测 whisper-large-v3 处理 90 秒音频需 329 秒（0.27x 实时）。

同机实测（RTX 3080 Ti）：换装 `torch 2.11.0+cu128`（同版本 CUDA 构建变体）后 14 个 Windows 可用模型全部自动切换 CUDA，加速 1.0x–10.7x，后端 424 项测试零回归。

双安装器方案（CPU 版 + CUDA 版）经评估被用户否决，改为**应用内 CUDA 加速套件**：单一安装器保持小巧，设置页提供"CUDA 加速"开关，开启时按需下载一次性加速套件并自动配置，关闭即回 CPU——避免每个 CUDA 用户每次升级重下 ~2.5GB 安装器，同时绕开 GitHub Release 单资产 2GB 上限。

## 变更内容

- 设置页新增 **CUDA 加速**开关（仅 Windows 且检测到兼容 NVIDIA GPU 时可用；其余平台/硬件隐藏或置灰并说明）。开启 → 提示并下载 CUDA 加速套件（约 3GB，一次性，含进度/取消/失败重试，复用模型下载交互模式）；下载校验完成后重启后端生效。关闭 → 后端忽略套件目录，恢复 CPU。切换需重启后端，走既有 `restart_server` 通道。
- 后端新增套件管理：下载（复用托管下载的进度/取消/校验框架）、SHA-256 逐文件校验、版本绑定（套件 manifest 钉死 torch 版本与文件清单哈希）、启停状态持久化、失效检测（应用升级致 torch 版本不匹配时标记失效并提示重下）。
- 冻结后端启动早期（任何 torch 导入之前）支持经环境变量注入套件目录到 `sys.path` 最前；CPU torch 休眠于 `_internal` 不加载。注入失败有界探测、诚实报错并保持 CPU。**该注入机制是方案关键未知点，以 spike 任务先行验证，失败则整体回退双安装器方案。**
- `/health` 的 `gpu_available` 从硬编码 `false` 修正为如实反映 CUDA 可用性（字段已声明于 `HealthResponse`，无 contract 形状变化）。
- CI/release：新增套件打包 job（从 cu128 锁构建套件 zip + manifest + SHA256，作为 Release 资产或 modelscope 分发；Windows 安装器资产维持单一不变）；`verify-release-assets.sh`/`check-versions.mjs` 同步套件资产断言。
- README（双语）、`docs/releases/v0.1.9.md`、`docs/ci.md`：套件功能说明（硬件前提、一次性下载体积、开关语义、失效重下）。

## 能力（Capabilities）

### New Capabilities

（无）

### Modified Capabilities

- `model-management`：`Controlled model download lifecycle` 扩展覆盖托管运行时套件下载（进度/取消/校验/失效）；`Model data boundary` 增加套件数据驻留数据目录、不进仓库与安装器的要求；新增"加速状态如实报告"要求（`gpu_available` 写实、注入失败保持 CPU 并诚实报错）。
- `release-readiness`：`Verifiable release artifacts` 增加可选加速套件作为独立校验资产分发、清单与哈希钉定于发布元数据的要求（Windows 安装器维持单一资产不变）。

## 影响

- **依赖与锁**：新增 `requirements-windows-cuda.lock`（`torch==2.11.0+cu128` 及其 `nvidia-*` 依赖，`--extra-index-url` 指向 pytorch cu128 源）作为套件构建输入；现有 CPU 锁保持为安装器/开发基线不变；macOS 锁零改动。
- **代码**：`backend/server.py` 与本地任务 worker 启动注入（spike 验证）、套件下载/校验/生命周期 service 与路由、设置页开关与下载 UI（typed client 复用既有模式）、`health.py` 写实、`scripts/build-cuda-kit`（CI 打包）、release.yml 套件 job、文档。
- **安全/信任边界**：套件为原生可执行代码——发布元数据钉 SHA-256、后端侧逐文件验证、仅接受固定项目可信来源（Release 资产或项目 modelscope 仓库），遵循 AGENTS.md 下载校验约束。
- **CI 资源**：新增套件打包 job（下载 ~3.5GB wheel，可缓存）；不增加 Windows 安装器构建维度。
- **不受影响**：macOS 全部行为与资产；安装器内容/体积/命名；更新器既有资产匹配（单一 Windows 资产，无变体维度）；API contract 形状（套件路由为新增端点，既有字段不变）；`windows-desktop-support` 已验证门禁。
