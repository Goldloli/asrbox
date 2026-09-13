# Local Models

ASRbox registers 15 local speech-recognition models. Model weights are downloaded on demand and are not included in the repository, `.app`, DMG, or Docker image.

## Storage

The macOS desktop model root is normally:

```text
~/Library/Application Support/com.goldloli.asrbox/models/
```

Each model has its own directory:

```text
~/Library/Application Support/com.goldloli.asrbox/models/<model-name>/
```

The backend derives this from `<data-root>/models/`. A development backend defaults to `<repository>/data/models/`; set `ASRBOX_DATA_DIR` to use another data root.

Docker uses `/data/models/` inside the persistent volume. Provider caches are also redirected below `/data/cache/`, so container recreation does not force a complete redownload.

Model Management displays the resolved directory, per-model bytes, total model bytes, free/total filesystem capacity, and each model's supported inference devices. Actual size can exceed the catalog estimate because upstream repositories change and interrupted downloads can retain resumable cache files.

## Catalog

Sizes are registry estimates, not exact download promises.

| Model id | Engine | Supported inference devices | Preferred source | Estimated size | Word timestamps |
| --- | --- | --- | --- | ---: | --- |
| `whisper-base` | Transformers Whisper | CPU, NVIDIA GPU (CUDA), Apple GPU (MPS) | Hugging Face | 290 MB | No |
| `whisper-small` | Transformers Whisper | CPU, NVIDIA GPU (CUDA), Apple GPU (MPS) | Hugging Face | 967 MB | No |
| `whisper-medium` | Transformers Whisper | CPU, NVIDIA GPU (CUDA), Apple GPU (MPS) | Hugging Face | 3,060 MB | No |
| `whisper-large-v3` | Transformers Whisper | CPU, NVIDIA GPU (CUDA), Apple GPU (MPS) | Hugging Face | 6,200 MB | No |
| `whisper-large-v3-turbo` | Transformers Whisper | CPU, NVIDIA GPU (CUDA), Apple GPU (MPS) | Hugging Face | 1,600 MB | No |
| `faster-whisper-base` | Faster Whisper / CTranslate2 | CPU, NVIDIA GPU (CUDA) | Hugging Face | 145 MB | Yes |
| `faster-whisper-small` | Faster Whisper / CTranslate2 | CPU, NVIDIA GPU (CUDA) | Hugging Face | 466 MB | Yes |
| `faster-whisper-medium` | Faster Whisper / CTranslate2 | CPU, NVIDIA GPU (CUDA) | Hugging Face | 1,500 MB | Yes |
| `faster-whisper-large-v3` | Faster Whisper / CTranslate2 | CPU, NVIDIA GPU (CUDA) | Hugging Face | 3,100 MB | Yes |
| `faster-whisper-large-v3-turbo` | Faster Whisper / CTranslate2 | CPU, NVIDIA GPU (CUDA) | Hugging Face | 1,600 MB | Yes |
| `mlx-whisper-turbo` | MLX Whisper | Apple GPU (MLX; Apple Silicon only) | ModelScope, then Hugging Face | 1,600 MB | Yes |
| `sensevoice-small` | FunASR | CPU, NVIDIA GPU (CUDA) | ModelScope | 900 MB | No |
| `qwen3-asr-0.6b` | Qwen3-ASR / Transformers | CPU, NVIDIA GPU (CUDA), Apple GPU (MPS) | ModelScope, then Hugging Face | 1,600 MB | No |
| `qwen3-asr-1.7b` | Qwen3-ASR / Transformers | CPU, NVIDIA GPU (CUDA), Apple GPU (MPS) | ModelScope, then Hugging Face | 3,900 MB | No |
| `moss-transcribe-diarize` | MOSS-Transcribe-Diarize / Transformers | CPU, NVIDIA GPU (CUDA) | ModelScope, then Hugging Face | 1,900 MB | No |

The estimates add up to roughly 28.2 GiB. A real all-model installation may use more or less space.

These device labels describe the execution paths supported by each ASRbox engine; they do not assert that the listed accelerator is present or active on the current machine. The runtime keeps its existing automatic selection and fallback behavior, so the device actually used depends on available hardware and runtime support.

## Choosing a Model

- Quick functional check: `faster-whisper-base`.
- General use with moderate resources: `faster-whisper-small` or `faster-whisper-medium`.
- Apple Silicon optimized path: `mlx-whisper-turbo`.
- Docker/Linux CPU quick start: `faster-whisper-base` or `faster-whisper-small`; MLX is unavailable.
- Chinese, Cantonese, English, Japanese, or Korean with a compact model: `sensevoice-small`.
- Broad multilingual Qwen path: `qwen3-asr-0.6b`; use `qwen3-asr-1.7b` when additional model capacity is worth the memory and disk cost.
- End-to-end speaker diarization without `HF_TOKEN` or a separate diarization model: `moss-transcribe-diarize`. It emits timestamped segments with `[S01]`-style speaker labels in one pass, supports 50+ languages and up to roughly 90 minutes of audio per run, and is Apache 2.0 licensed. It has no word-level timestamps and runs slowly on CPU for long recordings.
- Maximum Whisper-family capacity: a Large V3 or Large V3 Turbo variant, subject to available RAM and startup time.

