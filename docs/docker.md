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

## 数据、备份与恢复

容器内 `/data` 包含数据库、媒体、音频、字幕版本、导出、模型、下载缓存、设置和 Provider 密钥。默认映射到 `asrbox-data` named volume。

停止但保留数据：

```bash
docker compose down
```

备份：

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

备份可能包含媒体、字幕和明文 Provider 密钥，应加密保存并限制访问。恢复前先停止 ASRbox。不要向非空卷叠加不匹配版本的备份。

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
