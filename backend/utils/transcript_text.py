from __future__ import annotations

import re
from typing import Iterable

from backend.models import TranscriptSegment


_NO_LEADING_SPACE = set(".,!?;:，。！？；：、)]}）】》」』")
_NO_TRAILING_SPACE = set("([{（【《「『")


def _needs_space(left: str, right: str) -> bool:
    if not left or not right:
        return False
    previous = left[-1]
    current = right[0]
    if previous.isspace() or current.isspace():
        return False
    if current in _NO_LEADING_SPACE or previous in _NO_TRAILING_SPACE:
        return False
    return (previous.isascii() and previous.isalnum()) or (current.isascii() and current.isalnum())


def transcript_text_from_segments(segments: Iterable[TranscriptSegment]) -> str:
    text = ""
    for segment in segments:
        part = (segment.text or "").strip()
        if not part:
            continue
        if text and _needs_space(text, part):
            text += " "
        text += part
    return normalize_transcript_text(text)


def normalize_transcript_text(text: str | None) -> str:
    value = re.sub(r"\s+", " ", text or "").strip()
    value = re.sub(r"\s+([.,!?;:，。！？；：、])", r"\1", value)
    value = re.sub(r"([.!?;:,])(?=[A-Za-z])", r"\1 ", value)
    return value
