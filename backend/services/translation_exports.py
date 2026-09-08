from __future__ import annotations

import hashlib
import html
import json
import re

from backend.models import TranscriptSegment
from backend.translation_languages import LANGUAGE_NAMES
from backend.services import exports, translation

FORMATS = {"txt": "text/plain", "srt": "application/x-subrip", "vtt": "text/vtt",
           "ass": "text/x-ssa", "json": "application/json", "md": "text/markdown"}


def cue_text(text, fmt):
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    text = ''.join(c for c in text if ord(c) >= 32 or c in '\n\t')
    if fmt == 'ass':
        # Match FFmpeg plain-text escaping: empty blocks neutralize braces for older ASS players.
        # https://ffmpeg.org/doxygen/trunk/ass_8c_source.html
        return text.replace('\\', '\\'+ '\u2060').replace('{', '\\{{}').replace('\n', r'\N')
    if fmt in {'srt', 'vtt'}:
        return '\n'.join(html.escape(line or '\u00a0', quote=False) for line in text.split('\n'))
    if fmt == 'md':
        return html.escape(re.sub(r'([\\`*_{}\[\]()#+.!|>\-])', r'\\\1', text), quote=False).replace('\n', '<br>')
    return text


def export_version(db, task_id, run_id, version_id, fmt, mode='translated', order='source-first'):
    if fmt not in FORMATS or mode not in {'translated', 'bilingual'} or order not in {'source-first', 'target-first'}:
        translation.fail('TRANSLATION_EXPORT_INVALID', 'Unsupported translation export settings')
    version = translation.get_version(db, task_id, run_id, version_id)
    if fmt == 'json':
        data = {"task_id": task_id, "run_id": run_id, "translation_version_id": version.id,
                "source_version_id": version.source_version_id, "source_language": version.source_language.model_dump(),
                "target_language": version.target_language.model_dump(), "mode": mode, "order": order,
                "segments": [{"id": s.id, "start": s.start, "end": s.end, "speaker": s.speaker,
                              "source_text": s.source_text, "translated_text": s.text} for s in version.segments]}
        content = json.dumps(data, ensure_ascii=False, indent=2)
    else:
        projected = []
        for s in version.segments:
            values = [s.text] if mode == 'translated' else ([s.source_text, s.text] if order == 'source-first' else [s.text, s.source_text])
            separator = r'\N' if fmt == 'ass' else '<br>' if fmt == 'md' else '\n'
            # Speaker text is data too; never pass it unescaped into a subtitle formatter.
            text = separator.join(cue_text(v, fmt) for v in values)
            if s.speaker:
                text = f'[{cue_text(s.speaker, fmt)}] {text}'
            projected.append(TranscriptSegment(id=s.id, start=s.start, end=s.end, text=text))
        if fmt == 'txt':
            content = exports.render_txt('Translation', projected)
        elif fmt == 'md':
            source = version.source_language
            target = version.target_language
            label = lambda language: language.name if language.kind == 'custom' else LANGUAGE_NAMES.get(language.code, 'Auto')
            title = f'{label(source)} → {label(target)}' if mode == 'bilingual' else label(target)
            content = exports.render_markdown(cue_text(title, 'md'), projected)
        else:
            content = getattr(exports, f'render_{fmt}')(projected)
    task = translation.get_task(db, task_id)
    stem = task.filename.replace('\\', '/').rsplit('/', 1)[-1].rsplit('.', 1)[0]
    safe = lambda value: re.sub(r'[^a-zA-Z0-9_-]+', '-', value).strip('-')[:40]
    target = version.target_language
    language = target.code if target.kind == 'preset' else 'custom-' + hashlib.sha256(target.name.encode('utf-8')).hexdigest()[:8]
    filename = f'{safe(stem) or "subtitle"}-{safe(task_id)[:12]}-{safe(run_id)[:12]}-v{version.id}-{language}-{mode}.{fmt}'
    return content, FORMATS[fmt], filename
