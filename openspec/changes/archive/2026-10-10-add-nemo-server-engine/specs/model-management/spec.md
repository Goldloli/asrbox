# model-management Delta

## ADDED Requirements

### Requirement: NeMo server 专属引擎条目

本地模型目录 SHALL 在 server/Docker 与开发运行时提供 `nemo` 引擎条目（`parakeet-tdt-0.6b-v3`、`canary-1b-flash`），能力如实声明：词级时间戳、不支持原生说话人分离、`supported_devices` 仅 `cuda`（无 CUDA 环境显示为设备不可用）、语言覆盖按官方声明（Parakeet v3 为 25 个欧洲语言、Canary 1B Flash 为 en/de/fr/es）。两个模型 SHALL 声明 CC-BY-4.0 许可与 `attribution` 署名文本，模型详情经既有署名展示位渲染。冻结桌面运行时（PyInstaller 二进制）SHALL 完全隐藏 `nemo` 引擎条目：其运行时依赖不随桌面二进制分发，条目在桌面必然不可用，不得以"可下载但无法运行"的形态出现。`nemo_toolkit` 可安装性 SHALL 仅进入 Docker 依赖集，桌面依赖集与二进制不引入（打包静态断言防回归）。`nemo_available` 探针缺失时模型状态 SHALL 呈现本地化缺失提示。真实 CUDA 转写验证完成前，条目 SHALL 保持「未在 CUDA 上验证」的如实标注。

#### Scenario: Docker 运行时看到 NeMo 条目
- **WHEN** 在安装了 nemo-toolkit 的 server/Docker 运行时查看模型目录且 CUDA 可用
- **THEN** 两个 NeMo 条目可见、可下载（registry 管理的 `.nemo` 权重文件）、可执行转写

#### Scenario: 冻结桌面隐藏 NeMo 条目
- **WHEN** 在 PyInstaller 桌面运行时查看模型目录
- **THEN** `nemo` 引擎条目不出现在列表中，下载入口与详情均不可达

#### Scenario: server 运行时缺 CUDA
- **WHEN** server/Docker 运行时无 NVIDIA GPU
- **THEN** NeMo 条目可见但设备能力显示 cuda 不可用，下载可进行而转写给出可操作错误

#### Scenario: CC-BY-4.0 署名展示
- **WHEN** 用户查看任一 NeMo 模型详情
- **THEN** 许可与署名文本完整展示（阶段 2 预留的 attribution 展示位），第三方声明文档同步记录
