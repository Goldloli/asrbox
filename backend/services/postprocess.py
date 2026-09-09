from __future__ import annotations

import re

from backend.models import TranscriptSegment


def clean_text(text: str, *, traditional_to_simplified: bool = False) -> str:
    value = re.sub(r"\s+", " ", text).strip()
    value = re.sub(r"([。！？!?.,，、])\1+", r"\1", value)
    value = re.sub(r"\s+([。！？!?.,，、])", r"\1", value)
    if traditional_to_simplified:
        try:
            from opencc import OpenCC

            value = OpenCC("t2s").convert(value)
        except Exception:
            pass
    return value


_REPETITION_RUN_THRESHOLD = 6
_REPETITION_KEEP = 2
_CHAR_RUN_RE = re.compile(r"(.)\1{%d,}" % (_REPETITION_RUN_THRESHOLD - 1))


def _collapse_repetitions(text: str) -> str:
    collapsed = _CHAR_RUN_RE.sub(lambda match: match.group(1) * _REPETITION_KEEP, text)
    tokens = collapsed.split(" ")
    result: list[str] = []
    index = 0
    while index < len(tokens):
        end = index + 1
        while end < len(tokens) and tokens[end].lower() == tokens[index].lower():
            end += 1
        run = tokens[index:end]
        result.extend(run[:_REPETITION_KEEP] if len(run) >= _REPETITION_RUN_THRESHOLD else run)
        index = end
    return " ".join(result)


def _split_text(text: str, max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    parts = []
    remaining = text
    while remaining:
        parts.append(remaining[:max_chars].strip())
        remaining = remaining[max_chars:].strip()
    return [part for part in parts if part]


def process_segments(
    segments: list[TranscriptSegment],
    *,
    max_chars_per_line: int = 42,
    max_lines: int = 2,
    min_duration_ms: int = 800,
    merge_short_segments: bool = True,
    traditional_to_simplified: bool = False,
) -> list[TranscriptSegment]:
    cleaned = [
        TranscriptSegment(
            id=index,
            start=segment.start,
            end=segment.end,
            text=_collapse_repetitions(clean_text(segment.text, traditional_to_simplified=traditional_to_simplified)),
            speaker=segment.speaker,
            confidence=segment.confidence,
        )
        for index, segment in enumerate(segments, 1)
        if clean_text(segment.text, traditional_to_simplified=traditional_to_simplified)
    ]
    if merge_short_segments:
        merged: list[TranscriptSegment] = []
        for segment in cleaned:
            duration_ms = int((segment.end - segment.start) * 1000)
            if merged and duration_ms < min_duration_ms and merged[-1].speaker == segment.speaker:
                previous = merged[-1]
                previous.text = _collapse_repetitions(clean_text(f"{previous.text} {segment.text}"))
                previous.end = max(previous.end, segment.end)
            else:
                merged.append(segment)
        cleaned = merged

    max_chars = max(1, max_chars_per_line * max_lines)
    expanded: list[TranscriptSegment] = []
    for segment in cleaned:
        parts = _split_text(segment.text, max_chars)
        if len(parts) <= 1:
            expanded.append(segment)
            continue
        total_duration = max(segment.end - segment.start, 0.1)
        part_duration = total_duration / len(parts)
        for part_index, part in enumerate(parts):
            expanded.append(
                TranscriptSegment(
                    id=len(expanded) + 1,
                    start=segment.start + part_duration * part_index,
                    end=segment.start + part_duration * (part_index + 1),
                    text=part,
                    speaker=segment.speaker,
                    confidence=segment.confidence,
                )
            )

    fixed: list[TranscriptSegment] = []
    last_end = 0.0
    min_gap = 0.08
    min_duration = min_duration_ms / 1000
    for segment in expanded:
        start = max(segment.start, last_end + min_gap if fixed else segment.start)
        end = max(segment.end, start + min_duration)
        fixed.append(
            TranscriptSegment(
                id=len(fixed) + 1,
                start=start,
                end=end,
                text=segment.text,
                speaker=segment.speaker,
                confidence=segment.confidence,
            )
        )
        last_end = end
    return fixed
