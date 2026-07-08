# Models

ASRbox supports local models and online providers. Model availability depends on installed Python packages, hardware, model license, and upstream compatibility.

## Local Model Guidance

Use local models when privacy matters or when offline transcription is required.

General tradeoffs:

- Smaller models start faster and use less memory.
- Larger models may improve accuracy but require more disk, RAM, and compute.
- Apple Silicon paths may use MLX when supported.
- Faster Whisper paths may improve CPU/GPU throughput for Whisper-compatible models.

## Online Provider Guidance

Use online providers when:

- You need a model that is not practical to run locally.
- You accept sending media or transcript data to a third-party service.
- You need provider-specific accuracy, diarization, or language support.

Always review provider privacy and pricing terms.

## Model License Checklist

Before adding a model:

- Confirm source URL.
- Confirm license name and text.
- Confirm commercial usage rules.
- Confirm redistribution rules.
- Confirm attribution requirements.
- Confirm expected disk size and hardware requirements.

Do not commit model weights to this repository.

## Known Model Notes

### Whisper and Faster Whisper

Whisper-compatible models are the baseline local ASR path. Faster Whisper can improve runtime performance through CTranslate2-backed inference.

### MLX Whisper

MLX Whisper is intended for Apple Silicon workflows. Keep a non-MLX fallback available for users who are not on supported hardware.

### FunASR and ModelScope

FunASR and ModelScope are useful for Chinese ASR workflows. Check each model's license and required package versions.

### Qwen3-ASR

Qwen3-ASR depends on Transformers support for the model class. If `transformers.models.qwen3_asr` is unavailable, update the backend Python dependencies before treating the issue as a frontend bug.
