# Third-Party Notices

ASRbox depends on open source projects and optional model ecosystems. This file is a maintenance index, not legal advice. Verify upstream licenses before public distribution, especially when bundling binaries or model files.

## Bundled Binaries

### FFmpeg and FFprobe

- Location: `third_party/ffmpeg/darwin-arm64/`
- Purpose: media inspection, audio extraction, and desktop out-of-box MP4 support.
- Source: Martin Riedl's FFmpeg Build Server.
- Current note: see `third_party/ffmpeg/README.md`.
- License risk: FFmpeg license terms depend on build configuration. Confirm redistribution requirements before each public release.

## Runtime and Application Frameworks

| Dependency | Purpose | License check |
| --- | --- | --- |
| Tauri | Desktop shell and native commands | Check upstream crate/package license |
| React | Web UI | Check upstream npm package license |
| Vite | Web build | Check upstream npm package license |
| FastAPI | Backend API | Check upstream Python package license |
| Uvicorn | Backend server | Check upstream Python package license |
| SQLAlchemy | Local database layer | Check upstream Python package license |

## ASR and ML Ecosystem

| Dependency | Purpose | License check |
| --- | --- | --- |
| PyTorch / Torchaudio | Local ML runtime | Check upstream package license |
| Transformers | Model loading and processors | Check upstream package license |
| Accelerate | Model runtime utilities | Check upstream package license |
| Faster Whisper / CTranslate2 | Faster local Whisper inference | Check upstream package license |
| FunASR / ModelScope | Chinese ASR model ecosystem | Check upstream package and model licenses |
| MLX Whisper | Apple Silicon local inference | Check upstream package license |
| Pyannote Audio | Optional diarization path | Check upstream package and model licenses |
| OpenCC | Chinese text conversion | Check upstream package license |

## Models

Model licenses are separate from ASRbox source code. Do not assume a model can be redistributed because ASRbox can download or run it.

Before adding a model to the catalog or bundling a model:

1. Record the model source URL.
2. Record the license and allowed usage.
3. Check commercial use restrictions.
4. Check redistribution restrictions.
5. Document required attribution.
6. Avoid committing model weights to this repository.

## Release Checklist

Before a public release:

- Confirm this file mentions every newly vendored binary or major dependency.
- Confirm `third_party/ffmpeg/README.md` matches the bundled ffmpeg/ffprobe version.
- Confirm model documentation does not imply redistribution rights that ASRbox does not have.
- Confirm release artifacts do not include model weights, test media, caches, `.venv`, or `node_modules`.
