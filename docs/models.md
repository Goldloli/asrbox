# Local Models

ASRbox `0.1.0-beta.1` registers 14 local speech-recognition models. Model weights are downloaded on demand and are not included in the repository, `.app`, or DMG.

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

Model Management displays the resolved directory, per-model bytes, total model bytes, and free/total filesystem capacity. Actual size can exceed the catalog estimate because upstream repositories change and interrupted downloads can retain resumable cache files.

## Catalog

Sizes are registry estimates, not exact download promises.

| Model id | Engine | Preferred source | Estimated size | Word timestamps |
| --- | --- | --- | ---: | --- |
| `whisper-base` | Transformers Whisper | Hugging Face | 290 MB | No |
| `whisper-small` | Transformers Whisper | Hugging Face | 967 MB | No |
| `whisper-medium` | Transformers Whisper | Hugging Face | 3,060 MB | No |
| `whisper-large-v3` | Transformers Whisper | Hugging Face | 6,200 MB | No |
| `whisper-large-v3-turbo` | Transformers Whisper | Hugging Face | 1,600 MB | No |
| `faster-whisper-base` | Faster Whisper / CTranslate2 | Hugging Face | 145 MB | Yes |
| `faster-whisper-small` | Faster Whisper / CTranslate2 | Hugging Face | 466 MB | Yes |
| `faster-whisper-medium` | Faster Whisper / CTranslate2 | Hugging Face | 1,500 MB | Yes |
| `faster-whisper-large-v3` | Faster Whisper / CTranslate2 | Hugging Face | 3,100 MB | Yes |
| `faster-whisper-large-v3-turbo` | Faster Whisper / CTranslate2 | Hugging Face | 1,600 MB | Yes |
| `mlx-whisper-turbo` | MLX Whisper | ModelScope, then Hugging Face | 1,600 MB | Yes |
| `sensevoice-small` | FunASR | ModelScope | 900 MB | Yes |
| `qwen3-asr-0.6b` | Qwen3-ASR / Transformers | ModelScope, then Hugging Face | 1,600 MB | No |
| `qwen3-asr-1.7b` | Qwen3-ASR / Transformers | ModelScope, then Hugging Face | 3,900 MB | No |

The estimates add up to roughly 26.3 GiB. A real all-model installation may use more or less space.

## Choosing a Model

- Quick functional check: `faster-whisper-base`.
- General use with moderate resources: `faster-whisper-small` or `faster-whisper-medium`.
- Apple Silicon optimized path: `mlx-whisper-turbo`.
- Chinese, Cantonese, English, Japanese, or Korean with a compact model: `sensevoice-small`.
- Broad multilingual Qwen path: `qwen3-asr-0.6b`; use `qwen3-asr-1.7b` when additional model capacity is worth the memory and disk cost.
- Maximum Whisper-family capacity: a Large V3 or Large V3 Turbo variant, subject to available RAM and startup time.

Accuracy depends on language, recording quality, music/noise, speakers, and runtime. Benchmark representative media before choosing a default model.

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

## Verification Status

All 14 registered models completed transcription of a real MP4 excerpt in the maintainer's macOS Apple Silicon environment on 2026-07-13. Each run returned non-empty text and segments. Automated API tests cover download status, source fallback, pause/resume/stop/retry, compatibility, storage totals, and duplicate-weight filtering.

This evidence verifies the tested dependency snapshot and machine. It does not guarantee future upstream revisions, every media codec, or every hardware configuration.

## Model Sources and Licenses

ASRbox source code is MIT licensed, but model weights and model repositories have their own licenses, acceptable-use terms, attribution requirements, and possible access restrictions. Before production or commercial use:

1. Open the upstream Hugging Face or ModelScope repository named by the model status.
2. Review its current license and model card.
3. Confirm commercial use, redistribution, and regional restrictions.
4. Preserve required attribution.

Do not commit downloaded weights, caches, access tokens, or model directories to this repository.

## Online Providers

Online providers are not local models. They can be useful when local hardware is insufficient or a hosted service offers required features, but media, extracted audio, text, or metadata may leave the machine. Review provider pricing, retention, and privacy terms before use; see [Privacy](privacy.md).
