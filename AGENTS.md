# ASRbox Agent 开发指南

本文件是仓库内 coding agent 的开发策略。产品行为应记录在 OpenSpec 和聚焦的项目文档中；本文件应保持简洁、稳定，并专注于说明如何实施变更。

## 权威来源

针对正在修改的领域，应优先采用范围最窄且最具权威性的来源：

1. 用户当前的请求和活动中的 OpenSpec change。
2. `openspec/specs/` 中已经接受的产品行为。
3. FastAPI 生成的 OpenAPI、后端 model、带类型的前端 client，以及用于界定准确受维护 API surface 的 `backend/tests/test_contract.py`。
4. `README.md` 中的受支持平台、架构和开发命令。
5. `CONTRIBUTING.md` 和 `docs/ci.md` 中的贡献与验证规则。
6. `docs/privacy.md`、`docs/release.md`、`THIRD_PARTY_NOTICES.md` 和 `third_party/ffmpeg/` 各自负责维护的隐私、发布与许可事实。

不要把这些文档复制到新的规划文件中。应链接到它们，并且只记录发生变化的行为或决策。

编辑前先检查 `git status` 以及相关代码和文档。应基于用户已有的修改继续工作；除非用户明确要求，否则绝不丢弃或覆盖这些修改。

## 变更分类

采用与风险相匹配的最轻量流程。

当变更范围很小，且不会改变已经接受的行为或受维护的 contract 时，可以直接修改而不创建新的 OpenSpec change。例如：

- 修正拼写、措辞、注释或格式。
- 保持被测试行为不变的测试维护。
- 预期行为已经明确，且不会改变 API、持久化数据、依赖、包或子系统边界的局部 bug 修复。

当实现工作包含以下任意内容时，应先创建或继续一个 OpenSpec change：

- 新增或改变用户可见行为。
- API 路由、响应字段、事件或前后端 contract。
- 持久化数据、字幕版本、存储位置、migration 或恢复。
- 安全、隐私、认证、本地网络暴露或 secret 处理。
- 依赖、内置二进制、模型元数据、许可、打包或发布。
- 架构变更、大范围重构或跨多个子系统的变更。

如果无法确定分类，应说明不确定之处以及最小的合理处理路径。不要在没有说明的情况下，把小任务扩大成大范围重新设计。

## OpenSpec 工作流

对于重大变更：

1. 阅读相关主 spec 和现有项目 contract。
2. 当需求或取舍尚不明确时，使用 `/opsx:explore`。
3. 实现前创建 `/opsx:propose <change>`。
4. 在 proposal 和 design 中记录：
   - 预期可观察行为；
   - 必须保持不变的现有行为；
   - 允许修改的子系统和接触点；
   - 明确的非目标；
   - 失败、恢复和回滚行为；
   - 聚焦验证和合并前验证。
5. 根据活动 artifact 实现。如果实现过程暴露出错误假设，应先更新 artifact，再扩大范围。
6. archive change 前，对齐代码、测试、文档和 spec。

`AGENTS.md` 不是产品规格。已经接受的行为属于 `openspec/specs/`；提议中的行为属于 `openspec/changes/`。

OpenSpec 产出的文档（proposal、design、tasks 等 artifact）应优先使用中文撰写；技术术语、标识符和代码保持原文。

### 工件生成（openspec CLI）

`/opsx:*` 斜杠命令的技能定义在 `.codex/skills/openspec-*/SKILL.md`，底层是 `openspec` CLI。无论由哪个 agent 执行，都遵循同一流程：

1. `openspec new change <kebab-name>` 创建脚手架。
2. 按 `openspec status --change <name> --json` 报告的依赖序（proposal → design + specs → tasks）逐个写工件；写每个工件前用 `openspec instructions <artifact> --change <name> --json` 取模板与规则。
3. `openspec validate --changes <name>` 必须通过后再进入实现。

工件格式约定：

- proposal.md：`## 为什么` / `## 变更内容` / `## 能力（Capabilities）` / `## 影响`。Capabilities 中列出的每个能力都对应一个 `specs/<capability>/spec.md` delta 文件。
- spec delta：用 `## ADDED Requirements` / `## MODIFIED Requirements` 分节；MODIFIED 必须整段重写该 requirement（含全部 scenario），不能只写差异。每个 requirement 至少一个 scenario，scenario 标题用四个 `#`（`#### Scenario:`），步骤用 `- **WHEN**` / `- **THEN**`。
- design.md：`## 背景`（引用具体代码位置）/ `## 目标 / 非目标` / `## 决策`（含备选方案与理由）/ `## 风险` / `## 回滚`。
- tasks.md：编号分组，任务必须是 `- [ ] X.Y` 复选框格式，apply 阶段据此跟踪进度；实现过程中即时勾选。

