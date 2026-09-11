# Design: release-packaging-polish

## 背景

- NSIS 图标：`tauri/src-tauri/tauri.conf.json:31-47` 的 `bundle.icon` 仅影响应用本体；tauri-bundler 的 NSIS 模板仅在配置 `installerIcon`/`uninstallerIcon` 时定义 `MUI_ICON`/`MUI_UNICON`，否则回退 NSIS 自带 `modern-install.ico`。`icons/icon.ico`（94 KB，含 6 个内嵌尺寸）已存在并在 `bundle.icon` 列表中。
- 版本文件清单与校验逻辑在 `scripts/check-versions.mjs`（根 package.json 为基准）；`docs/release.md` 记录了手工 bump 清单。CHANGELOG 底部链接引用：`[Unreleased]` → `v0.1.6...HEAD`（过期），缺 `[0.1.7]`–`[0.1.9]`。

## 目标 / 非目标

**目标：**

- 下一个 Windows 安装包/卸载程序使用应用图标（纯配置，零新资源）。
- `npm run version:bump X.Y.Z` 一条命令完成机械 bump + 自校验。
- `check-versions.mjs` 覆盖 CHANGELOG 链接一致性，现有过期引用修复。

**非目标：**

- 不改发布工作流的 job 结构；不引入 `changesets` 等外部工具。
- bump 脚本不自动生成 release notes 小节、不改 README/docs 的版本锚点文案（仍由 `check-versions` 把关、人工更新）。
- 不自动重新生成 `bun.lock`/`Cargo.lock`（脚本打印提醒命令；二者由 `bun install`/`cargo` 在各自工具链下生成， bump 后的 check 会捕获遗漏）。

## 决策

### D1: 图标走 NSIS 配置而非自定义模板

`installerIcon`/`uninstallerIcon` 是 tauri-bundler 官方字段，恰好覆盖 setup.exe 文件图标、安装窗口图标、卸载程序图标。备选「自带 .nsi 模板」可以连 Welcome/Finish 侧图也品牌化，但需要新增 BMP 美术资源并维护模板，超出本次范围。

### D2: bump 脚本复制目标清单而非复用 check 内部结构

`check-versions.mjs` 是校验器不是库（但导出 `checkVersions` 供 bump 末尾自证）；`bump-version.mjs` 按文件类型（JSON 字段 / TOML 正则 / Python 赋值 / Dockerfile ARG / compose 默认值 / .env / README 与 release 指南锚点 / CHANGELOG 小节与链接）各自精确重写，并在 `docs/releases/v<新版本>.md` 缺失时生成包含 tag 与安装包文件名的骨架（否则 check 的 release-notes 断言会在 bump 后立即失败）。lock 文件由脚本 best-effort 调用 `bun install --lockfile-only` 与 `cargo check` 重新生成（可用 `--no-lock-regen` 跳过），最终 check 失败时会明确指出剩余手工项。备选「把 check 重构成可导入模块」只做了最小提取，没有无谓扩大 diff。

### D3: CHANGELOG 检查只断言链接层与小节标题，不断言正文

正文小节内容无法机械验证；检查三件事：存在 `## [X.Y.Z]` 小节标题、存在 `[X.Y.Z]:` 链接定义、`[Unreleased]` 指向 `vX.Y.Z...HEAD`。bump 脚本对应地：把 `## [Unreleased]` 小节晋升为 `## [X.Y.Z] - <日期>` 并在其上留一个新的空 `[Unreleased]` 小节，更新 `[Unreleased]` 链接起算点，插入 `[X.Y.Z]: .../compare/v<旧>...v<新>` 链接定义（仓库地址从现有链接解析，不硬编码）。

## 风险

- [bump 脚本正则误伤文件其它内容] → 每个文件用锚定正则（字段名/键名限定），bump 后立即跑 check-versions + git diff 人工可审。
- [macOS 本地无法验证 NSIS 图标] → 配置即官方字段，由 CI/Release 的 Windows 构建验证；在 tasks 中显式声明该验证边界。
- [CHANGELOG 检查误报历史版本] → 只检查当前版本与 [Unreleased] 两条，历史链接不追溯。

## 回滚

还原 `tauri.conf.json` 两个字段与脚本新增即可；无数据与状态迁移。
