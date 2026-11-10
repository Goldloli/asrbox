# Granite Speech 5.0 2B 真实模型验证记录

- 日期：2026-11-09（Asia/Shanghai）
- 变更：`prepare-v0-4-1`（tasks 4.1 / 4.2）
- 环境：macOS Apple Silicon（arm64）、16 核 CPU、128 GB 内存、无 NVIDIA GPU（`torch.cuda.is_available() == False`）
- 运行时：仓库 `.venv`（Python 3.13.17、`transformers 5.17.0`、`torch 2.11.0`）；模型经 ASRbox 托管下载（`modelscope` 主源）
- 上游 revision：HF `ec49ca6b1a5e7e9176127e09cb303ab78cbacdf7`（ModelScope 主源默认分支 `master`，逐文件提交见来源核验记录）
- 验证路径：真实 backend HTTP 接口 `POST /transcriptions` → 任务生命周期 → 本地 worker 子进程 → `transformers_speech_lm` 引擎 → `GraniteSpeech5Adapter` / 4.1 adapters；未直接调用 adapter 或引擎内部方法
- 音频：本地合成的英文清晰、英文加噪、日语与 152 秒英文长音频（`say` + `ffmpeg` 生成，未入仓）；参考文本为合成脚本原文。**限制：合成语音不是真人录音，结论只用于本机本场景的回归与对比，不代表公开基准。**

结构化结果：`backend/real_tests/results/asrbox-granite-speech-5.0-verification-20261109-233121.json`
冻结包验收：`backend/real_tests/results/asrbox-granite-speech-5.0-frozen-macos.md`

## 结果总表

| 模型 | 音频 | 时长 | 输出字符 | 句段 | 耗时 | 峰值进程树内存 | 六种导出 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | :---: |
| granite-speech-5.0-2b | 英文清晰 | 11.6 s | 200 | 3 | 39.6 s | 5,451 MB | ✓ |
| granite-speech-5.0-2b | 英文加噪 | 11.6 s | 198 | 3 | 30.1 s | 5,330 MB | ✓ |
| granite-speech-5.0-2b | 日语清晰 | 12.2 s | 61 | 1 | 33.2 s | 5,325 MB | ✓ |
| granite-speech-5.0-2b | 英文长音频 | 152.4 s | 2,730 | 34 | 478.1 s | 5,708 MB | ✓ |
| granite-speech-4.1-2b | 英文清晰 | 11.6 s | 200 | 3 | 32.1 s | 4,921 MB | ✓ |
| granite-speech-4.1-2b | 日语清晰 | 12.2 s | 61 | 1 | 32.1 s | 4,934 MB | ✓ |
| granite-speech-4.1-2b | 英文长音频 | 152.4 s | 1,873 | 24 | 434.9 s | 5,321 MB | ✓ |
| granite-speech-4.1-2b-plus | 英文清晰（默认说话人模式） | 11.6 s | 197 | 3 | 37.0 s | 4,986 MB | ✓ |
| granite-speech-4.1-2b-plus | 英文清晰（词级时间戳模式） | 11.6 s | 197 | 4 | 57.5 s | 5,007 MB | ✓ |

每次推理均完成 TXT / SRT / VTT / ASS / JSON / Markdown 六种导出，且导出内容非空。

## 质量观察（与 4.1 普通版对比）

- **英文清晰**：5.0 与 4.1 输出完全相同（参考脚本 WER 均为 3.12%，唯一差异是 "the sentence"→"this sentence" 的冠词错误）。**在本样本上没有可复现的质量提升。**
- **英文加噪**：5.0 输出 198 字符，参考脚本 WER 12.5%（"quick brown fox"→"quick round box" 等），文本仍然可读；4.1 未在同一加噪样本上复测，不能据此声称相对优劣。
- **日语清晰**：5.0 字符错误率约 6.2%，4.1 约 7.7%，两者都正确转写且不带标点；差异来自 "いい天気" vs "良い天気" 等表记选择，**不构成可复现的显著优势**。
- **152 秒长音频**：两者都把末尾句完整转出，最后一个句段结束于 `152.412 s`（等于音频总时长），没有静默截断；5.0 输出 2,730 字符 / 34 段，4.1 输出 1,873 字符 / 24 段。5.0 更接近三段重复的完整内容，但这也意味着本次长音频样本下 5.0 的合并/分段策略与 4.1 不同，需按模型卡"约两分钟分段"的人工调参经验看待。
- **结论**：本次小样本未复现出 5.0 相对 4.1 的稳定质量优势（清晰英文完全一致、日语差异在表记层面）。是否符合"接入价值"需以更大规模、真人录音、人工核对参考文本的评测为准；在此之前发布说明只能写"新增模型、六语种、近似时间轴"，不得写"更快/更准"。这一点与 design 决策 5 的"没有可复现的新增价值时先修订接入决策"存在张力，需在发布前由维护者确认。

## 4.1 / Plus 回归（task 4.2）

- `granite-speech-4.1-2b`：标点与大小写输出正常（英文清晰样本 200 字符、3 段），与 5.0 逐字一致；日语输出正常。
- `granite-speech-4.1-2b-plus`：
  - 默认说话人模式：完成转写（197 字符、3 段），输出无标点/大小写，符合既有声明；
  - 词级时间戳模式（`word_timestamps=true`）：完成转写（197 字符、4 段），时间轴模式可用。