### 归档与沉淀

1. 实现与验证完成后，先把 tasks.md 全部勾选，再 `openspec archive <name> --yes`：delta 会合并进 `openspec/specs/` 主 spec，change 移入 `openspec/changes/archive/<date>-<name>/`。
2. 实现完成后应及时归档，不要长期挂起。挂起期间若有后续 change 改动了同一 requirement，归档会因 delta 过期被拒（`current spec contains scenario(s) not present in the modified block`）。此时先把 delta 的 MODIFIED 块刷新为并集——保留主 spec 现有全部 scenario、合入本 change 的新增 scenario、合并 requirement 正文——再重新归档；不得以丢弃 scenario 的方式强行归档。
3. 归档后检查主 spec 的 `## Purpose`；如果仍是 `TBD`，补写一句话职责说明。
4. 归档的同时更新受影响的面向用户文档（README、docs/、CHANGELOG），保持 spec、代码、文档三者一致。
5. 归档完成后再次运行 `openspec list --json` 和 `openspec validate --specs`，确认活动 change 已消失、主 spec 已同步且全部规格通过校验。

## ASRbox 边界

尊重现有的职责边界：

- `app/`：共享 React 路由、组件、状态和带类型的 API 使用。
- `web/`：仅包含 Vite Web 入口；它连接到已经存在的后端。
- `backend/`：FastAPI 路由、任务生命周期、ASR 提供商、存储、版本、诊断和导出。
- `tauri/`：桌面 shell、sidecar 生命周期、应用数据路径和操作系统集成。
- `scripts/`：构建、审计、版本、第三方和发布门禁。
- `third_party/ffmpeg/`：经过验证的二进制，以及必需的许可和来源记录。

除非已经批准的 change 明确替换，否则必须保持以下不变量：

- 桌面后端绑定到 `127.0.0.1:17494`，并使用内存中的 API token。
- Web UI 不会静默启动或暴露后端。
- 字幕版本是不可变快照；恢复操作会创建可审计的新版本，而不是重写历史。
- 前端代码使用带类型的响应，不得依赖内部 `options_json` key。
- 受维护的路由、字段和事件只有在同步更新 OpenSpec、producer、typed consumer、contract test 和项目负责维护的文档后才能变更。
- 新增响应字段必须同时声明到 FastAPI 的 `response_model`（pydantic 模型）：service 层产出但模型未声明的字段会被静默丢弃，且必须在 API 测试中断言该字段存在（binary smoke 等发布门禁不覆盖全部字段）。
- 新增 Tauri 网络或文件系统能力时，不得让 WebView 向特权 command 传入并决定任意 URL、仓库或目标路径；应由 Rust 侧解析并校验可信来源、资源名称和文件目标，同时覆盖允许与拒绝路径测试，并保持 Web runtime 显式降级。
- 除非使用经过批准且许可合规的 fixture，否则用户媒体、字幕、模型、数据库、备份和诊断不得进入仓库或发布包。

对于可选或容易失败的功能，应优先采用增量、隔离的行为。除非已经批准的 spec 明确修改了相关 contract，否则新的后处理能力不得让成功转写依赖外部服务。

任务并发与异步路由遵守以下实现约束：

- 修改任务生命周期、字幕状态、媒体关联或任务自有派生文件时，必须在共享任务转换边界内重新读取状态并完成短认领；耗时推理、网络调用和 subprocess 等待不得持有该锁，最终落库前必须再次尊重取消状态。
- FastAPI `async` 路由不得直接运行同步推理、subprocess、递归文件扫描、重型数据库组合或 runtime 探测；在不改变响应 contract 时使用线程池，并用事件循环响应测试证明等待期间其他 coroutine 仍可运行。
- 测试活动任务冲突时，若应用 lifespan 会把持久化活动行恢复为 `interrupted`，应在 lifespan 启动后建立活动态或显式控制恢复，避免测试命中错误状态而产生假阳性。

## 范围纪律

