# Local Models

ASRbox registers 24 local speech-recognition models. Model weights are downloaded on demand and are not included in the repository, `.app`, DMG, or Docker image.

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
| `paraformer-zh` | FunASR | CPU, NVIDIA GPU (CUDA) | ModelScope, then Hugging Face | 850 MB | No |
| `fun-asr-nano` | FunASR | CPU, NVIDIA GPU (CUDA) | ModelScope | 2,050 MB | No |
| `faster-whisper-distil-large-v3` | Faster Whisper / CTranslate2 | CPU, NVIDIA GPU (CUDA) | Hugging Face | 1,450 MB | Yes |
| `qwen3-asr-0.6b` | Qwen3-ASR / Transformers | CPU, NVIDIA GPU (CUDA), Apple GPU (MPS) | ModelScope, then Hugging Face | 1,600 MB | No |
| `qwen3-asr-1.7b` | Qwen3-ASR / Transformers | CPU, NVIDIA GPU (CUDA), Apple GPU (MPS) | ModelScope, then Hugging Face | 3,900 MB | No |
| `moss-transcribe-diarize` | MOSS-Transcribe-Diarize / Transformers | CPU, NVIDIA GPU (CUDA) | ModelScope, then Hugging Face | 1,900 MB | No |
| `granite-speech-4.1-2b` | Granite Speech / Transformers | CPU, NVIDIA GPU (CUDA) | ModelScope, then Hugging Face | 4,945 MB | No |
| `granite-speech-4.1-2b-plus` | Granite Speech Plus / Transformers | CPU, NVIDIA GPU (CUDA) | ModelScope, then Hugging Face | 4,225 MB | Yes (task option) |
| `cohere-transcribe-2b` | Cohere Transcribe / Transformers | CPU, NVIDIA GPU (CUDA) | ModelScope, then Hugging Face (gated) | 4,130 MB | No |
| `ark-asr-0.6b` | ARK-ASR / Transformers | CPU, NVIDIA GPU (CUDA) | ModelScope, then Hugging Face | 2,600 MB | No |
| `ark-asr-3b` | ARK-ASR / Transformers | CPU, NVIDIA GPU (CUDA) | ModelScope, then Hugging Face | 8,130 MB | No |
| `voxtral-mini-3b` | Voxtral / Transformers | CPU, NVIDIA GPU (CUDA) | ModelScope, then Hugging Face | 9,360 MB | No |

The estimates add up to roughly 65 GiB. A real all-model installation may use more or less space.

These device labels describe the execution paths supported by each ASRbox engine; they do not assert that the listed accelerator is present or active on the current machine. The runtime keeps its existing automatic selection and fallback behavior, so the device actually used depends on available hardware and runtime support.

## Choosing a Model

