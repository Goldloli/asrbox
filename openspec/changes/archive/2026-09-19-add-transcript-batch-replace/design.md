# Design: 任务中心一键替换页签

## Context

- 任务中心转写结果由 `app/src/components/TranscriptViewer.tsx` 承担，`detailView` state（`'transcript' | 'edit'`，:37）驱动标题行页签（:205-218）与行渲染分支；编辑字幕的草稿/保存机制（`draftEdits`、`saveDraftEdits`）已走 `apiClient.updateSegments`（PUT `/tasks/{id}/segments`），后端在一次事务内更新全部分段并创建恰好一个不可变 `edit` 版本。
- 已接受 spec `transcript-editing-versioning` 的"任务中心分段编辑模式" requirement 明确禁止查找替换，本 change 以 MODIFIED delta 放开并补充新页签契约（见 specs/）。
- `AGENTS.md` 不变量清单写有"不得恢复…查找替换"，需同步改措辞。

## Goals / Non-Goals

**Goals:**

- 一键替换页签：全文分段列表展示 + 搜索/替换输入 + 实时匹配高亮与计数 + 一次批量保存产生单个 `edit` 版本。
- 双语文案、maintained e2e 覆盖、版本 bump 到 0.3.1。

**Non-Goals:**

- 不新增后端路由或变更响应 contract；不做逐处确认列表、正则搜索、大小写不敏感选项、撤销栈。
- 不改动编辑字幕模式的逐段编辑行为与既有批量保存契约。
- 不重构 TranscriptViewer 的播放联动逻辑。

## Decisions

### D1: 替换面板内嵌于 TranscriptViewer，纯文本全文展示，复用批量更新持久化

在 `TranscriptViewer.tsx` 内扩展 `detailView` 联合类型为 `'transcript' | 'edit' | 'replace'`，页签数组加第三项。替换页签下半部分渲染为纯文本全文（各分段文本按换行拼接的"类 txt"视图，不展示时间轴、播放跳转或说话人标识），搜索词在全文高亮；持久化直接调用既有 `apiClient.updateSegments` 全量提交替换后的 segments。

- 备选：与转写结果共用分段行渲染（初版实现，用户反馈后调整）。拒绝：用户希望该页签聚焦文本本身，时间轴/说话人信息在此为噪音。
- 备选：独立路由/独立组件 + 新后端批量替换路由。拒绝：无后端变更需求，重复实现版本创建逻辑会破坏"恰好一个 edit 版本"的既有 contract。
- 搜索匹配语义：分段文本按 plain string 匹配（区分大小写，同 `String.prototype.replaceAll` 语义），替换词替换全部出现位置。不做大小写不敏感/正则选项（YAGNI，可在后续 change 追加）。

### D2: 替换操作无草稿层，输入即预览，"下一个"顺序定位，"替换"/"全部替换"两个粒度

搜索/替换输入保存在页签本地 state；全文视图渲染"替换后预览"（匹配词位置显示替换结果并高亮），点击"全部替换"一次性提交全部匹配。无匹配、空搜索词、或替换结果与当前文本无差异时禁用两个替换按钮。"下一个"按钮在多处匹配间顺序移动定位游标（滚动到可见并强调当前匹配，末尾循环），游标在搜索词变化时归零，切换任务时全部重置。"替换"按钮仅提交当前游标定位的那一处匹配（一次批量更新同样只产生一个 `edit` 版本），保存成功后由于被替换处消失，游标自然指向其后第一处匹配，可继续逐处替换。

- 备选：复用 `draftEdits` 草稿机制。拒绝：草稿是按段暂存待保存编辑的模型，替换是"预览→一次提交"模型，混用会让状态复杂化。

### D3: 版本 bump 走 bump-version.mjs

实现收尾时运行 `node scripts/bump-version.mjs 0.3.1`，由其统一改写全部版本声明并生成 `docs/releases/v0.3.1.md` 骨架与 CHANGELOG 段落，避免手动漏改 Dockerfile/compose/.env.example 锚点。

## Risks / Trade-offs

- 一键替换无逐处确认，误替换只能靠版本历史恢复 → 已有不可变版本与恢复能力兜底；spec 场景已约束"恰好一个 edit 版本"可回滚。
- 替换面板与编辑字幕共用行渲染，新增分支可能引入回归 → 复用同一 `.map` 渲染与播放联动代码路径，e2e 覆盖转写结果/编辑字幕既有场景。
- AGENTS.md 与 spec 措辞漂移 → 实现任务中包含同步更新 AGENTS.md 不变量条目。
- bump-version 会重生成 lockfile 并触碰发布文档 → 在实现分支上执行后运行 `check-versions.mjs` 自校验。
