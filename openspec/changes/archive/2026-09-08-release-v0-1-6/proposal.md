## 为什么

已合并的字幕翻译和 LLM 平台兼容功能仍显示 0.1.5，无法与上一版区分。用户要求统一升级为 0.1.6，并在 GitHub Releases 发布本版本新增功能说明。

## 变更内容

- 更新全部受维护版本源、Bun/Cargo 工作区锁项、README 和发布指南至 0.1.6。
- 编写 docs/releases/v0.1.6.md 并整理 CHANGELOG，介绍翻译、双语导出、平台兼容、超时修复和依赖安全补丁。
- 按既有发布门禁验证 main 提交，创建 v0.1.6 标签，由 Release workflow 构建和发布带校验值与 FFmpeg 对应源码的 DMG。

## 能力（Capabilities）

无新增或修改的产品规格。遵循已有 release-readiness，不改变发布机制，使用 skip_specs。

## 影响

允许接触版本 manifest/runtime/defaults、About 和 public-beta smoke 的当前版本断言、生成锁文件、README、CHANGELOG、docs/release.md、AI／Docker 使用说明、版本发布说明和本 change 工件。非目标是新产品行为、额外模型设备展示、依赖升级、平台扩展、签名或自动安装。保留字幕与配置数据，禁止将用户数据或构建产物提交入 Git。任何门禁失败时停止发布并诊断；已发布标签不移动，后续修复使用新版本。