- Quick functional check: `faster-whisper-base`.
- General use with moderate resources: `faster-whisper-small` or `faster-whisper-medium`.
- Apple Silicon optimized path: `mlx-whisper-turbo`.
- Docker/Linux CPU quick start: `faster-whisper-base` or `faster-whisper-small`; MLX is unavailable.
- Chinese, Cantonese, English, Japanese, or Korean with a compact model: `sensevoice-small`.
- Chinese subtitles that need a measured timeline: `paraformer-zh`. It aggregates the model's native per-character timestamps into segment cue times and enables VAD segmentation by default; raw output has no punctuation, so punctuation relies on post-processing.
- Chinese dialects and multilingual audio: `fun-asr-nano` (Tongyi 2025, Apache 2.0). It emits no timestamps, so its cue times are approximate.
- English-only batch or long audio: `faster-whisper-distil-large-v3`, roughly twice as fast as Large V3 with near-Large quality. It cannot transcribe Chinese or other languages.
- Broad multilingual Qwen path: `qwen3-asr-0.6b`; use `qwen3-asr-1.7b` when additional model capacity is worth the memory and disk cost.
- End-to-end speaker diarization without `HF_TOKEN` or a separate diarization model: `moss-transcribe-diarize`. It emits timestamped segments with `[S01]`-style speaker labels in one pass, supports 50+ languages and up to roughly 90 minutes of audio per run, and is Apache 2.0 licensed. It has no word-level timestamps and runs slowly on CPU for long recordings.
- European-language subtitles with punctuation and casing (English, French, German, Spanish, Portuguese, Japanese): `granite-speech-4.1-2b`. It does not support Chinese, and its cue times are approximate.
- Speaker-attributed turns or word-level timestamps in one pass (English, French, German, Spanish, Portuguese): `granite-speech-4.1-2b-plus`. The default mode emits `[Speaker N]:` turns; enabling the task's word-timestamps option switches to a timed-word mode whose centisecond tags are unwrapped into a real word timeline. The two modes are mutually exclusive, the model emits no punctuation or casing, and speaker numbering restarts per chunk on long audio.
- High-accuracy English plus 13 more languages including Chinese, fast, with punctuation: `cohere-transcribe-2b`. It has no automatic language detection — an explicit language is required — and no timestamps; its cue times are approximate. Downloading prefers the open ModelScope mirror; the Hugging Face source needs access approval and fails with a specific gated-repository message when no mirror is reachable.
- Chinese-English and 17 more European languages with language following the audio: `ark-asr-0.6b` or `ark-asr-3b` (the 3B is the more accurate one, Apache 2.0). No timestamps; long audio is automatically chunked.
- Very long audio in a single pass (up to 30 minutes) across 8 auto-detected languages: `voxtral-mini-3b`. No Chinese, no timestamps; the processor requires the bundled `mistral-common` dependency.
- Maximum Whisper-family capacity: a Large V3 or Large V3 Turbo variant, subject to available RAM and startup time.

Accuracy depends on language, recording quality, music/noise, speakers, and runtime. Benchmark representative media before choosing a default model.

Timeline note: `qwen3-asr-*`, `sensevoice-small`, `fun-asr-nano`, `cohere-transcribe-2b`, `ark-asr-*`, `voxtral-mini-3b`, and `granite-speech-4.1-2b` do not emit timestamps. Their subtitle cue times are approximate values spread across each chunk's audio window, so they are fine for reading order and rough seeking but not for frame-accurate editing; pick a Whisper-family model, `paraformer-zh`, `moss-transcribe-diarize`, or `granite-speech-4.1-2b-plus` with the word-timestamps option when precise timing matters.

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

On 2026-09-19 the three models added by the phase-1 catalog expansion were verified the same way: `paraformer-zh` transcribed a real 90-second Chinese WAV into 8 timestamped segments (VAD on, token-level timestamps aggregated, monotonic timeline), `fun-asr-nano` transcribed the same clip into 7 segments, and `faster-whisper-distil-large-v3` transcribed a real English WAV sample. Each run completed all six export formats and was deleted afterwards; results are recorded under `backend/real_tests/results/asrbox-real-models-20260919-*.md`.

A second 2026-09-19 real-world benchmark ran a user-provided 18:05 English speech video (Trump Pentagon 9/11 memorial address) end-to-end through the production inference path, plus the 90-second Chinese ladder clip, on macOS Apple Silicon CPU with `faster-whisper-large-v3-turbo` as reference: `faster-whisper-distil-large-v3` was 10–25% faster than the reference with 2.9–4.8% WER on English; `paraformer-zh` was the fastest model in the catalog (RTF 0.107) with 8.3% CER on Chinese and 16.8–19.9% WER on English; `fun-asr-nano` reached 6.8% CER on Chinese and 6.6% WER on the full English video. The English-only model was also confirmed to hallucinate English on Chinese audio, validating the English-only catalog labeling. Evidence: `backend/real_tests/results/asrbox-real-video-benchmark-20260919*.md`.

