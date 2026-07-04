from __future__ import annotations

import os

from backend.models import TranscriptSegment


def is_diarization_ready(token: str | None = None) -> bool:
    try:
        import pyannote.audio  # noqa: F401
    except Exception:
        return False
    return bool(token or os.environ.get("HF_TOKEN"))


def apply_diarization(audio_path: str, segments: list[TranscriptSegment], *, token: str | None = None) -> list[TranscriptSegment]:
    hf_token = token or os.environ.get("HF_TOKEN")
    if not hf_token:
        raise RuntimeError("Diarization requires HF_TOKEN")
    try:
        from pyannote.audio import Pipeline
    except Exception as exc:
        raise RuntimeError("pyannote.audio is not installed") from exc

    pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=hf_token)
    diarization = pipeline(audio_path)
    speaker_ranges = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        speaker_ranges.append((float(turn.start), float(turn.end), str(speaker)))

    updated: list[TranscriptSegment] = []
    for segment in segments:
        midpoint = (segment.start + segment.end) / 2
        speaker = segment.speaker
        for start, end, candidate in speaker_ranges:
            if start <= midpoint <= end:
                speaker = candidate
                break
        updated.append(
            TranscriptSegment(
                id=segment.id,
                start=segment.start,
                end=segment.end,
                text=segment.text,
                speaker=speaker,
                confidence=segment.confidence,
            )
        )
    return updated
