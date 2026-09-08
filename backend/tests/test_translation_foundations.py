from __future__ import annotations

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker


def test_translation_migration_is_additive_and_repeatable(tmp_path):
    from backend.database.models import Base, SchemaMigration, TranscriptionTask
    from backend.database.migrations import run_migrations

    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    old_tables = [t for name, t in Base.metadata.tables.items() if not name.startswith('translation_')]
    Base.metadata.create_all(engine, tables=old_tables)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        db.add(TranscriptionTask(id='original', filename='source.wav', source='local', audio_path='source.wav', status='completed', text='原文'))
        db.commit()
        from backend.tests.test_proofreading_service import _completed_run
        _completed_run(db)
    with engine.connect() as conn:
        protected = {name: conn.execute(text(f"SELECT * FROM {name}")).fetchall() for name in ("transcript_versions", "proofreading_runs", "proofreading_suggestions")}
    run_migrations(engine, factory)
    run_migrations(engine, factory)
    assert {'translation_runs', 'translation_batches', 'translation_versions'} <= set(inspect(engine).get_table_names())
    with factory() as db:
        assert db.get(TranscriptionTask, 'original').text == '原文'
        assert db.query(SchemaMigration).filter_by(version='20260906_001_subtitle_translation').count() == 1
    with engine.connect() as conn:
        for name, rows in protected.items():
            assert conn.execute(text(f"SELECT * FROM {name}")).fetchall() == rows
    indexes = inspect(engine).get_indexes('translation_runs')
    assert any(i['unique'] and i['column_names'] == ['task_id'] for i in indexes)
    engine.dispose()


def test_translation_migration_recovers_partial_table_creation(tmp_path):
    from backend.database.models import Base
    from backend.database.migrations import run_migrations

    engine = create_engine(f"sqlite:///{tmp_path / 'partial.db'}")
    tables = [t for n, t in Base.metadata.tables.items() if n not in {'translation_batches', 'translation_versions'}]
    Base.metadata.create_all(engine, tables=tables)
    with engine.begin() as conn:
        conn.execute(text("DROP INDEX uq_translation_runs_active_task"))
    run_migrations(engine, sessionmaker(bind=engine))
    assert any(i["name"] == "uq_translation_runs_active_task" for i in inspect(engine).get_indexes("translation_runs"))
    assert 'translation_versions' in inspect(engine).get_table_names()
    engine.dispose()


def test_translation_language_choices_preserve_scripts_and_custom_names():
    from backend.models import TranslationCreateRequest

    common = {'provider_id': 'p', 'source_version_id': 1}
    request = TranslationCreateRequest(**common, source_language={'kind': 'preset', 'code': 'zh-Hant'}, target_language={'kind': 'preset', 'code': 'zh-Hans'})
    assert request.source_language.code == 'zh-Hant'
    assert request.target_language.code == 'zh-Hans'
    custom = TranslationCreateRequest(**common, source_language={'kind': 'auto'}, target_language={'kind': 'custom', 'name': '  Esperanto  '})
    assert custom.target_language.name == 'Esperanto'
    assert TranslationCreateRequest(**common, source_language={'kind': 'auto'}, target_language={'kind': 'custom', 'name': '𠮷' * 80})


@pytest.mark.parametrize('source,target', [
    ({'kind': 'auto'}, {'kind': 'auto'}),
    ({'kind': 'preset', 'code': 'ja'}, {'kind': 'preset', 'code': 'ja'}),
    ({'kind': 'auto'}, {'kind': 'preset', 'code': 'invalid'}),
    ({'kind': 'auto'}, {'kind': 'custom', 'name': ' '}),
    ({'kind': 'auto'}, {'kind': 'custom', 'name': 'a\nb'}),
    ({'kind': 'auto'}, {'kind': 'custom', 'name': '𠮷' * 81}),
    ({'kind': 'custom', 'name': ' Esperanto '}, {'kind': 'custom', 'name': 'esperanto'}),
])
def test_invalid_language_choices_are_rejected(source, target):
    from backend.models import TranslationCreateRequest

    with pytest.raises(ValidationError):
        TranslationCreateRequest(provider_id='p', source_version_id=1, source_language=source, target_language=target)
