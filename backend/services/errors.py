from __future__ import annotations

ERROR_CODES: dict[str, str] = {
    "MODEL_STORAGE_UNAVAILABLE": "The configured model storage location is unavailable.",
    "MODEL_STORAGE_READ_ONLY": "The configured model storage location is not writable.",
    "MODEL_STORAGE_MIGRATING": "Model storage relocation is in progress.",
    "MODEL_NOT_DOWNLOADED": "Model files are not downloaded.",
    "MODEL_COMPATIBILITY_FAILED": "Downloaded model files are incomplete or incompatible.",
    "MODEL_LOAD_FAILED": "Model runtime failed to load the model.",
    "FFMPEG_FAILED": "ffmpeg failed while preparing media.",
    "FFPROBE_FAILED": "ffprobe failed while inspecting media.",
    "NO_AUDIO_STREAM": "The media file does not contain an audio stream.",
    "UNSUPPORTED_MEDIA_FORMAT": "The media file format is not supported.",
    "PROVIDER_RATE_LIMITED": "The ASR provider returned a rate limit response.",
    "PROVIDER_TIMEOUT": "The ASR provider timed out.",
    "PROVIDER_AUTH_FAILED": "The ASR provider rejected credentials.",
    "CHUNK_FAILED": "A long-audio chunk failed to transcribe.",
    "DIARIZATION_TOKEN_MISSING": "Speaker diarization requires an HF_TOKEN.",
    "TASK_CANCELLED": "The task was cancelled.",
}


class ASRboxError(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        stage: str | None = None,
        command: str | None = None,
        stderr_excerpt: str | None = None,
        audio_metadata: dict | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.stage = stage
        self.message = message
        self.command = command
        self.stderr_excerpt = stderr_excerpt
        self.audio_metadata = audio_metadata
