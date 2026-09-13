# Proposal: models-page-ladder

## 为什么

模型页现有「估算跑分」卡片（`BenchmarkCard`，`modelBenchmarkScores` 按体积启发式估算速度/准确率/体积三条 bar）只覆盖当前筛选的前 4 个模型，且数值是估算、没有横向对比，用户选模型时无法直观回答"哪个快、哪个准、哪个支持 GPU/CPU/说话人分离"。v0.2.0 期间我们在 Windows + RTX 5080 上对全部 14 个本地模型做了真实测量（90 秒中文片段：`data/tmp/bench-results-cuda.json` 速度、`data/tmp/model_accuracy_cer.json` 与 large-v3 的字符一致度），足以支撑一份有依据的静态天梯数据。

## 变更内容

- 模型页顶部新增全宽「模型天梯」板块：目录内每个本地模型一行，按维度给出等级——速度（S/A/B/C）、准确率（S/A/B/C）、语言覆盖（S/A/B/C）、GPU 支持、CPU 支持、精确时间轴、说话人分离（后四项为 是/否）。速度与准确率等级来自上述实测分档；GPU/CPU/时间轴/分离来自既有 `ModelStatus` 字段；未实测模型按引擎/体积回退估算并同样标注为参考值。板块注明数据为参考值及测量口径。
- 模型页布局重构：天梯板块置顶全宽；移除右侧估算跑分卡片面板（被天梯取代）；推荐引导、下载进度、存储面板保留；模型列表的分类、分组、置顶、下载操作行为不变。
- 既有行为保持不变（非目标）：模型目录注册、下载生命周期、兼容性判定、分类选项顺序（全部第一、推荐第二）、本地化状态文案、后端 API 字段全部不变；不做实时测速，不引入后端改动。

## 能力（Capabilities）

### New Capabilities

（无）

### Modified Capabilities

- `model-management`: 新增「模型天梯对比视图」要求——模型页提供覆盖全目录的多维度等级对比，数据标注为参考口径；估算跑分面板被该视图取代。

## 影响

- `app/src/lib/modelCatalog.ts`：新增 `MODEL_LADDER` 静态等级数据与 `modelLadder()`（含未知模型回退估算）。
- `app/src/components/models/ModelLadder.tsx`：新组件（等级表 + 图例 + 口径脚注）。
- `app/src/routes/ModelsPage.tsx`：布局重构（天梯置顶、移除 benchmark 面板）；`app/src/components/models/ModelManagement.tsx` 的 `BenchmarkCard`/`BenchmarkBar` 移除。
- `app/src/lib/i18n.ts`：新增 `models.ladder*` 中英文案。
- `app/e2e/models-download-controls.spec.ts`：覆盖天梯板块渲染与估算面板移除。
- `CHANGELOG.md`：Unreleased 条目。
