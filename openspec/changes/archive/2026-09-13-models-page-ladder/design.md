# Design: models-page-ladder

## 背景

`app/src/routes/ModelsPage.tsx` 现为左列表 + 右栏（引导/估算跑分/下载/存储）两列。估算跑分卡片 `BenchmarkCard`（`app/src/components/models/ModelManagement.tsx:294`）用 `modelBenchmarkScores()` 按模型体积启发式估算，只显示当前筛选前 4 个模型，无横向对比。

实测数据（本机 Windows + RTX 5080 + CUDA 套件，90 秒中文片段，2026-09-10 跑分轮）：

| 模型 | 耗时 | CER(vs large-v3) |
| --- | --- | --- |
| sensevoice-small | 15.3s | 8.4% |
| faster-whisper-base | 15.3s | 38.7% |
| whisper-base | 18.4s | 40.2% |
| whisper-large-v3-turbo | 18.4s | 7.4% |
| faster-whisper-small | 18.4s | 24.8% |
| faster-whisper-large-v3-turbo | 18.4s | 6.7% |
| qwen3-asr-0.6b | 21.4s | 8.8% |
| whisper-small | 21.5s | 28.4% |
| faster-whisper-medium | 21.5s | 25.3% |
| qwen3-asr-1.7b | 24.5s | 8.2% |
| whisper-medium | 27.6s | 11.4% |
| faster-whisper-large-v3 | 27.6s | 0%（基准） |
| moss-transcribe-diarize | 27.6s | 8.4% |
| whisper-large-v3 | 30.7s | 2.1% |

原始文件：`data/tmp/bench-results-cuda.json`、`data/tmp/model_accuracy_cer.json`。

## 目标 / 非目标

目标：

- 全目录、多维度（速度/准确率/语言/GPU/CPU/时间轴/说话人分离）的一眼可比视图，置顶模型页。
- 数据诚实：等级来自实测分档并标注参考口径；未实测模型回退估算且同样标注。
- 页面更直观：天梯取代估算跑分面板，其余面板信息架构不变。

非目标：

- 不做实时/用户本机测速；不改后端 API 或模型注册表；不改分类选项顺序、分组、下载操作等行为。
- 不为在线提供商（必剪等）做天梯（无本地可测口径）。

## 决策

### 1. 数据形态：静态分档 + 回退估算

`modelCatalog.ts` 新增 `MODEL_LADDER: Record<string, ModelLadderEntry>`，`ModelLadderEntry = { speed: Tier; accuracy: Tier; languages: Tier }`，`Tier = 'S'|'A'|'B'|'C'`。分档规则（写入代码注释）：

- 速度：S ≤16s，A ≤20s，B ≤26s，C >26s（上表实测值）。
- 准确率：S ≤5%，A ≤10%，B ≤20%，C >20%（CER 一致度）。
- 语言覆盖：whisper 全系与 moss（50+ 种）S；qwen3-asr（13 种含粤语）A；sensevoice（5 种）B。

`modelLadder(model)`：查表命中用实测档；未命中（未来新增模型、`mlx-whisper-turbo` 等本机不可测）按引擎/体积回退估算（沿用 `modelBenchmarkScores` 的体量思路映射到档），返回 `estimated: true`。`mlx-whisper-turbo` 参考同架构 faster-whisper-large-v3-turbo 给档并标估算。

GPU/CPU/时间轴/说话人分离不做静态表，直接读 `ModelStatus.supported_devices`、`supports_timestamps`、`supports_diarization`——这些字段已由后端按运行时如实给出。

### 2. 视图形态：等级表（而非纯 S  tier 天梯墙）

一个 `ModelLadder` 组件：表头为维度列，每行一个模型（display_name + 已下载/未下载状态点），单元格为着色 Badge（S=accent、A=success、B=warning、C=muted；是/否=check/横线）。行排序：综合档（速度+准确率档序和）升序、再按速度档，已下载优先同级靠前。表尾图例 + 口径脚注（"速度与准确率为 Windows + RTX 5080 实测参考值，仅供相对比较；标 * 为估算"）。备选方案：

- S/A/B/C 四列"天梯墙"（模型卡片拖入档位列）：视觉更炫但丢失逐维度信息，且 15 个模型挤 4 列在窄屏不可用，否决。
- 可排序表格：交互复杂、收益低（档序已固化），否决。

### 3. 页面重构最小化

`ModelsPage` 顶层改为：天梯 Panel（全宽）→ 既有两列区。删除右侧 benchmark Panel 与 `BenchmarkCard`/`BenchmarkBar`/`modelBenchmarkScores`（确认无其他引用后删）；`BarChart3` 图标若仅该处使用一并清理 import。列表、引导、下载、存储面板不动。

### 4. i18n 与测试

新增 `models.ladderTitle/ladderBody/ladderSpeed/ladderAccuracy/ladderLanguages/ladderGpu/ladderCpu/ladderTimeline/ladderDiarization/ladderDownloaded/ladderNotDownloaded/ladderLegend/ladderNote`（中英）。e2e 在 `app/e2e/models-download-controls.spec.ts` 增加：天梯表渲染全部 mock 模型行与档位 Badge、脚注可见、估算跑分面板不存在。mock 的 `/models/status` 需含 ladder 所需字段（既有 mock 已有 supported_devices 等，缺则补）。

## 风险

- 实测口径单一（中文片段、单台机器）：以"参考值"措辞 + 图例明确，不称绝对性能； whisper 系中文 CER 高与口径（中文片段）相关，脚注说明。
- 未来新增模型忘填表：回退估算保证视图不破；`modelLadder` 单测覆盖查表与回退。

## 回滚

删除 `ModelLadder` 组件与 `ModelsPage` 中的挂载、恢复 benchmark 面板即可；纯前端展示层，无数据/API 迁移。
