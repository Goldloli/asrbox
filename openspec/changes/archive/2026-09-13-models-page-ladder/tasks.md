# Tasks: models-page-ladder

## 1. 数据与组件

- [x] 1.1 `app/src/lib/modelCatalog.ts`：新增 `Tier`、`ModelLadderEntry`、`MODEL_LADDER`（按 design.md 实测表分档，注释写明分档规则）与 `modelLadder(model)`（查表 + 引擎/体量回退估算，`mlx-whisper-turbo` 参考 faster-whisper-large-v3-turbo 并标估算）。
- [x] 1.2 `app/src/components/models/ModelLadder.tsx`：等级表组件（行=模型，列=速度/准确率/语言/GPU/CPU/时间轴/说话人分离 + 下载状态点，S/A/B/C 着色 Badge，是/否 check/横线，行排序按 design.md 决策 2，表尾图例 + 口径脚注）。

## 2. 页面与文案

- [x] 2.1 `app/src/routes/ModelsPage.tsx`：天梯 Panel 置顶全宽；移除 benchmark 面板；`ModelManagement.tsx` 中 `BenchmarkCard`/`BenchmarkBar`/`modelBenchmarkScores` 确认无引用后删除；清理孤儿 import。
- [x] 2.2 `app/src/lib/i18n.ts`：新增 `models.ladder*` 中英文案（标题/说明/列名/图例/口径脚注/估算标注）。

## 3. 测试与归档

- [x] 3.1 `app/e2e/models-download-controls.spec.ts`：天梯渲染全部 mock 模型行与档位、脚注可见、估算跑分面板不存在；必要时补 mock 的 `supported_devices` 等字段；确认该 spec 已在 `test:e2e:maintained` 聚合中。
- [x] 3.2 `npm run typecheck && npm run build:web` 通过；`./node_modules/.bin/playwright test app/e2e/models-download-controls.spec.ts` 全绿。
- [x] 3.3 `CHANGELOG.md` Unreleased 增加条目；`openspec validate --changes models-page-ladder` 通过；实现完成后 `openspec archive models-page-ladder --yes` 并复核 `openspec validate --specs`。
