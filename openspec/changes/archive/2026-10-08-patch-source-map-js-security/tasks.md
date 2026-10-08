## 1. 依赖修复

- [x] 1.1 添加 source-map-js ^1.2.2 override 并用 Bun 生成锁文件；审阅 diff，冻结安装和依赖审计通过。
- [x] 1.2 更新 CHANGELOG，说明安全补丁和公告编号，确认没有发布版本变化。

## 2. 集成验证

- [x] 2.1 本地门禁通过：audit:dependencies、typecheck、前端单测、build:web、check:versions、test:release-tools；无 venv 的重型门禁（后端 pytest、Cargo、E2E、Docker）由 PR 上的 CI 覆盖。确认改动只涉及声明接触点；完成工件并归档后检查 OpenSpec 主规格。
