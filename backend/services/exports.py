from __future__ import annotations

import json

from backend.models import TranscriptSegment


def _srt_time(seconds: float) -> str:
    milliseconds_total = int(round(seconds * 1000))
    total_seconds, milliseconds = divmod(milliseconds_total, 1000)
    minutes_total, seconds_part = divmod(total_seconds, 60)
    hours, minutes = divmod(minutes_total, 60)
    return f"{hours:02}:{minutes:02}:{seconds_part:02},{milliseconds:03}"


def _vtt_time(seconds: float) -> str:
    return _srt_time(seconds).replace(",", ".")


def _ass_time(seconds: float) -> str:
    milliseconds_total = int(round(seconds * 1000))
    total_seconds, milliseconds = divmod(milliseconds_total, 1000)
    minutes_total, seconds_part = divmod(total_seconds, 60)
    hours, minutes = divmod(minutes_total, 60)
    centiseconds = milliseconds // 10
    return f"{hours}:{minutes:02}:{seconds_part:02}.{centiseconds:02}"


def _segment_text(segment: TranscriptSegment) -> str:
    return f"[{segment.speaker}] {segment.text}" if segment.speaker else segment.text


def render_txt(_title: str, segments: list[TranscriptSegment]) -> str:
    return "\n".join(_segment_text(segment) for segment in segments)


def render_srt(segments: list[TranscriptSegment]) -> str:
    blocks = []
    for index, segment in enumerate(segments, 1):
        blocks.append(
            f"{index}\n{_srt_time(segment.start)} --> {_srt_time(segment.end)}\n{_segment_text(segment)}\n"
        )
    return "\n".join(blocks)


def render_vtt(segments: list[TranscriptSegment]) -> str:
    blocks = ["WEBVTT\n"]
    for segment in segments:
        blocks.append(f"{_vtt_time(segment.start)} --> {_vtt_time(segment.end)}\n{_segment_text(segment)}\n")
    return "\n".join(blocks)


def render_ass(segments: list[TranscriptSegment]) -> str:
    header = (
        "[Script Info]\nScriptType: v4.00+\nPlayResX: 1280\nPlayResY: 720\n\n"
        "[V4+ Styles]\n"
        "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,"
        "Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,"
        "Alignment,MarginL,MarginR,MarginV,Encoding\n"
        "Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,"
        "0,0,1,2,0,2,10,10,30,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )
    lines = [
        f"Dialogue: 0,{_ass_time(segment.start)},{_ass_time(segment.end)},Default,,0,0,0,,{_segment_text(segment)}"
        for segment in segments
    ]
    return header + "\n".join(lines)


def render_markdown(title: str, segments: list[TranscriptSegment]) -> str:
    body = "\n".join(f"- `{_vtt_time(s.start)}` {_segment_text(s)}" for s in segments)
    return f"# {title}\n\n{body}\n"


def render_json(task: dict, segments: list[TranscriptSegment]) -> str:
    payload = {**task, "segments": [segment.model_dump() for segment in segments]}
    return json.dumps(payload, ensure_ascii=False, indent=2, default=str)
