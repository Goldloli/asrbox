![ASRbox 演示](assets/asrbox-demo.gif)

# ASRbox

中文 | [English](README.en.md)

ASRbox 是一个本地优先的音视频转写工作台。它把音频或视频转换为可编辑文本与字幕，支持 14 个本地 ASR 模型、在线 ASR Provider、任务恢复、版本记录和多格式导出。

## 公开 Beta 状态

当前源码版本为 `0.1.0-beta.1`，适合试用、测试和反馈，还不是稳定版。

| 项目 | 当前状态 |
| --- | --- |
| 桌面发布目标 | macOS Apple Silicon |
| 桌面技术 | Tauri 2 + 内置 FastAPI sidecar |
| 本地模型 | 14 个，按需下载，不包含在 DMG 中 |
| 媒体工具 | 桌面包内置 ffmpeg / ffprobe |
| 代码签名 / 公证 | 尚未提供 |
| Windows / Linux 安装包 | 尚未提供 |
| 自动更新 | 尚未提供 |

重要素材请保留原始副本。升级前建议在设置中创建备份。Provider 密钥目前保存在本机 SQLite 数据库中，尚未接入 macOS Keychain。

## 可以做什么

- 选择、批量选择或拖入音频和视频，预检格式、音频流、时长与分段策略。
- 使用 Whisper、Faster Whisper、MLX Whisper、SenseVoice 和 Qwen3-ASR 本地转写。
- 管理模型下载进度，支持暂停、继续、停止和失败重试。
- 配置在线 ASR Provider；使用在线模式时，媒体或音频会发送给对应第三方。
- 查看、搜索、替换、编辑、复制和播放转写结果。
- 保留转写、重新转写、编辑、恢复和后处理版本。
- 导出 TXT、SRT、VTT、ASS、JSON 和 Markdown。
- 查看任务日志、诊断、质量信息、模型兼容性和存储占用。

## 下载与首次启动

