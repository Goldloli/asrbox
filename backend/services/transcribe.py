from __future__ import annotations

from backend.backends.local_asr import SpeechLMLanguageRequiredError, transcribe_local
from backend.backends.registry import get_model_config
from backend.models import TranscriptionResult
from backend.services.errors import ASRboxError


def transcribe_with_local_model(model_name: str, audio_path: str, options: dict) -> TranscriptionResult:
    model_config = get_model_config(model_name)
    if model_config is None:
        raise RuntimeError(f"Unknown model: {model_name}")
    from backend.services import models as model_service

    if not model_service.is_model_downloaded(model_name):
        raise ASRboxError("MODEL_NOT_DOWNLOADED", f"Model {model_name} is not downloaded", stage="waiting_model")
    try:
        return transcribe_local(audio_path, model_config, options)
    except ASRboxError:
        raise
    except SpeechLMLanguageRequiredError as exc:
        raise ASRboxError(
            "LANGUAGE_REQUIRED",
            f"Model {model_name} has no automatic language detection; select an explicit language",
            stage="transcribing",
        ) from exc
    except RuntimeError as exc:
        raise ASRboxError("MODEL_LOAD_FAILED", str(exc), stage="transcribing") from exc
