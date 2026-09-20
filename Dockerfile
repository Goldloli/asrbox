FROM oven/bun:1.4.2 AS web-builder

WORKDIR /src
COPY package.json bun.lock ./
COPY app/package.json app/package.json
COPY web/package.json web/package.json
COPY tauri/package.json tauri/package.json
RUN bun install --frozen-lockfile

COPY app app
COPY web web
ENV VITE_ASRBOX_SERVER_URL=same-origin
RUN bun run build:web

FROM python:3.14-slim-bookworm AS runtime

ARG APP_VERSION=0.3.2
LABEL org.opencontainers.image.title="ASRbox" \
      org.opencontainers.image.description="Local-first transcription and LLM subtitle proofreading workspace" \
      org.opencontainers.image.source="https://github.com/Goldloli/asrbox" \
      org.opencontainers.image.version="${APP_VERSION}"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    ASRBOX_DATA_DIR=/data \
    ASRBOX_CONTAINER=1 \
    ASRBOX_PUBLIC_BIND_ADDRESS=0.0.0.0 \
    ASRBOX_FRONTEND_DIR=/opt/asrbox/frontend \
    HF_HOME=/data/cache/huggingface \
    HUGGINGFACE_HUB_CACHE=/data/cache/huggingface/hub \
    MODELSCOPE_CACHE=/data/cache/modelscope \
    TORCH_HOME=/data/cache/torch \
    XDG_CACHE_HOME=/data/cache \
    ASRBOX_MODEL_STORAGE_ROOTS=/data \
    HOME=/data/home

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg git libgomp1 libsndfile1 tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/asrbox
COPY requirements-docker.lock ./
RUN python -m pip install --no-cache-dir \
      --extra-index-url https://download.pytorch.org/whl/cpu \
      -r requirements-docker.lock

COPY backend backend
COPY --from=web-builder /src/web/dist frontend

RUN groupadd --gid 10001 asrbox \
    && useradd --uid 10001 --gid asrbox --home-dir /data/home --no-create-home --shell /usr/sbin/nologin asrbox \
    && mkdir -p /data/home /data/cache \
    && chown -R asrbox:asrbox /data /opt/asrbox

USER asrbox
EXPOSE 17494
VOLUME ["/data"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD curl --fail --silent http://127.0.0.1:17494/health >/dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "17494", "--proxy-headers", "--forwarded-allow-ips", "127.0.0.1"]
