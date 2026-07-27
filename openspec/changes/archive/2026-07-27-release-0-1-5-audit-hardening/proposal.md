## 为什么

审计加固代码已经完成并通过现有门禁，但发布前复核发现三个已接受行为仍缺少直接回归：分片恢复的部分失败、全部 runtime 同步路由的事件循环响应，以及锁文件与当前发布文档的版本一致性。现在需要把这些缺口和可复用开发规则一并收口，形成可验证的 `0.1.5` 发布。

## 变更内容

- 为批量 failed-chunk 恢复的部分失败状态和全部 runtime 阻塞路由补直接回归测试。
- 扩展版本工具测试与实现，使应用包、后端、Tauri、Docker、Bun/Cargo 锁文件、README、发布指南和版本化 release notes 保持一致。
- 在 `AGENTS.md` 沉淀任务状态转换、async 路由阻塞工作、活动态测试夹具和维护测试聚合器的开发约束。
- 更新中英文 README、CI/Release 指南、Changelog 与 `v0.1.5` Release 说明。
- 统一项目版本为 `0.1.5`，运行完整本地门禁，并在远端 CI 通过后发布 `v0.1.5`。
- 不改变受维护 API、数据库 schema、正常转写/编辑/导出行为或运行时依赖。

## 能力（Capabilities）

### 新增能力

无。

### 修改能力

- `release-readiness`：版本一致性门禁扩展到锁文件与当前发布文档，发布必须使用与版本匹配的 release notes。
- `agent-development-governance`：开发指导增加跨任务状态转换、async 阻塞工作和维护测试入口的具体约束。

## 影响

- 测试与工具：`backend/tests/test_audit_lifecycle_followups.py`、`scripts/check-versions.mjs`、`scripts/check-versions.test.mjs`。
- 开发规范与文档：`AGENTS.md`、`docs/ci.md`、`docs/release.md`、中英文 README、`CHANGELOG.md`、`docs/releases/v0.1.5.md`。
- 版本面：应用 package、后端、Tauri、Docker/Compose、示例环境和锁文件。
- 发布系统：GitHub CI、Release workflow、`v0.1.5` tag 与 GitHub Release。
