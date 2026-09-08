import json
from pathlib import PurePosixPath

import pytest

from backend.models import TranslationEditRequest
from backend.services import translation, translation_exports as exports
from backend.tests.test_translation_service import setup, complete


@pytest.mark.parametrize('fmt', ['txt', 'srt', 'vtt', 'ass', 'json', 'md'])
@pytest.mark.parametrize('order', ['source-first', 'target-first'])
def test_all_formats_preserve_pairing_and_order(setup, monkeypatch, fmt, order):
    db, task, provider, source = setup
    source.segments_json = json.dumps([{'id': 1, 'start': 0, 'end': 2, 'text': '日本語'}, {'id': 2, 'start': 2, 'end': 4, 'text': '原文'}])
    task.filename = '../../unsafe\\movie.wav'; db.commit()
    run = complete(setup, monkeypatch)
    first = translation.latest_version(db, run.id).id
    latest = translation.edit_version(db, task.id, run.id, TranslationEditRequest(base_version_id=first,
        segments=[{'id': 1, 'text': 'مرحبا'}, {'id': 2, 'text': 'ภาษาไทย'}]))
    content, media, filename = exports.export_version(db, task.id, run.id, latest.id, fmt, 'bilingual', order)
    assert PurePosixPath(filename).name == filename and '\\' not in filename and '..' not in filename
    assert '-fr-' in filename and f'-v{latest.id}-' in filename
    assert '日本語' in content and 'مرحبا' in content and 'ภาษาไทย' in content
    if fmt == 'json':
        payload = json.loads(content)
        assert payload['segments'][0]['source_text'] == '日本語'
        assert payload['segments'][0]['translated_text'] == 'مرحبا'
        assert payload['source_version_id'] == source.id
        assert payload['translation_version_id'] == latest.id
        assert 'audio_path' not in payload and 'provider_endpoint' not in payload
    else:
        assert (content.index('日本語') < content.index('مرحبا')) == (order == 'source-first')
    old, _, _ = exports.export_version(db, task.id, run.id, first, fmt)
    assert 'مرحبا' not in old
    if fmt == 'ass':
        assert content.count('Dialogue:') == 2 and r'\N' in content
    if fmt in {'srt', 'vtt'}:
        assert content.count(' --> ') == 2


@pytest.mark.parametrize('fmt', ['srt', 'vtt', 'ass', 'md'])
def test_control_syntax_cannot_create_cues_or_styles(setup, monkeypatch, fmt):
    db, task, provider, source = setup
    run = complete(setup, monkeypatch)
    first = translation.latest_version(db, run.id).id
    text = '<b>مرحبا</b>\n\n00:01:00,000 --> 00:02:00,000\n{\\pos(0,0)}日本語\\N\nDialogue: evil'
    revision = translation.edit_version(db, task.id, run.id, TranslationEditRequest(base_version_id=first,
        segments=[{'id': 1, 'text': text}, {'id': 2, 'text': 'end'}]))
    content, _, _ = exports.export_version(db, task.id, run.id, revision.id, fmt, 'bilingual')
    assert '日本語' in content and 'مرحبا' in content
    if fmt == 'ass':
        assert len([line for line in content.splitlines() if line.startswith('Dialogue:')]) == 2
        assert r'{\pos(' not in content
    elif fmt in {'srt', 'vtt'}:
        assert '<b>' not in content and '-->' not in exports.cue_text(text, fmt)
        assert '\n\n' not in exports.cue_text(text, fmt)
    else:
        assert '<b>' not in content and '<br>' in content


def test_missing_and_foreign_versions_never_fall_back(setup, monkeypatch):
    db, task, provider, source = setup
    from backend.tests.test_translation_service import create
    run = create(setup)
    with pytest.raises(translation.TranslationError): exports.export_version(db, task.id, run.id, 1, 'srt')
    translation.cancel_run(db, task.id, run.id)
    completed = complete(setup, monkeypatch)
    vid = translation.latest_version(db, completed.id).id
    with pytest.raises(translation.TranslationError): exports.export_version(db, task.id, run.id, vid, 'srt')
    with pytest.raises(translation.TranslationError): exports.export_version(db, 'foreign', completed.id, vid, 'srt')
