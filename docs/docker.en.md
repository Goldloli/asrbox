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

### Separate model-storage mount

Models and download caches default to `/data/models` and `/data/cache`. To use a larger disk, stop active local transcription and model downloads, uncomment the optional bind mount in `compose.yaml`, and set:

```dotenv
ASRBOX_MODEL_STORAGE_HOST_PATH=/host/large-disk/asrbox-models
ASRBOX_MODEL_STORAGE_ROOTS=/data,/model-storage
```

Create the host directory first and make it writable by container UID/GID `10001:10001`. Recreate the container, open Settings > Storage and diagnostics, select the allowed `/model-storage` mount, and choose either moving current models or adopting models already in the target. The Web UI displays and copies container paths; a browser cannot select or open directories on the Docker host.

The unified layout is `<root>/models` and `<root>/cache/{huggingface,modelscope,torch,xdg}`. A move temporarily keeps two copies and therefore needs enough destination space. ASRbox copies and verifies before switching and only then cleans the old location. Target conflicts are never overwritten. Detected global shared caches require a separate confirmation.

If `/model-storage` is not mounted, disconnected, or loses permissions, the UI reports the model storage location unavailable. Local-model operations stop without falling back to `/data` or redownloading. Restoring the same mount makes models discoverable again. If cleanup of the old location fails after a successful switch, verify the paths reported by the UI before manually deleting the duplicate; never delete both copies.

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
