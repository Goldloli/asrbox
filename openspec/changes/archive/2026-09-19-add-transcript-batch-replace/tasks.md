# Tasks: 任务中心一键替换页签

## 1. 一键替换页签

- [x] 1.1 在 `app/src/components/TranscriptViewer.tsx` 将 `detailView` 联合类型扩展为 `'transcript' | 'edit' | 'replace'`，页签数组加入"一键替换"（i18n key），并复用分段行渲染实现替换面板：搜索框、替换框、匹配计数与高亮、禁用规则（空搜索词/无匹配/无变化）；验证：`npm run typecheck` 通过，任务中心出现三个页签。
- [x] 1.2 实现替换保存：构造替换后全量 segments 调用既有 `apiClient.updateSegments`，成功后 invalidate 任务相关 queryKey 并 toast，切换任务时重置替换输入；验证：新增 Playwright 场景（mock `PUT /tasks/:id/segments`）断言一次请求提交全部分段、匹配词全部替换、单个保存动作完成。
- [x] 1.3 在 `app/src/lib/i18n.ts` 补充"一键替换"及相关文案的中英文 key；验证：双语界面下页签与面板文案齐全。
- [x] 1.4 将一键替换 Playwright 场景接入 `test:e2e:maintained` 聚合；验证：`npm run test:e2e:maintained` 通过，且既有 `transcript-editing` 场景保持绿色。
- [x] 1.5 按手动测试反馈调整一键替换页签：列表区改为纯文本全文展示（无时间轴/播放跳转/说话人标识，匹配词全文高亮），新增"下一个"按钮顺序定位匹配（滚动到可见并强调，末尾循环），并提供"替换"（仅当前定位处）与"全部替换"两个按钮；同步更新 i18n 与 e2e 断言；验证：`npm run typecheck` 与 transcript-editing e2e 通过。

## 2. 版本与文档同步

- [x] 2.1 更新 `AGENTS.md` 不变量清单中"不得恢复…查找替换"措辞，与 transcript-batch-replace 能力一致；验证：grep 确认旧措辞不再出现。
- [x] 2.2 运行 `node scripts/bump-version.mjs 0.3.1` 并补全 `docs/releases/v0.3.1.md` 与 CHANGELOG 中本变更的用户可见描述；验证：`node scripts/check-versions.mjs` 通过。

## 3. 合并前验证

- [x] 3.1 运行 `npm run test:backend:contract` 确认无 API contract 回归；验证：全部通过。
- [x] 3.2 全量验证：`npm run test:backend`、`npm run typecheck`、`npm run build:web`、`npm run test:e2e:maintained`；验证：全部绿色。
