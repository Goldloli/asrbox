# Docker Deployment

[中文](docker.md)

The Docker build puts the React UI, FastAPI backend, Linux CPU ASR runtime, and Debian ffmpeg in one image. UI and API share an origin, model weights download on demand, and all mutable state lives under `/data`.

## Requirements

- Docker Engine 24+ or a recent Docker Desktop.
- Docker Compose v2 (`docker compose`).
- At least 8 GB RAM and 15 GB image space, plus room for models and media.
- Network access to Docker Hub, PyPI, the PyTorch CPU wheel index, and GitHub during the first build.

The image supports Linux CPU inference. It has no CUDA runtime and cannot run Apple MLX, even on Docker Desktop for Apple Silicon.

## Start

```bash
git clone https://github.com/Goldloli/asrbox.git
cd asrbox
cp .env.example .env
docker compose up -d --build
```

Open <http://127.0.0.1:17494> and inspect the service with:

```bash
docker compose ps
curl http://127.0.0.1:17494/health
docker compose logs -f asrbox
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `ASRBOX_IMAGE` | `asrbox:local` | Local image tag |
| `ASRBOX_BIND_ADDRESS` | `127.0.0.1` | Host bind address |
| `ASRBOX_PORT` | `17494` | Published host port |
| `ASRBOX_DATA_VOLUME` | `asrbox-data` | Persistent volume name |
| `ASRBOX_API_TOKEN` | empty | Fixed API token |

Run `docker compose up -d` after changing `.env`.

## Data, backup, and restore

`/data` contains the database, media, extracted audio, transcript versions, exports, models, caches, settings, and provider credentials. Compose stores it in the `asrbox-data` named volume.

`docker compose down` preserves data. Back up with:

```bash
docker run --rm \
  -v asrbox-data:/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/asrbox-data-backup.tar.gz -C /data .
```

Restore into an empty volume while ASRbox is stopped:

```bash
docker volume create asrbox-data
docker run --rm \
  -v asrbox-data:/data \
  -v "$PWD":/backup:ro \
  alpine sh -c 'cd /data && tar xzf /backup/asrbox-data-backup.tar.gz'
```

Backups can contain media, transcripts, and plaintext provider credentials. Encrypt and restrict them. `docker compose down -v` and `docker volume rm asrbox-data` permanently delete managed data.

## Phone and LAN access

The default is host-only. For a trusted LAN, generate a token with `openssl rand -hex 32`, then set:

```dotenv
ASRBOX_BIND_ADDRESS=0.0.0.0
ASRBOX_API_TOKEN=the-generated-random-value
```

Restart, open `http://HOST_LAN_IP:17494`, and enter the token under Settings → General → API token. The token is stored only in sessionStorage for that browser session and is not exported.

ASRbox does not provide TLS, multi-user accounts, brute-force protection, or role authorization. Do not forward the port directly from a router. Use a trusted VPN, or configure an authenticated HTTPS reverse proxy with suitable upload limits and timeouts.

## Ollama and providers

The Ollama preset needs no API key. When Ollama runs on the Docker host, use:

```text
http://host.docker.internal:11434/v1
```

Container mode fills this address automatically when the Ollama preset is selected. Compose maps the name to the host gateway. If Ollama is another service on the same Compose network, use its service name instead. Cloud providers require normal outbound HTTPS connectivity.

## Update and rollback

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d
```

Back up first. To roll back, check out the previous source revision or image tag and start it with the same volume. Keep a pre-upgrade backup because an older application may not understand a migrated database.

## Verification and removal

`npm run test:docker` builds the image, checks health and same-origin routing, recreates the container to prove persistence, and runs desktop/mobile Playwright smoke coverage.

Useful diagnostics:

```bash
docker compose config
docker compose ps
docker compose logs --tail=200 asrbox
docker inspect --format '{{json .State.Health}}' "$(docker compose ps -q asrbox)"
docker volume inspect asrbox-data
```

If the UI loads but reports the backend offline, check the session API token. MLX is always unavailable in Docker. See [Troubleshooting](troubleshooting.md) for more.

Remove the service and image while keeping data:

```bash
docker compose down --remove-orphans
docker image rm asrbox:local
```

Only after confirming a backup, permanently remove data with `docker volume rm asrbox-data`.
