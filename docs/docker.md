# Docker 部署

[English](docker.en.md)

Docker 版把 React 网页、FastAPI 后端、Linux CPU ASR 运行库和 Debian ffmpeg 放在同一镜像中。网页与 API 同源，模型权重按需下载，所有可变数据统一写入 `/data`。

## 前置条件

- Docker Engine 24+ 或近期 Docker Desktop。
- Docker Compose v2（使用 `docker compose` 命令）。
- 建议 8 GB 以上内存、15 GB 以上镜像空间，另为模型和媒体预留空间。
- 首次构建需要访问 Docker Hub、PyPI、PyTorch CPU wheel 源和 GitHub。

镜像支持 Linux CPU 推理，不包含 CUDA，也不支持 Apple MLX。Apple Silicon Mac 上的 Docker 仍是 Linux 容器，应选择 Faster Whisper、Transformers Whisper、SenseVoice 或 Qwen3-ASR。

## 启动

```bash
git clone https://github.com/Goldloli/asrbox.git
cd asrbox
cp .env.example .env
docker compose up -d --build
```

打开 <http://127.0.0.1:17494>。检查健康状态：

```bash
docker compose ps
curl http://127.0.0.1:17494/health
docker compose logs -f asrbox
```

Compose 默认值：

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `ASRBOX_IMAGE` | `asrbox:local` | 本地镜像标签 |
| `ASRBOX_BIND_ADDRESS` | `127.0.0.1` | 宿主机监听地址 |
| `ASRBOX_PORT` | `17494` | 宿主机端口 |
| `ASRBOX_DATA_VOLUME` | `asrbox-data` | 持久卷名称 |
| `ASRBOX_API_TOKEN` | 空 | 固定 API 令牌 |

修改 `.env` 后运行 `docker compose up -d` 应用配置。

Compose 会把宿主发布地址传给应用做启动门禁：默认回环地址可保持 token 为空；只要 `ASRBOX_BIND_ADDRESS` 不是回环地址，token 为空就会拒绝启动并在日志中说明原因。直接运行 Dockerfile 镜像默认视为公开绑定，因此必须设置 `ASRBOX_API_TOKEN`，或明确把 `ASRBOX_PUBLIC_BIND_ADDRESS` 设为回环地址。

### MCP 工具面（可选）

镜像内会挂载 `/mcp` 的 MCP 服务（依赖 `fastmcp`），提供 `asrbox.transcribe`、`asrbox.list_tasks`、`asrbox.get_task`、`asrbox.export_subtitle`、`asrbox.list_models`、`asrbox.readiness` 等工具。MCP 与 HTTP API 受同一个 `ASRBOX_API_TOKEN` 保护。

出于安全考虑，`asrbox.transcribe` 只接受位于以下根之内的媒体路径：uploads 目录（`/data/uploads`）、派生音频目录，以及 operator 通过 `ASRBOX_MCP_ALLOWED_ROOTS`（逗号分隔）显式声明的附加根。数据目录根下的其他文件（如数据库）永远不可作为转写输入。

```dotenv
# 允许 MCP 转写读取额外挂载目录中的媒体
ASRBOX_MCP_ALLOWED_ROOTS=/model-storage,/mnt/media
```

### 单独挂载模型存储

默认模型和下载缓存位于 `/data/models` 与 `/data/cache`。如需使用大容量磁盘，先停止正在进行的本地转写和模型下载，然后取消 `compose.yaml` 中可选 bind mount 的注释，并在 `.env` 中设置：

```dotenv
ASRBOX_MODEL_STORAGE_HOST_PATH=/宿主机/大容量磁盘/asrbox-models
ASRBOX_MODEL_STORAGE_ROOTS=/data,/model-storage
```

宿主机目录必须预先存在，并允许容器内 UID/GID `10001:10001` 读写。重新创建容器后，进入“设置 → 存储与诊断”，从允许的挂载点中选择 `/model-storage`，再选择“移动已有模型”或“使用目标文件夹中的已有模型”。Web 页面显示、复制的都是容器路径，浏览器不能选择或打开 Docker 宿主机目录。

统一目录结构为 `<root>/models` 和 `<root>/cache/{huggingface,modelscope,torch,xdg}`。移动会暂时保留两份数据，需要目标磁盘具有足够空间；ASRbox 完成复制和校验、切换配置后才清理旧目录。目标冲突不会被覆盖。全局共享缓存只有在单独确认后才会纳入迁移。

如果 `/model-storage` 未挂载、磁盘断开或权限失效，页面显示“模型存储位置不可用”，本地模型操作会停止，且不会回退 `/data` 或重新下载。恢复同一挂载后会自动重新识别模型。迁移成功但旧目录清理失败时，根据页面列出的旧路径手动核对后再删除；不要同时删除新旧两份。

### 单独挂载上传媒体目录

浏览器上传的媒体始终会复制进容器内的 `/data/uploads`（Web 端无法引用宿主机文件）。如需让媒体文件落到大容量磁盘，取消 `compose.yaml` 中 `/data/uploads` 可选 bind mount 的注释，并在 `.env` 中设置宿主机路径，建议使用外置硬盘（macOS）或 D 盘（Windows）：

