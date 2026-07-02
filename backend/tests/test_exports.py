from backend.services.exports import render_ass, render_srt, render_txt, render_vtt
from backend.models import TranscriptSegment


SEGMENTS = [
    TranscriptSegment(id=1, start=0.0, end=1.25, text="你好 ASRbox"),
    TranscriptSegment(id=2, start=1.25, end=3.0, text="第二句"),
]


def test_export_renderers_use_expected_subtitle_formats() -> None:
    assert render_txt("ignored", SEGMENTS) == "你好 ASRbox\n第二句"
    assert "00:00:00,000 --> 00:00:01,250" in render_srt(SEGMENTS)
    assert render_vtt(SEGMENTS).startswith("WEBVTT")
    assert "Dialogue:" in render_ass(SEGMENTS)
