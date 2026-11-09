# Granite Speech 5.0 2B 来源核验记录

- 核验日期：2026-11-09（Asia/Shanghai）
- 目标模型：`granite-speech-5.0-2b`（变更 `prepare-v0-4-1`，task 1.1）
- 核验环境：macOS Apple Silicon、仓库 `.venv`（Python 3.13、`modelscope 1.38.0`、`transformers 5.17.0`）
- 仓库内不含任何模型权重、样本音频或缓存；本记录只保存可复核的公开事实与脱敏结果。

## 结论

| 事实 | 结果 |
| --- | --- |
| 官方 Hugging Face 仓库 | `ibm-granite/granite-speech-5.0-2b`，Apache-2.0，revision `ec49ca6b1a5e7e9176127e09cb303ab78cbacdf7` |
| ModelScope 镜像 | `ibm-granite/granite-speech-5.0-2b`（与 HF 同名同内容），默认分支 `master`；API 与文件下载均可用 |
| 托管下载文件集 | 24 个文件（5,050,574,635 字节，约 4,817 MiB）；`snapshot_download` 走同一托管目录，标记 `source=modelscope` |
| HF `allow_patterns` 子集 | 14 个文件（5,047,680,317 字节，约 4,814 MiB） |
| 运行必需权重 | `model.safetensors`（4,626,528,224 字节）+ `out_llm.safetensors`（411,447,460 字节，lm_head 单独分片） |
| 架构 | `GraniteSpeechForConditionalGeneration` / `model_type=granite_speech`，文本骨干为 `granite-4.0-1b-base`；与本仓库已有 4.1 adapter 的加载类和 prompt 路径一致 |
| 上游依赖声明 | 模型卡注明 `transformers>=4.52.1` 原生支持；本仓库运行时为 5.17.0 |
| 许可 | Apache 2.0（模型卡 front-matter 与仓库 LICENSE 均为 Apache-2.0） |
| 语言 | ASR：en/fr/de/es/pt/ja；语音翻译：与英语互译（fr/de/es/pt/ja）、英→意、英→普通话。中文只出现在翻译方向，不构成中文 ASR 支持 |
| 时间戳 / 说话人 / 流式 | 模型卡未声明原生时间戳、说话人分离或流式输入；ASRbox 按近似时间轴处理 |
| 分段建议 | 模型卡明确建议每段约 2 分钟以内，长音频先切分；应用策略取 120 秒 |
| 性能声明 | 英语自报 WER 5.06%（公开短句集，2026-10-15，非本机实测），不作为 ASRbox 实测结论 |
| 发布时间 | 模型卡日期 2026-10-20 |

## 核验方法

1. ModelScope API 读取文件清单与逐文件大小/提交哈希：`GET https://modelscope.cn/api/v1/models/ibm-granite/granite-speech-5.0-2b/repo/files?Revision=master&Recursive=true`。
2. 通过 ASRbox 托管下载路径（`backend.services.models.download_model`，与 `POST /models/download` 同一实现）真实下载全部文件，记录最终文件集大小与安装来源。
3. 逐文件下载小文件（`config.json`、`generation_config.json`、`tokenizer_config.json`、`chat_template.jinja`、`processor_config.json`、`preprocessor_config.json`、`special_tokens_map.json`、`added_tokens.json`、`configuration.json`）核对内容。
4. Hugging Face 侧通过 Hub API 的镜像端点 `https://hf-mirror.com` 读取仓库元数据（revision、tags、文件清单），并下载 `config.json` 与 ModelScope 同名文件比对 SHA-256，结果一致（`14e35a6d…76d62a3`）。
5. 用仓库 `.venv` 确认 `granite_speech_available` 运行时探针为真（`granite_speech_import_error()` 返回 `None`）。

## 文件清单（ModelScope 默认分支）

| 文件 | 字节 |
| --- | ---: |
| `model.safetensors` | 4,626,528,224 |
| `out_llm.safetensors` | 411,447,460 |
| `tokenizer.json` | 7,153,607 |
| `vocab.json` | 1,612,704 |
| `multilingual_sample.wav`（模型卡示例音频，非推理必需） | 1,596,240 |
| `merges.txt` | 916,646 |
| `README.md` | 27,627 |
| `tokenizer_config.json` | 17,948 |
| `model.sig` | 10,397 |
| `config.json` | 2,281 |
| `.gitattributes` | 2,242 |
| `special_tokens_map.json` | 579 |
| `preprocessor_config.json` | 336 |
| `chat_template.jinja` | 193 |
| `generation_config.json` | 147 |
| `configuration.json` | 86 |
| `processor_config.json` | 80 |
| `added_tokens.json` | 26 |
| `assets/` 下 6 个基准图 PNG | 约 1.26 MB |

推理必需文件为两个 safetensors 分片、`config.json`、`generation_config.json`、tokenizer/processor 配置与 `chat_template.jinja`；`README.md`、`assets/`、`multilingual_sample.wav`、`model.sig`、`.gitattributes` 不参与推理但会被 ModelScope 快照一并下载，因此 `size_mb` 以整仓托管文件集计。

## 验证限制（不得当作已验证的部分）

- 本机网络无法直连 `huggingface.co`，因此 HF 官方端点的真实下载未在本环境执行；HF 候选的仓库身份、revision、文件清单与内容一致性经 `hf-mirror.com` 核实，代码路径与已有 speech-LM 模型共用，未新增 HF 专属逻辑。发布前若条件允许，应在可直连 HF 的网络复跑一次 HF 回退下载。
- `size_mb=4817` 取 ModelScope 整仓 24 文件实测值（5,050,574,635 / 1,048,576 ≈ 4,816.6 MiB，向上取整）；HF 回退的 `allow_patterns` 子集略小。
- 本记录不包含真实转写质量结论；模型验收见同目录 `asrbox-granite-speech-5.0-verification-*.md`（若尚未生成，则该项仍未完成）。