```dotenv
# macOS 外置硬盘
ASRBOX_UPLOADS_HOST_PATH=/Volumes/<外置硬盘>/asrbox-uploads
# Windows D 盘
ASRBOX_UPLOADS_HOST_PATH=D:/asrbox-uploads
```

宿主机目录必须预先存在，并允许容器内 UID/GID `10001:10001` 读写。该挂载只影响之后上传的媒体；named volume 中已有的媒体仍从原位置读取和删除，不会被迁移。请在首次上传前配置好，避免媒体先写入 named volume。“设置 → 存储与诊断”中的媒体存储区域在 Docker 下为只读，路径调整只能通过这里的挂载完成。删除任务只会删除容器内的托管副本；即使配置了挂载，ASRbox 也不会触碰宿主机上该目录之外的任何文件。

## 数据、备份与恢复

容器内 `/data` 包含数据库、媒体、音频、字幕版本、导出、模型、下载缓存、设置和 Provider 密钥。默认映射到 `asrbox-data` named volume。

停止但保留数据：

```bash
docker compose down
```

下面的整卷备份必须先执行 `docker compose down`，避免直接复制正在写入的 SQLite 文件：

```bash
docker run --rm \
  -v asrbox-data:/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/asrbox-data-backup.tar.gz -C /data .
```

恢复到空卷：

```bash
docker volume create asrbox-data
docker run --rm \
  -v asrbox-data:/data \
  -v "$PWD":/backup:ro \
  alpine sh -c 'cd /data && tar xzf /backup/asrbox-data-backup.tar.gz'
```

应用内“设置 → 存储与诊断 → 备份”使用 SQLite online backup 生成事务一致的数据库快照，服务运行时也可使用。两种备份都可能包含媒体、字幕和明文 Provider 密钥，应加密保存并限制访问。恢复前先停止 ASRbox。不要向非空卷叠加不匹配版本的备份。

`docker compose down -v`、`docker volume rm asrbox-data` 会永久删除受管数据，只有确认备份后才可执行。

## 手机与局域网访问

默认只允许 Docker 主机本机访问。要让可信局域网内的手机或电脑使用：

```bash
openssl rand -hex 32
```

把结果写入 `.env`：

```dotenv
ASRBOX_BIND_ADDRESS=0.0.0.0
ASRBOX_API_TOKEN=生成的随机值
```

然后：

```bash
docker compose up -d
```

访问 `http://主机局域网IP:17494`，进入“设置 → 通用”，在“API 令牌”输入相同值。令牌只进入当前浏览器 sessionStorage，不会写入持久 localStorage，也不会导出。

ASRbox 不提供 TLS、多用户账号、暴力破解防护或细粒度权限。不要直接做路由器端口映射。跨网络访问优先使用 Tailscale、WireGuard 等可信 VPN；反向代理必须自行配置 HTTPS、认证、上传大小和超时。

## Ollama 与在线 Provider

Ollama 预设不需要接口密钥。Ollama 与 ASRbox 在同一宿主机但不在同一 Compose 项目时，服务地址使用：

```text
http://host.docker.internal:11434/v1
```

容器模式下选择 Ollama 预设会自动填入这个地址。Compose 已把 `host.docker.internal` 映射到宿主机 gateway。确保 Ollama 允许来自 Docker bridge 的连接。若 Ollama 也在 Compose 中，可把它加入同一 network，并使用其 service name。

云端 ASR/LLM Provider 需要容器能够访问相应 HTTPS 地址。代理、防火墙和 CA 配置由部署者管理。

## 更新与回滚

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d
docker image prune
```

更新前备份 volume。回滚时切回之前的 Git commit 或镜像标签，再用同一 volume 启动。数据库迁移一旦发生，旧版本未必能读取新数据库；保留升级前备份。

## 验证与排障

仓库自带完整烟测，会临时构建容器、检查健康和同源网页、创建持久数据、重建容器，并用 Playwright 检查桌面及手机宽度：

```bash
npm run test:docker
```

常用诊断：

```bash
docker compose config
docker compose ps
docker compose logs --tail=200 asrbox
docker inspect --format '{{json .State.Health}}' "$(docker compose ps -q asrbox)"
docker system df
docker volume inspect asrbox-data
```

页面能打开但显示后端离线时，通常是 API 令牌未填写或不一致。模型失败时先查看“设置 → 存储与诊断”的运行时能力；MLX 在 Docker 中始终不可用。更多场景见[故障排查](troubleshooting.md)。

## 卸载

保留数据：

```bash
docker compose down --remove-orphans
docker image rm asrbox:local
```

确认不再需要数据后，再删除 volume：

```bash
docker volume rm asrbox-data
```

## 字幕翻译（0.1.6）

0.1.6 的 Web UI 在“AI → 字幕翻译”使用与校对相同的 LLM 设置。宿主机 Ollama 地址仍为 `http://host.docker.internal:11434/v1`。原文、翻译检查点和全部译文版本随 `/data` 中的 SQLite 持久化；容器重启后活动翻译标记为中断，需手动继续，不会自动向提供商发送请求。导出由浏览器下载，不能让 Web 页面选择宿主机任意路径。完整步骤、取消费用边界和降级说明见 [AI 指南](ai-proofreading.md)。