- 每一处改动都必须服务于当前请求或其验证。
- 不要仅仅因为方便，就进行相邻重构、全局格式化、依赖升级或清理。
- 不要通过修改其他子系统来掩盖局部故障。应保留明确的错误状态，并在负责该问题的边界内诊断。
- 引入抽象前，优先复用既有的 service、route、versioning、error 和 UI pattern。
- 当稳定 contract 必须变更时，应在同一个 change 中更新所有受影响的 producer、consumer、测试和项目负责维护的文档。
- 单独记录无关发现，不要把它们混入当前 diff。

依赖与生成文件规则：

- Python 依赖变更从适当的 `requirements-*.in` 文件开始，并包含重新生成的 lock file；不要只手动编辑 `requirements.txt`。
- 前端依赖变更应更新 `bun.lock` 并运行依赖审计。
- vendored binary 变更应更新 checksum、来源记录、license 和 notice。
- 绝不提交 `.venv/`、`node_modules/`、cache、model weight、用户数据、构建产物、Tauri `target/`、PyInstaller 产物、DMG、凭据或签名数据。
- 绝不提交 agent 交互与对话记录（如 `.beads/interactions.jsonl`）；任务跟踪数据本身通过 bd 的 Dolt remote 同步，不依赖工作树提交。

## 验证

迭代时使用聚焦检查。根据受影响的风险扩大验证范围，而不是根据修改行数决定。

- 后端逻辑：运行相关 `pytest` 文件或测试选择；变更准备完成后再运行 `npm run test:backend`。
- 稳定 API 行为：还要运行 `npm run test:backend:contract`。
- React/Web 变更：运行 `npm run typecheck`、`npm run build:web`，以及覆盖用户可见行为的相关 Playwright 场景。
- 新增受维护的前端单元或 Playwright 场景时，必须接入 `test:frontend:unit` 或 `test:e2e:maintained` 聚合命令；CI、Release 和本地开源就绪门禁复用聚合命令，不在工作流中复制不完整的文件清单。
- Tauri 或 sidecar 变更：运行 Cargo 检查/测试和桌面启动验证。
- 依赖或内置代码变更：运行依赖或第三方审计。
- 模型执行、长音频、冻结二进制或发布资源：只有在涉及相应风险时才运行专用的高成本测试套件。

合并代码变更前，应运行 `npm run check:open-source`，除非该变更仅涉及文档，或当前环境无法支持该门禁。合并前 CI 必须通过。手动验证应覆盖发生变化的工作流和相邻风险；完整的手动产品回归属于 beta 或 release 验证，不是每个小变更都必须执行。

绝不能仅为了让变更通过，而削弱、跳过、删除或重写现有测试。如果某项检查无法运行，应准确说明哪些内容未验证以及原因。

## 完成标准

宣布完成前：

- 根据已经声明的接触点和非目标审阅最终 diff。
- 确认受保护行为没有被有意改变。
- 更新受影响的 spec、contract 和面向用户的文档。
- 报告行为变化、关键文件、已运行命令和任何剩余风险。
- 除非用户明确要求，否则不要 commit、tag、publish 或 release。

<!-- BEGIN BEADS CODEX SETUP: generated by bd setup codex -->
## Beads 任务跟踪

在包含 Beads 的仓库中，使用 Beads（`bd`）进行持久化任务跟踪。工作流指南位于项目安装的 `.agents/skills/beads/SKILL.md` 或全局安装的 `~/.agents/skills/beads/SKILL.md`；任务操作使用 `bd` CLI。

### 快速参考

```bash
bd ready                # 查找可以开始的工作
bd show <id>            # 查看任务详情
bd update <id> --claim  # 认领任务
bd close <id>           # 完成任务
bd prime                # 刷新 Beads 上下文
```

### 规则

- 所有任务跟踪都使用 `bd`；不要创建 Markdown TODO 列表。
- 当 Beads 上下文缺失或过期时运行 `bd prime`。Codex 0.129.0 及以上版本可以通过原生 hook 自动加载 Beads 上下文；使用 `/hooks` 查看或切换这些 hook。
- 通过 `bd remember` 把持久化项目记忆保存在 Beads 中；不要创建临时 memory 文件。

**一句话架构说明：** issue 存储在本地 Dolt DB 中；同步使用 Git remote 上的 `refs/dolt/data`；`.beads/issues.jsonl` 是被动导出。具体说明和反模式参见 https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md。
<!-- END BEADS CODEX SETUP -->