GitHub 当前已发布的安装包请查看 [Releases](https://github.com/Goldloli/asrbox/releases)。仓库源码版本可能领先于最新 Release；`0.1.0-beta.1` 的 DMG 未发布时，可按“构建与发布”从源码构建。

当前 DMG 未签名且未公证。首次打开时：

1. 将 `ASRbox.app` 拖入“应用程序”。
2. 右键应用并选择“打开”；或在“系统设置 → 隐私与安全性”中允许打开。
3. 等待桌面端启动本地后端。主界面显示后端在线后再创建任务。
4. 进入“模型”页面，先下载一个本地模型。

只从本项目 Releases 获取安装包，并核对 Release 中的 `SHA256SUMS.txt`。校验和不一致时不要运行。

## 第一次转写

1. 在“模型”页下载模型。Apple Silicon 上可先尝试 `mlx-whisper-turbo`；更小的快速验证可选择 `faster-whisper-base`。
2. 在“新建任务”中选择音频或视频。
3. 选择“本地模型”和已下载模型，按需设置语言、时间戳和分段选项。
4. 提交后在任务页查看进度、日志和结果。
5. 校对文本后导出 SRT、VTT、ASS、TXT、JSON 或 Markdown。

模型越大，通常需要更多下载空间、内存和首次加载时间。14 个模型已在维护者的 Apple Silicon 环境中使用真实视频片段完成转写验证，但这不保证所有机器、素材和上游模型版本都得到相同结果。

## 本地模型

ASRbox 当前注册 14 个本地模型：

- Transformers Whisper：`whisper-base`、`whisper-small`、`whisper-medium`、`whisper-large-v3`、`whisper-large-v3-turbo`
- Faster Whisper：`faster-whisper-base`、`faster-whisper-small`、`faster-whisper-medium`、`faster-whisper-large-v3`、`faster-whisper-large-v3-turbo`
- Apple MLX：`mlx-whisper-turbo`
- FunASR：`sensevoice-small`
- Qwen3-ASR：`qwen3-asr-0.6b`、`qwen3-asr-1.7b`

模型按需从 Hugging Face 或 ModelScope 下载到 ASRbox 数据目录。暂停只暂停当前应用进程中的任务；停止会结束任务但保留可复用的已下载文件；重试会继续使用现有目录；删除模型会删除对应的 ASRbox 模型目录。

模型选择、估算体积、下载来源和许可注意事项见[模型指南](docs/models.md)。

## 数据存放位置

macOS 桌面端默认数据根目录：

```text
~/Library/Application Support/com.goldloli.asrbox/
```

主要内容：

```text
asrbox.db                 任务、设置、版本和 Provider 配置
models/<model-name>/      最终模型文件与模型下载缓存
uploads/                  ASRbox 管理的导入媒体
audio/                    提取或规范化后的音频
cache/                    任务缓存
exports/                  后端生成的导出与诊断文件
backups/                  应用内创建的备份
```

用户从桌面端保存的导出默认进入 `~/Downloads/ASRbox Exports/`，可在“设置 → 通用 → 下载位置”修改。模型不存放在项目目录、`.app` 或 DMG 中；删除应用也不会自动删除数据目录和模型。

开发后端默认使用仓库下的 `data/`，可通过 `ASRBOX_DATA_DIR` 修改。完整的数据边界和卸载步骤见[隐私与本地数据](docs/privacy.md)。

## 架构

```text
app/                 React 组件、路由、状态与共享 UI
web/                 Vite Web 入口
backend/             FastAPI API、任务调度、ASR 后端、存储与导出
tauri/               Tauri 桌面壳、sidecar 生命周期和系统集成
scripts/             构建、版本、审计和发布门禁
third_party/ffmpeg/  内置 ffmpeg / ffprobe 及合规材料
```

桌面端在 `127.0.0.1:17494` 启动内置 `asrbox-server`，每次启动生成内存 API token，并把 Tauri app data 目录传给后端。Web UI 连接已有后端，不会自动启动本地服务。将开发后端暴露到局域网或公网不属于支持范围。

## 本地开发

环境要求：macOS Apple Silicon、Bun `1.3.8`、Python `3.13`、Rust stable。当前 Python 锁文件面向 macOS Apple Silicon / Python 3.13。

```bash
bun install
python -m venv .venv
.venv/bin/python -m pip install pip==25.3
.venv/bin/pip install -r requirements-dev.lock
```

分别启动后端和 Web UI：

```bash
npm run dev:server
npm run dev:web
```

启动桌面开发模式：

```bash
npm run dev:desktop
```

开发环境需要 ffmpeg / ffprobe；可以安装系统版本，也可以使用 `third_party/ffmpeg/darwin-arm64/` 中的内置二进制。

## 构建与发布

安装冻结后端所需依赖并构建 `.app` 和 DMG：

```bash
.venv/bin/pip install -r requirements-build.lock
npm run build:desktop
```

Apple Silicon DMG 输出位置：

```text
tauri/src-tauri/target/release/bundle/dmg/ASRbox_0.1.0-beta.1_aarch64.dmg
```

Release workflow 需要与应用版本一致的 `v*` tag，并生成 DMG、FFmpeg 源码归档和 `SHA256SUMS.txt`。详细步骤见[发布流程](docs/release.md)。合并代码不会自动创建 tag 或 GitHub Release。

## 验证

提交前统一门禁：

```bash
npm run check:open-source
```

该命令检查锁定依赖、Python 包、版本一致性、发布工具、第三方合规、TypeScript、Web 构建、后端测试、Cargo 和浏览器烟雾测试。联网依赖漏洞审计由 CI/Release 强制运行，也可单独执行：

```bash
npm run audit:dependencies
```

真实模型测试需要预先下载模型和自备合法测试素材，不属于默认 CI：

```bash
ASRBOX_REAL_MEDIA_DIR="/path/to/media" npm run test:backend:real-models:full
```

## 文档

- [模型指南](docs/models.md)
- [故障排查](docs/troubleshooting.md)
- [隐私与本地数据](docs/privacy.md)
- [贡献指南](CONTRIBUTING.md)
- [安全政策](SECURITY.md)
- [持续集成](docs/ci.md)
- [发布流程](docs/release.md)
- [后端 API 稳定边界](backend/API_FREEZE.md)
- [后端成熟度报告](backend/MATURITY_REPORT.md)
- [第三方依赖与许可](THIRD_PARTY_NOTICES.md)
- [更新记录](CHANGELOG.md)

## 安全与隐私

本地模型模式在本机处理媒体；在线 Provider 模式会把媒体、提取音频、文本或元数据发送给配置的第三方。Provider API 密钥当前以明文保存在本地 `asrbox.db`，并会进入应用备份。

桌面后端只监听 loopback，并使用每次启动生成的 token；这不能防止同一 macOS 账户下的恶意软件，也不等同于磁盘加密。敏感漏洞请按[安全政策](SECURITY.md)私下报告。

## 贡献

欢迎提交可复现问题和小而可验证的改动。涉及后端行为、模型下载、桌面打包、存储或导出的修改应附相关自动化测试和人工验证记录。开始前请阅读[贡献指南](CONTRIBUTING.md)。

## 许可证

ASRbox 源代码使用 [MIT License](LICENSE)。内置 FFmpeg 及模型、运行时和其他第三方组件分别受其自身许可证约束，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。模型权重不会随 ASRbox 仓库或 DMG 再分发。
