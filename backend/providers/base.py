from __future__ import annotations

from typing import Protocol

from backend.models import ProviderHealth, TranscriptionResult


class ASRProvider(Protocol):
    async def test_connection(self) -> ProviderHealth:
        ...

    async def transcribe(self, audio_path: str, options: dict) -> TranscriptionResult:
        ...

    async def list_models(self) -> list[str]:
        ...