Accuracy depends on language, recording quality, music/noise, speakers, and runtime. Benchmark representative media before choosing a default model.

Timeline note: `qwen3-asr-*` and `sensevoice-small` do not emit timestamps. Their subtitle cue times are approximate values spread across each chunk's audio window, so they are fine for reading order and rough seeking but not for frame-accurate editing; pick a Whisper-family model or `moss-transcribe-diarize` when precise timing matters.

## Transcription Safeguards

Whisper-family engines (Transformers Whisper, Faster Whisper, MLX Whisper) decode with anti-hallucination defaults: no cross-window prompt carry-over, plus repeated-ngram suppression where the engine supports it. These defaults stop a hallucination in one decoding window from reinforcing itself into hundreds of repeated words on silent or musical passages. Qwen3-ASR sizes its output token budget from audio duration instead of a fixed cap, so long recordings are not silently truncated.

As an engine-independent safety net, post-processing collapses any token repeated six or more times in a row down to two occurrences without changing segment timing, and the task Quality report flags `REPETITIVE_TRANSCRIPT` for both character-level (Chinese) and word-level (English) repetition.

## Download Controls

- **Pause** keeps the task active and blocks at ASRbox-controlled download checkpoints. An in-flight upstream operation can take a short time to reach a checkpoint.
- **Resume** continues the paused task in the current application process.
- **Stop** ends the active task. Already downloaded files remain so a later retry can reuse them.
- **Retry** starts the same model download again without deleting the existing directory.
- **Redownload** deletes the ASRbox-managed model directory first and downloads a clean copy.
- **Delete** unloads the model and deletes `models/<model-name>/`.

Pause state is in memory. Quitting ASRbox stops the current worker; reopening the app does not restore a paused worker, but the upstream downloader may reuse completed files.

ASRbox disables Hugging Face Xet in the managed backend so pause and stop can be observed through controllable file downloads. It also excludes duplicate PyTorch/FP32 weight variants when a model has an accepted runtime weight format.

## Completion and Compatibility

A model is considered downloaded only when its directory has a `model.json` marker and usable weight files. ASRbox separately reports:

- `downloaded`: the managed directory is complete enough to use.
- `compatible`: required files and runtime support are present.
- `cache_detected`: an upstream cache exists; this alone does not make the model runnable.
- `installed_source` and `installed_repo_id`: where the completed managed copy came from.

Hugging Face `.incomplete` files inside a completed model's internal `.cache` do not invalidate the usable model. An incomplete file outside that cache, a missing marker, or missing weights marks the directory incomplete. “Clean incomplete downloads” removes such incomplete managed directories; use it carefully because removal is irreversible.

The Linux Docker runtime excludes Apple-only `mlx` and `mlx-whisper` packages. The backend marks `mlx-whisper-turbo` incompatible and rejects its download in a container instead of consuming disk for unusable weights. CPU-compatible models can still require substantial RAM and can run much more slowly than desktop MLX or GPU execution.

## Verification Status

The 14 models registered as of 2026-07-13 completed transcription of a real MP4 excerpt in the maintainer's macOS Apple Silicon environment on that date. Each run returned non-empty text and segments. `moss-transcribe-diarize` completed a real 6.8-minute two-person interview MP4 on 2026-07-25 in the same environment, returning 161 timestamped segments with three native speaker labels (`S01`–`S03`). Automated API tests cover download status, source fallback, pause/resume/stop/retry, compatibility, storage totals, and duplicate-weight filtering.

This evidence verifies the tested dependency snapshot and machine. Docker build and smoke coverage verify runtime startup and compatibility reporting, not the accuracy or speed of all models on every Linux CPU. Future upstream revisions, media codecs, architectures, and hardware can behave differently.

## Model Sources and Licenses

ASRbox source code is MIT licensed, but model weights and model repositories have their own licenses, acceptable-use terms, attribution requirements, and possible access restrictions. Before production or commercial use:

1. Open the upstream Hugging Face or ModelScope repository named by the model status.
2. Review its current license and model card.
3. Confirm commercial use, redistribution, and regional restrictions.
4. Preserve required attribution.

Do not commit downloaded weights, caches, access tokens, or model directories to this repository.

## Online Providers

Online providers are not local models. They can be useful when local hardware is insufficient or a hosted service offers required features, but media, extracted audio, text, or metadata may leave the machine. Review provider pricing, retention, and privacy terms before use; see [Privacy](privacy.md).