The same three models were then checked in the running models page itself (local backend over the repository `data/` directory, 2026-09-19): all three render like existing entries — downloaded badge, CPU/GPU support, speed and accuracy grades, capability badges, and a working "set as default" action; the ladder shows their measured grades (`S S B`, `S A B`, `C A B`) with no estimated `*` marker; the category filters group them as expected (`paraformer-zh` and `fun-asr-nano` under 中文优先, `faster-whisper-distil-large-v3` under Faster Whisper); and each detail panel states its own capability set and limitations. That pass also corrected two copy defects: the Distil entry's capability list had reused the shared Faster Whisper template and claimed multilingual recognition and automatic language detection while its language coverage said English only, and the ladder footnote attributed every measured grade to the Windows + RTX 5080 run. Both now describe what the models and the measurements actually are.

The packaged desktop build was verified separately, because the frozen sidecar carries its own runtime copy of these engines. On 2026-09-20 a real 18:05 English speech video and real 90-second Chinese audio were transcribed end-to-end through `POST /transcriptions/path` on the frozen binary: `faster-whisper-distil-large-v3` returned 256 timestamped segments for the full English video and 21 for a 90-second excerpt, `paraformer-zh` returned 8 segments, and `fun-asr-nano` returned 7. Three packaging gaps surfaced and are fixed in that same change: faster-whisper's Silero VAD asset was not bundled (any faster-whisper transcription failed with `MODEL_LOAD_FAILED`); the funasr sources behind `@torch.jit.script` were absent from the bundle, which made TorchScript import fail and left the `Paraformer` model class unregistered (FunASR transcription with VAD failed); and the frozen runtime hook pinned `OMP_NUM_THREADS` to 1 for the whole process tree, so the transcription worker inherited a single-threaded CPU engine. The build now ships `faster_whisper` package data and every funasr source that TorchScript reads, the worker subprocess sets its own thread count, and the build-argument test plus the frozen-binary smoke test assert the bundled payload. That thread pin measured as 57–60 seconds for a 90-second English excerpt and 600.9 seconds for the full 18:05 video; after the fix the same binary returns 15.1 seconds and 129.6 seconds with byte-identical transcripts (256 segments, 10777 characters).

This evidence verifies the tested dependency snapshot and machine. Docker build and smoke coverage verify runtime startup and compatibility reporting, not the accuracy or speed of all models on every Linux CPU. Future upstream revisions, media codecs, architectures, and hardware can behave differently.

The six models added by the phase-2 catalog expansion were verified the same way in the packaged desktop app on macOS Apple Silicon (2026-09-23) and on Windows x64 (2026-09-23/24). Each model was downloaded through the managed lifecycle and transcribed real media end-to-end: `ark-asr-0.6b` and `ark-asr-3b` on a 60-second Chinese clip (six segments each, with visibly different wording confirming each ran its own weights), `cohere-transcribe-2b` on the Chinese clip with an explicit language (five punctuation-preserving segments; an 18-minute sample re-transcribed identically on Windows), `granite-speech-4.1-2b` on a 30-second English excerpt (punctuated, cased), `granite-speech-4.1-2b-plus` in its default speaker-attribution mode (S01-labelled turns; the word-timestamp mode was verified separately in development with monotonic unwrapped timelines), and `voxtral-mini-3b` with its `tekken.json` tokenizer layout. The frozen binary smoke asserts the runtime probes for every engine family. Evidence: `backend/real_tests/results/asrbox-speech-lm-smoke-20260920.md`.

## Model Sources and Licenses

ASRbox source code is MIT licensed, but model weights and model repositories have their own licenses, acceptable-use terms, attribution requirements, and possible access restrictions. Before production or commercial use:

1. Open the upstream Hugging Face or ModelScope repository named by the model status.
2. Review its current license and model card.
3. Confirm commercial use, redistribution, and regional restrictions.
4. Preserve required attribution.

Do not commit downloaded weights, caches, access tokens, or model directories to this repository.

## Online Providers

Online providers are not local models. They can be useful when local hardware is insufficient or a hosted service offers required features, but media, extracted audio, text, or metadata may leave the machine. Review provider pricing, retention, and privacy terms before use; see [Privacy](privacy.md).
