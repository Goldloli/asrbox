# ASRbox Real-Video Benchmark (2026-09-19)

- Machine: maintainer's macOS Apple Silicon, CPU inference (no CUDA kit)
- Production path: `transcribe_with_local_model` with VAD defaults per model, `language=en` (English run) / `language=zh` (Chinese run)
- English media: real 18:05 Trump Pentagon 9/11 memorial speech video (user-provided), 16 kHz mono WAV; 90 s clip from 02:00
- Chinese media: 90 s clip from a real Chinese tutorial video (same clip as the 2026-09-19 real-model run)
- Reference: `faster-whisper-large-v3-turbo` (both runs); accuracy = WER (English, word-level) / CER (Chinese, char-level) against the reference after normalization

## English real video

| model | 90 s wall | 90 s RTF | 90 s WER | full wall | full RTF | full WER | segments (full) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| faster-whisper-large-v3-turbo (reference) | 18.7 s | 0.208 | 0.0% | 184.4 s | 0.170 | 0.0% | 151 |
| faster-whisper-distil-large-v3 | 14.1 s | 0.156 | 4.8% | 165.9 s | 0.153 | 2.9% | 221 |
| paraformer-zh | 10.1 s | 0.113 | 19.9% | 116.4 s | 0.107 | 16.8% | 185 |
| fun-asr-nano | 24.3 s | 0.270 | 11.6% | 229.5 s | 0.211 | 6.6% | 1 (no native timestamps) |

## Chinese 90 s clip (ladder protocol)

| model | wall | RTF | CER vs reference |
| --- | ---: | ---: | ---: |
| faster-whisper-large-v3-turbo (reference) | 22.7 s | 0.252 | 0.0% |
| faster-whisper-distil-large-v3 | 25.0 s | 0.278 | 138.9% (English-only model hallucinates on Chinese; expected misuse) |
| paraformer-zh | 10.5 s | 0.117 | 8.3% |
| fun-asr-nano | 27.5 s | 0.306 | 6.8% |

## Conclusions

- `faster-whisper-distil-large-v3`: 10–25% faster than large-v3-turbo on English with 2.9–4.8% WER — validated for English batch/long audio. On Chinese audio it hallucinates English (841 chars vs 458), confirming the English-only catalog labeling.
- `paraformer-zh`: fastest model in the catalog (RTF 0.107–0.117) with A-grade Chinese accuracy (CER 8.3% vs turbo, matching SenseVoice-class) and real timestamped segments; English is usable but clearly weaker (WER 16.8–19.9%) — Chinese-dominant content is its domain.
- `fun-asr-nano`: A-grade Chinese accuracy (CER 6.8%) and solid English (WER 6.6% full video), slowest of the three on CPU; no native timestamps by design.

Raw JSON: `asrbox-real-video-benchmark-20260919.json` (English) and `asrbox-real-video-benchmark-20260919-zh.json` (Chinese).
