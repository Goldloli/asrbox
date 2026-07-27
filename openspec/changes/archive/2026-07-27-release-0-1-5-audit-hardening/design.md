## 背景

`fix/audit-hardening` 基于 `v0.1.4`，包含两轮审计修复与后续生命周期收口。当前完整门禁已通过，但 `backend/tests/test_audit_lifecycle_followups.py` 只验证 runtime status 的非阻塞等待，没有覆盖 health report 和诊断包；failed-chunk 批量恢复只验证全部成功，没有验证部分失败。发布工具 `scripts/check-versions.mjs` 已覆盖 Dockerfile、Compose 和 `.env.example`，但没有读取 `bun.lock`、`Cargo.lock` 或当前发布文档，导致锁文件可长期保留旧 workspace 版本而门禁仍通过。

发布仍遵守 `docs/release.md`：先让目标提交进入 `main` 并通过 CI，再创建不可移动的 `v0.1.5` tag，由 Release workflow 构建 DMG、冻结后端、FFmpeg 源码包和校验文件。

## 目标 / 非目标

**目标：**

- 为三个已确认缺口添加直接、稳定、用户行为导向的回归测试。
- 让一个版本检查命令同时约束源码版本、锁文件和当前发布文档。
- 把本轮反复验证出的任务并发与 async 路由规则沉淀到开发指南。
- 形成完整、可下载者理解的 `v0.1.5` 发布说明，并以远端工作流成功作为发布完成条件。

**非目标：**

- 不增加 API、数据库 migration、依赖、模型或 UI 功能。
- 不把所有测试改造成覆盖率门禁，也不为无风险代码追求机械测试数量。
- 不改变现有分片恢复、runtime 路由或发布资产 contract。
- 不绕过 CI 直接在未合入 `main` 的 feature commit 上打发布 tag。

## 决策

### 1. 只补规格承诺尚未直接覆盖的测试

新增部分分片恢复测试：两个 failed chunk 中一个成功、一个失败，断言任务保持失败可恢复、成功 chunk 保留、失败 chunk 可再次重试且不创建最终版本。runtime 路由测试参数化覆盖 status、health report 和 diagnostic bundle，断言同步服务等待不阻塞事件循环。

备选方案是引入全仓覆盖率阈值。当前 Python、React、Rust 与 Playwright 混合栈没有统一覆盖率基线，直接设百分比会产生大量与本次发布无关的测试 churn，因此不采用。

### 2. 版本门禁读取派生锁文件和当前发布文档

`check-versions.mjs` 继续以根 `package.json` 为期望版本，并新增：

- 解析 JSONC 风格 `bun.lock` 的 app/web/tauri workspace 版本；
- 从 `Cargo.lock` 的 `asrbox` package 块读取版本；
- 校验中英文 README 的源码版本和 Release 链接；
- 校验 `docs/release.md` 的当前版本；
- 要求 `docs/releases/v<version>.md` 存在并引用匹配的 tag 与 DMG。

测试夹具先证明旧实现会放过锁文件或文档漂移，再扩展实现。相比另写发布 shell 脚本，复用现有跨平台 Node 工具能让本地、CI 和 Release 使用同一规则。

### 3. AGENTS 只沉淀可复用工程约束

新增规则限定在三类反复出现的问题：

- 任务/字幕/派生文件状态转换必须在共享转换边界内重新读取并短暂认领，耗时推理不得持锁；
- `async` 路由不得直接运行同步推理、subprocess、递归文件扫描或重探测；
- 生命周期测试需要在应用 lifespan 恢复完成后建立活动态，新增维护测试必须接入聚合命令。

具体产品行为仍属于 OpenSpec，不把审计报告或临时结论复制到 `AGENTS.md`。

### 4. 远端发布顺序固定为 PR CI → main → tag → Release

当前完整工作树作为一个 `0.1.5` audit-hardening commit 推送到 `fix/audit-hardening`。创建面向 `main` 的 PR 并等待 CI；成功后合并，再在 `main` 对应提交创建 `v0.1.5` annotated tag。Release workflow 成功并且 GitHub Release 资产可见后才宣布发布完成。

## 风险

- [版本工具解析锁文件格式变化] → 对当前 Bun/Cargo 格式使用聚焦解析和失败测试；格式变更会显式让门禁失败，而不是静默跳过。
- [发布文档约束过严导致预发布维护成本] → 只校验当前版本、tag、DMG 和文件存在，不约束文案段落或测试计数。
- [远端 CI/Release 耗时或平台故障] → 本地完整门禁先行；远端失败时保留 PR/tag 证据并修复后重新运行，不移动已发布 tag。
- [大工作树提交难以审阅] → 发布说明和 PR 按安全、可靠性、前端持久化、发布门禁分组，并在提交前检查未跟踪敏感/生成文件。

## 回滚

测试、文档和版本工具可以随提交回退；无 schema 或数据迁移。若 tag 前发现问题，修复并重新走 CI；tag 后发现问题不移动 `v0.1.5`，按发布指南提升到新版本。

## 待确认问题

无阻塞问题。当前用户已明确授权提交、推送并发布 `0.1.5`。
