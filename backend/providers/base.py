from __future__ import annotations

from typing import Protocol

from backend.models import ProviderHealth, TranscriptionResult


class ProviderError(RuntimeError):
    def __init__(self, message: str, *, code: str | None = None, retryable: bool = False, stage: str | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.stage = stage


class ASRProvider(Protocol):
    def test_connection(self) -> ProviderHealth:
        ...

    def transcribe(self, audio_path: str, options: dict) -> TranscriptionResult:
        ...

    def list_models(self) -> list[str]:
        ...
