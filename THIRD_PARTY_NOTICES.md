# Third-Party Notices

ASRbox depends on open source projects and optional model ecosystems. This file is a maintenance index, not legal advice. Verify upstream licenses before public distribution, especially when bundling binaries or model files.

## Bundled Binaries

### FFmpeg and FFprobe

- Location: `third_party/ffmpeg/darwin-arm64/`
- Purpose: media inspection, audio extraction, and desktop out-of-box MP4 support.
- Source: Martin Riedl's FFmpeg Build Server.
- Version/build: `8.1.2`, with `--enable-gpl` and `--enable-version3`.
- License: GPLv3; full text at `third_party/ffmpeg/LICENSE.GPLv3`.
- Binary checksums: `third_party/ffmpeg/checksums.sha256`.
- Corresponding source/build record: `third_party/ffmpeg/SOURCE.md`.

## Runtime and Application Frameworks

The source-built Docker image installs ffmpeg/ffprobe from Debian packages rather than copying the macOS binaries above. Debian package license files remain in the image. Anyone redistributing a derived container image must review the exact package versions and satisfy their source, notice, and license obligations; the repository does not currently publish a prebuilt container image.

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
| MOSS-Transcribe-Diarize | End-to-end transcription + diarization inference helpers | Apache 2.0 (package and model) |
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
- Run `npm run verify:third-party` and attach the generated FFmpeg source archive to every binary release.
- Confirm model documentation does not imply redistribution rights that ASRbox does not have.
- Confirm release artifacts do not include model weights, test media, caches, `.venv`, or `node_modules`.
- For any future published container image, inventory Debian ffmpeg and Python/runtime package licenses and provide required source or notices before publication.
