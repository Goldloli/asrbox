## Context

ASRbox currently has a React Web entrypoint and a FastAPI backend, but its maintained packaged runtime is a macOS Apple Silicon Tauri application. The Web entrypoint defaults to the desktop loopback backend, the backend root route returns API metadata, and Python runtime locks include Apple-only MLX packages. Those assumptions prevent a Linux container from serving a usable browser application without manual source setup.

The container must support home-server and NAS-style use without weakening desktop behavior. It must also make storage, network exposure, credentials, model compatibility, image size, and third-party processing visible to operators. The implementation spans backend routing, frontend connection state, Linux dependencies, container packaging, tests, release checks, and user documentation.

## Goals / Non-Goals

**Goals:**

- Build one reproducible Linux image that serves the Web UI and API from one origin.
- Persist the database, imported media, transcripts, exports, caches, settings, and downloaded models under `/data`.
- Provide a loopback-only Compose default with explicit controls for port, bind address, and API token.
- Preserve existing desktop and Vite development connection behavior.
- Support Linux CPU inference for compatible local engines and clearly exclude Apple MLX execution.
- Verify image construction, health, same-origin UI delivery, persistence, and browser startup automatically.
- Keep README, privacy, security, model, troubleshooting, contribution, and release guidance aligned with the shipped behavior.

**Non-Goals:**

- Providing TLS termination, multi-user accounts, authorization roles, or an Internet-facing security gateway.
- Bundling model weights into the image or guaranteeing every upstream model on every CPU architecture.
- Replacing the Tauri desktop package or changing its sidecar binding and token lifecycle.
- Publishing a container image to a registry in this change.
- Supporting Apple MLX inside Linux containers.

## Decisions

### One image serves UI and API

The image will use a multi-stage build: Bun compiles `web/`, and a Python slim runtime installs Linux CPU dependencies, ffmpeg, backend source, and the compiled frontend. Uvicorn serves FastAPI on `0.0.0.0:17494`; FastAPI serves static assets and the SPA. This avoids a second reverse-proxy container and avoids cross-origin configuration for the normal deployment.

Alternative considered: separate frontend and backend containers. That provides independent scaling but adds proxy, CORS, origin, and version-coordination complexity without benefit for the intended single-user deployment.

### Packaged frontend owns `/`

When a compiled frontend exists, `/` will return the SPA and API metadata will move to a dedicated public route. When no frontend bundle exists, source/backend development will retain the current JSON root response. This preserves existing developer diagnostics while making the container URL immediately usable.

Alternative considered: keep API metadata at `/` and host the UI under `/app`. It produces a surprising user entry URL and complicates SPA navigation.

### Build-time same-origin frontend default

The Docker Web build will set an explicit build-time connection mode that resolves the backend to `window.location.origin`. Tauri and ordinary Vite builds retain `http://127.0.0.1:17494`. A manually configured server URL remains available for development and advanced use.

An operator-provided API token can be entered in the Web settings. It remains session-scoped and is not written to persistent browser storage. Desktop-generated tokens continue to use the existing in-memory connection mechanism.

Alternative considered: inject a fixed URL during image build. That fails when the host port, hostname, HTTPS proxy, or mobile client changes.

### Persistent `/data` contract

`ASRBOX_DATA_DIR=/data` is the container contract. Compose mounts a named volume there and directs model-provider caches under the same tree. Removing or recreating a container preserves data; explicitly deleting the volume is destructive. Backup guidance treats the volume as sensitive because it can contain media, transcripts, provider credentials, and model caches.

Alternative considered: multiple volumes per artifact type. It makes backup and migration harder and does not match the backend's existing application-data boundary.

### Conservative network default

Compose publishes the service to `127.0.0.1` by default. Operators may set the bind address to `0.0.0.0` for LAN access, but documentation requires an API token and a trusted LAN, VPN, or authenticated TLS reverse proxy. ASRbox itself does not claim to be a public Internet gateway.

Alternative considered: LAN binding by default. That would expose imported media, subtitles, provider credentials, and administrative APIs too easily on shared networks.

### Linux CPU dependency lock

A dedicated `requirements-docker.in` and compiled lock will describe the Linux runtime and omit `mlx-whisper`. PyTorch CPU wheels are installed from the official CPU index to avoid CUDA payloads. Model weights stay outside the image and download into persistent storage on demand.

Alternative considered: reuse the desktop runtime lock. It contains macOS ARM and MLX packages and is therefore not a valid Linux build contract.

### Packaging and evidence

The change will produce a locally tagged Docker image and refresh the existing desktop package without creating a release tag or publishing registry artifacts. Docker validation will include Compose parsing, health, SPA delivery, persisted state across container recreation, and Playwright browser smoke coverage. CI will exercise the reproducible container path on Linux.

## Risks / Trade-offs

- **Large image and slow initial build** -> use multi-stage builds, CPU-only PyTorch wheels, `.dockerignore`, and documented layer caching; keep model weights out of the image.
- **CPU inference can be slow or memory intensive** -> publish a model support matrix and troubleshooting guidance; do not promise hardware-independent timings.
- **LAN exposure can reveal sensitive data** -> bind to loopback by default, support an API token, display/document exposure warnings, and recommend a VPN or TLS reverse proxy.
- **A browser token could leak through persistence** -> keep it in memory/session storage only and exclude it from exported settings and logs.
- **Upstream model libraries can vary by architecture** -> validate the maintained Linux build in CI and describe architecture/model caveats rather than claiming universal compatibility.
- **Docker ffmpeg licensing differs from the desktop bundle** -> install the distribution package with its license metadata and document redistribution obligations for anyone publishing derived images.

## Migration Plan

1. Add the Linux dependency input and generated lock, Dockerfile, `.dockerignore`, Compose file, and example environment file.
2. Add same-origin connection selection and conditional backend root behavior with focused tests.
3. Add Docker smoke scripts and CI validation, then build and run the image locally.
4. Refresh maintained documentation and package evidence.
5. Update GitHub About metadata after local verification.

Rollback consists of stopping the Compose service and returning to the desktop package or source development commands. The named volume remains intact unless the operator explicitly removes it, so a failed image update can be rolled back to a prior local tag using the same `/data` volume.

## Open Questions

None. Publishing a prebuilt image to GHCR and supporting an Internet-facing authentication layer are intentionally deferred to separate changes.
