# Proposal: release-packaging-polish

## 为什么

两个发布侧的体验与效率问题：

1. Windows NSIS 安装包显示 NSIS 默认图标而非应用图标——`tauri.conf.json` 只配置了 app 图标的 `bundle.icon`，安装包图标由独立的 `installerIcon`/`uninstallerIcon` 控制且未设置。
2. 版本号虽然已被 `check-versions.mjs` 强制一致（15+ 文件），但 bump 全靠手工逐个改，且 `CHANGELOG.md` 未被检查——底部链接引用已过期（`[Unreleased]` 仍指向 `v0.1.6...HEAD`，缺 0.1.7–0.1.9 链接定义）。

## 变更内容

- `tauri.conf.json` 的 NSIS 配置增加 `installerIcon`/`uninstallerIcon`，指向已有的 `icons/icon.ico`，安装包与卸载程序图标变为应用图标。
- 新增 `scripts/bump-version.mjs` 与 `npm run version:bump X.Y.Z`：一条命令更新全部受维护版本文件（4 个 package.json、`tauri.conf.json`、`Cargo.toml`、`backend/__init__.py`、Dockerfile、compose.yaml、`.env.example`）与 CHANGELOG 链接引用，随后自动运行 `check-versions.mjs` 自证一致；lock 文件（bun.lock/Cargo.lock）提示重新生成命令。
- `check-versions.mjs` 增加 CHANGELOG 一致性断言：当前版本必须有 `## [X.Y.Z]` 小节与链接定义，`[Unreleased]` 必须指向 `v<当前版本>...HEAD`。
- 修复 CHANGELOG 现存过期链接：补 `[0.1.7]`/`[0.1.8]`/`[0.1.9]` 定义，`[Unreleased]` 改为 `v0.1.9...HEAD`。
- `docs/release.md` 的 bump 流程段落更新为先跑 `version:bump`。

## 能力（Capabilities）

### New Capabilities

（无）

### Modified Capabilities

- `release-readiness`：新增「Windows 安装包品牌标识」requirement（安装包/卸载程序使用应用图标）；新增「版本一致性工具」requirement（单命令 bump 全部版本源且版本检查覆盖 CHANGELOG）。

## 影响

- `tauri/src-tauri/tauri.conf.json`：NSIS 图标配置。
- `scripts/bump-version.mjs`（新增）、`scripts/check-versions.mjs`、`scripts/check-versions.test.mjs`、根 `package.json` scripts。
- `CHANGELOG.md`：链接引用修复（纯文档）。
- `docs/release.md`：bump 流程说明更新。
- 验证边界：macOS 无法本地构建 NSIS，图标效果由 CI Windows 构建 job 验证；`check-versions` 新增断言纳入 `test:release-tools` 单测。
- 不涉及运行时行为、API contract、持久化数据。
