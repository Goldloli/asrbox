# Tasks: release-packaging-polish

## 1. NSIS 安装包图标

- [x] 1.1 `tauri/src-tauri/tauri.conf.json`：`bundle.windows.nsis` 增加 `"installerIcon": "icons/icon.ico"` 与 `"uninstallerIcon": "icons/icon.ico"`；验证：JSON 合法、`npm run check:versions` 不受影响（图标效果留待 CI Windows 构建验证，macOS 本地无法构建 NSIS）

## 2. 版本 bump 工具

- [x] 2.1 新增 `scripts/bump-version.mjs`：按锚定正则/JSON 字段更新 4 个 package.json、`tauri.conf.json`、`Cargo.toml`、`backend/__init__.py`、Dockerfile、compose.yaml、`.env.example`、两个 README 锚点与 `docs/release.md` 链接；CHANGELOG 晋升 `[Unreleased]` 小节并更新链接引用；缺失时生成 `docs/releases/v<新版本>.md` 骨架；best-effort 重新生成 `bun.lock`/`Cargo.lock`（`--no-lock-regen` 可跳过）；末尾调用 `checkVersions` 自证；验证：在临时目录副本上 bump 到测试版本号，lock 未重算时自证恰好列出 4 个 lock 项，模拟重算后 check 通过
- [x] 2.2 根 `package.json` 增加 `version:bump` script；验证：`npm run version:bump -- --help` 或空参数给出用法提示

## 3. check-versions 覆盖 CHANGELOG

- [x] 3.1 `scripts/check-versions.mjs`：新增 CHANGELOG 断言（当前版本小节标题、链接定义、`[Unreleased]` 起算点）；验证：`scripts/check-versions.test.mjs` 新增正反用例，`npm run test:release-tools` 通过
- [x] 3.2 修复 `CHANGELOG.md` 现存过期链接（补 `[0.1.7]`/`[0.1.8]`/`[0.1.9]`，`[Unreleased]` 改指 `v0.1.9...HEAD`）；验证：`npm run check:versions` 通过

## 4. 文档与验证

- [x] 4.1 `docs/release.md`：bump 流程段落改为先跑 `npm run version:bump`，保留 lock 重新生成与人工步骤；验证：文档与脚本行为一致
- [x] 4.2 整体验证：`npm run check:versions`、`npm run test:release-tools` 通过
