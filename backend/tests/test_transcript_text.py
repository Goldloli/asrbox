from backend.models import TranscriptSegment
from backend.utils.transcript_text import normalize_transcript_text
from backend.utils.transcript_text import transcript_text_from_segments


def test_transcript_text_from_segments_uses_readable_plain_text_spacing() -> None:
    assert (
        transcript_text_from_segments(
            [
                TranscriptSegment(id=1, start=0, end=1, text="本地模型真实"),
                TranscriptSegment(id=2, start=1, end=2, text="转写结果"),
            ]
        )
        == "本地模型真实转写结果"
    )
    assert (
        transcript_text_from_segments(
            [
                TranscriptSegment(id=1, start=0, end=1, text="真实 provider"),
                TranscriptSegment(id=2, start=1, end=2, text="转写结果"),
            ]
        )
        == "真实 provider 转写结果"
    )
    assert (
        transcript_text_from_segments(
            [
                TranscriptSegment(id=1, start=0, end=1, text="hello"),
                TranscriptSegment(id=2, start=1, end=2, text="world"),
                TranscriptSegment(id=3, start=2, end=3, text="."),
            ]
        )
        == "hello world."
    )


def test_normalize_transcript_text_adds_english_sentence_spacing() -> None:
    assert normalize_transcript_text("part of Dota?So Artifacts") == "part of Dota? So Artifacts"
