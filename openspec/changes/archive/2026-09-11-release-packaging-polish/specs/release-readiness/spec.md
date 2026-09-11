# release-readiness Delta: release-packaging-polish

## ADDED Requirements

### Requirement: Windows 安装包品牌标识

Windows NSIS 安装包与卸载程序 SHALL 使用应用自身图标，不得回退到 NSIS 默认图标。

#### Scenario: 构建 Windows 安装包

- **WHEN** 发布流程构建 Windows x64 NSIS 安装包
- **THEN** setup.exe 文件图标、安装窗口图标与卸载程序图标均为应用图标（`icons/icon.ico`）

### Requirement: 版本一致性工具

仓库 SHALL 提供单命令版本 bump 工具：给定新版本号，更新全部受维护版本源文件与 CHANGELOG 链接引用，并自动运行版本一致性检查自证。版本一致性检查 SHALL 在现有文件清单之外覆盖 CHANGELOG：当前版本必须存在对应小节标题与链接定义，`[Unreleased]` 链接必须从当前版本标签起算。

#### Scenario: 维护者 bump 版本

- **WHEN** 维护者运行版本 bump 命令并给出新版本号
- **THEN** 全部受维护版本源文件与 CHANGELOG 链接引用被更新，且随后的版本一致性检查通过

#### Scenario: CHANGELOG 链接过期

- **WHEN** CHANGELOG 缺少当前版本的链接定义，或 `[Unreleased]` 未从当前版本标签起算
- **THEN** 版本一致性检查失败并指出缺失项
