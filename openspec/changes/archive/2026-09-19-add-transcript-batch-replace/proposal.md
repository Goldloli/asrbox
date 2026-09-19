# Proposal: 任务中心一键替换页签（v0.3.1）

## 为什么

转写结果中常见的系统性识别错误（例如人名、术语被统一误识别）目前只能逐段在"编辑字幕"模式中手动修改，效率低；用户需要一个基于全文搜索、一次操作作用于全部匹配分段的一键替换入口。

## 变更内容

- 在任务中心转写结果标题行新增与"转写结果""编辑字幕"并列的"一键替换"页签：
  - 页签内展示当前字幕全文（分段列表形式，保留时间范围与说话人信息）；
  - 提供搜索输入框与替换输入框，输入搜索词后实时高亮匹配分段并统计匹配数量；
  - 点击替换操作将全部匹配分段中的搜索词替换为替换词，通过既有 `PUT /tasks/{id}/segments` 批量提交并创建恰好一个不可变 `edit` 版本；时间与说话人保持原值；
  - 搜索词为空、无匹配分段、或替换结果与当前文本无变化时替换操作不可用；
  - 不做逐处确认列表，一次替换作用于全部匹配。
- 版本号从 0.3.0 bump 到 0.3.1（使用 `scripts/bump-version.mjs`）。

## Capabilities

### New Capabilities

- `transcript-batch-replace`: 任务中心转写结果区的一键替换页签——全文展示、搜索/替换输入、批量替换保存为一个 `edit` 版本的行为约束。

### Modified Capabilities

- `transcript-editing-versioning`: 修改"任务中心分段编辑模式" requirement，移除"不提供查找替换或全文工具"的限制，并补充"一键替换"页签的并列入口与保存契约（仍复用单次批量更新 + 恰好一个 `edit` 版本）。

## 影响

- 前端：`app/src/components/TranscriptViewer.tsx`（新增页签与替换面板）、`app/src/lib/i18n.ts`（双语文案）。
- 测试：新增一键替换 Playwright 场景（mock 批量更新路由）并接入 `test:e2e:maintained`；既有转写结果/编辑字幕 e2e 场景需保持绿色。
- Spec / 文档：上述两个 spec delta；`AGENTS.md` 中"不得恢复…查找替换"的不变量措辞需同步更新。
- 版本：`scripts/bump-version.mjs 0.3.1` 统一改写 package.json / Cargo.toml / `backend/__init__.py` / Dockerfile / compose / `.env.example` / README / CHANGELOG 并生成 `docs/releases/v0.3.1.md`。
- 无后端 API 变更（复用既有批量更新路由，响应 contract 不变）。