- 旧权重与目录未变：两个 4.1 条目的安装来源仍为 `modelscope`、repo ID 与大小不变（4,645.42 MB / 4,035.15 MB），未触发重新下载或迁移。
- 默认设置与历史数据未变：`/settings/asr` 的 `default_model_name` 仍为 `whisper-base`；既有历史任务（含 2026-10-10 的 `firered-asr2-aed` 任务）和字幕版本仍可读（版本记录 200，时间戳保留）。
- 注意：`0.4.0 → 0.4.1` 的**就地升级**保留验证属于 Windows 安装路径（task 4.4，未执行）；本节只覆盖源码/本机数据目录层面的保留。

## 性能说明

- 5.0 在 CPU 上单次推理约 30–40 秒（11.6 秒音频，含每次任务冷加载约 20 秒），与 4.1 同量级；峰值内存约 +0.5 GB。
- 152 秒长音频按 VAD 切块后需约 8 分钟（4.1 约 7 分钟），这是本机 CPU bf16 的现实表现，不是模型卡承诺的时延；发布文档不得据此写性能结论。
- CUDA 已在 Windows + RTX 2060 SUPER 真机验证，见 `granite-speech-5.0-cuda-verification-20261110.md`；Windows x64 冻结候选与就地升级见 `asrbox-granite-speech-5.0-windows-verification-20261110.md`。

## 结论

- 5.0 的接入路径（注册表 → 引擎 → adapter → 120 秒分块 → 六种导出）在真实权重与完整 backend 路径上可用；旧 4.1 / Plus 行为与数据未被破坏。
- 5.0 相对 4.1 的质量优势在本样本上**未复现**；发布前需要维护者对"是否保留该模型进入发布候选"做决定（design 决策 5）。
- 本记录不替代 Windows / CUDA / 冻结安装器的平台门禁。

## 本轮验证执行记录（2026-11-09）

| 命令 | 结果 |
| --- | --- |
| `pytest backend/tests/test_model_registry.py backend/tests/test_speech_lm_engine.py backend/tests/test_api.py -q` | 123 passed |
| `npm run test:backend` | 621 passed |
| `npm run test:backend:contract` | 12 passed |
| `bun test app/src`（`npm run test:frontend:unit`） | 51 passed |
| `npm run typecheck` | 通过 |
| `npm run build:web` | 通过 |
| `npx playwright test <maintained 13 specs>` | 86 passed（本地用系统 Chrome channel 运行；默认 Chromium 未能下载，CI 仍用自带 Chromium） |
| `bash scripts/build-server.sh` | 成功，冻结 sidecar 探针与真实转写见冻结验收记录 |
| `cargo check --manifest-path tauri/src-tauri/Cargo.toml --locked` | 通过 |
| `cargo test --manifest-path tauri/src-tauri/Cargo.toml --locked` | 20 passed |
| `npm run check:versions` | 通过（0.4.0） |
| `python -m pip check` / `python -m compileall -q backend` | 通过 |
| `npm run verify:third-party` | 通过（FFmpeg 8.1.2） |
| `npm run test:release-tools` | 22 passed |
| `npm run audit:dependencies` | 通过（无漏洞输出） |
| `bun install --frozen-lockfile` | 通过，lock 无改写 |
| `npm run test:docker` | **未通过（环境阻塞）**：docker.io 元数据拉取 `DeadlineExceeded`，无法构建镜像；镜像级门禁留待可访问 Docker Hub 的环境 |

其他未执行项：Windows x64 冻结候选与 `0.4.0 → 0.4.1` 就地升级（task 4.4）、CUDA 真机（task 4.5 已交 pending 记录）、版本 bump 相关门禁（task 5.2/5.3，按计划在模型验收进入版本候选后才执行）。

## 版本准备与提交门禁（2026-11-09）

- `npm run version:bump -- 0.4.1`：成功，更新应用/Web/Tauri manifests、`tauri.conf.json`、`Cargo.toml`/`Cargo.lock`、`backend/__init__.py`、Dockerfile/compose/.env 默认版本、README 源码版本、`docs/release.md`、CHANGELOG 与 `docs/releases/v0.4.1.md`（已人工补齐发布说明，移除 TODO）。
- `npm run check:versions`：通过（0.4.1）。
- `npm run test:release-tools`：22 passed。
- `bun install --frozen-lockfile`：通过，lock 无改写。
- bump 后复跑：`npm run test:backend` 621 passed、`npm run test:backend:contract` 12 passed、`bun test app/src` 51 passed、`npm run typecheck` / `npm run build:web` 通过。
- 后续门禁（2026-11-10）：Windows x64 冻结候选与就地升级（task 4.4）、CUDA 真机（task 4.5）已完成，见 `asrbox-granite-speech-5.0-windows-verification-20261110.md` 与 `granite-speech-5.0-cuda-verification-20261110.md`；仍未完成的是 Docker 镜像 smoke（本次网络阻塞）与 task 6.2 的双平台 CI / 冻结 smoke / 候选产物校验，因此 change 尚未 archive。
