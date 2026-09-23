# Third-Party Notices

ASRbox depends on open source projects and optional model ecosystems. This file is a maintenance index, not legal advice. Verify upstream licenses before public distribution, especially when bundling binaries or model files.

## Bundled Binaries

### FFmpeg and FFprobe

- Location: `third_party/ffmpeg/darwin-arm64/` (macOS Apple Silicon), `third_party/ffmpeg/win32-x64/` (Windows x64)
- Purpose: media inspection, audio extraction, and desktop out-of-box MP4 support.
- Source: Martin Riedl's FFmpeg Build Server (macOS); gyan.dev FFmpeg builds (Windows).
- Version/build: `8.1.2`, with `--enable-gpl` and `--enable-version3`.
- License: GPLv3; full text at `third_party/ffmpeg/LICENSE.GPLv3`.
- Binary checksums: `third_party/ffmpeg/checksums.sha256`.
- Corresponding source/build record: `third_party/ffmpeg/SOURCE.md`.

## Runtime and Application Frameworks

The source-built Docker image installs ffmpeg/ffprobe from Debian packages rather than copying the desktop binaries above. Debian package license files remain in the image. Anyone redistributing a derived container image must review the exact package versions and satisfy their source, notice, and license obligations; the repository does not currently publish a prebuilt container image.

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

### Catalog model license record

| Model | Source | License | Notes |
| --- | --- | --- | --- |
| Paraformer-large zh (`paraformer-zh`) | ModelScope `iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch`; HF mirror `funasr/paraformer-zh` | FunASR code MIT; model under the ModelScope Model License Agreement (verify before redistribution) | Commercial use permitted under the model agreement; ASRbox downloads on demand and never bundles the weights |
| Fun-ASR-Nano (`fun-asr-nano`) | ModelScope `FunAudioLLM/Fun-ASR-Nano-2512` | Apache 2.0 (package and model) | No attribution obligation beyond notice retention |
| Distil-Whisper large-v3 (`faster-whisper-distil-large-v3`) | HF `Systran/faster-distil-whisper-large-v3` (CTranslate2 conversion of `distil-whisper/distil-large-v3`) | MIT | English-only distillation of Whisper large-v3 |
| Granite Speech 4.1 2B (`granite-speech-4.1-2b`) | ModelScope mirror + HF `ibm-granite/granite-speech-4.1-2b` | Apache 2.0 | English, French, German, Spanish, Portuguese, Japanese; no native timestamps |
| Granite Speech 4.1 2B Plus (`granite-speech-4.1-2b-plus`) | ModelScope mirror + HF `ibm-granite/granite-speech-4.1-2b-plus` | Apache 2.0 | Speaker attribution and word-level timestamps are two mutually exclusive prompt modes; 5 European languages, no punctuation or casing |
| Cohere Transcribe 2B (`cohere-transcribe-2b`) | ModelScope mirror (primary); HF `CohereLabs/cohere-transcribe-03-2026` (gated: access approval required) | Apache 2.0 (per model card front-matter; the repo ships no standalone LICENSE file) | 14 languages including Chinese; explicit language required, no timestamps; HF downloads fail with a gated-repo state when no token is configured |
| ARK-ASR 0.6B / 3B (`ark-asr-0.6b`, `ark-asr-3b`) | HF `Edge0/ARK-ASR-0.6B` / `Edge0/ARK-ASR-3B` (formerly `AutoArk-AI`; repo carries the Apache 2.0 tag) | Apache 2.0 | 19 languages including Chinese and English; runs the repository custom inference code (`trust_remote_code`) downloaded with the snapshot |
| Voxtral Mini 3B (`voxtral-mini-3b`) | HF `mistralai/Voxtral-Mini-3B-2507` | Apache 2.0 | 8 languages (no Chinese); auto language detection; processor requires `mistral-common[audio] >= 1.8.1` |

## Release Checklist

Before a public release:

- Confirm this file mentions every newly vendored binary or major dependency.
- Run `npm run verify:third-party` and attach the generated FFmpeg source archive to every binary release.
- Confirm model documentation does not imply redistribution rights that ASRbox does not have.
- Confirm release artifacts do not include model weights, test media, caches, `.venv`, or `node_modules`.
- For any future published container image, inventory Debian ffmpeg and Python/runtime package licenses and provide required source or notices before publication.

## Brand Icons

| Asset | Purpose | Source | License / rights record |
| --- | --- | --- | --- |
| `app/src/assets/brands/openai.svg` | Icon for OpenAI providers and models | `@lobehub/icons-static-svg` npm package (`icons/openai.svg`) | Package code MIT; OpenAI wordmark/logo remains a trademark of OpenAI, used nominatively to identify the corresponding provider |
| `app/src/assets/brands/ollama.svg` | Icon for Ollama providers | `@lobehub/icons-static-svg` npm package (`icons/ollama.svg`) | Package code MIT; Ollama mark remains a trademark of Ollama, used nominatively to identify the corresponding provider |
| `app/src/assets/brands/qwen.svg` | Icon for Qwen models and Alibaba providers | `@lobehub/icons-static-svg` npm package (`icons/qwen.svg`) | Package code MIT; Qwen mark remains a trademark of Alibaba, used nominatively to identify the corresponding provider |
