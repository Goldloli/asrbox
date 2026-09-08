"""Sync route handlers run in FastAPI's thread pool, including reads and exports."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import (
    TranslationCreateRequest, TranslationEditRequest, TranslationRunListResponse,
    TranslationRunResponse, TranslationVersionListResponse, TranslationVersionResponse,
)
from backend.services import llm_providers, translation
from backend.services.translation_exports import export_version

router = APIRouter(prefix='/tasks/{task_id}/translation-runs', tags=['translation'])


def call(operation, *args):
    try:
        return operation(*args)
    except (translation.TranslationError, llm_providers.LLMProviderError) as exc:
        status = 404 if exc.code.endswith('_NOT_FOUND') else 409 if exc.code in {
            'TRANSLATION_RUN_ACTIVE', 'TRANSLATION_NOT_RETRYABLE', 'TRANSLATION_NOT_CANCELLABLE', 'TRANSLATION_VERSION_CONFLICT',
            'TRANSLATION_TASK_NOT_READY', 'TRANSLATION_PROVIDER_CHANGED',
        } else 400
        raise HTTPException(status, detail={'code': exc.code, 'message': exc.message}) from exc
    except ValueError as exc:
        raise HTTPException(400, detail={'code': 'TRANSLATION_INVALID', 'message': 'Invalid translation configuration'}) from exc


@router.post('', response_model=TranslationRunResponse)
def create_run(task_id: str, payload: TranslationCreateRequest, db: Session = Depends(get_db)):
    return call(translation.create_run, db, task_id, payload)


@router.get('', response_model=TranslationRunListResponse)
def list_runs(task_id: str, db: Session = Depends(get_db)):
    return {'items': call(translation.list_runs, db, task_id)}


@router.get('/{run_id}', response_model=TranslationRunResponse)
def get_run(task_id: str, run_id: str, db: Session = Depends(get_db)):
    return call(translation.to_response, db, call(translation.get_run, db, task_id, run_id))


@router.post('/{run_id}/cancel', response_model=TranslationRunResponse)
def cancel_run(task_id: str, run_id: str, db: Session = Depends(get_db)):
    return call(translation.cancel_run, db, task_id, run_id)


@router.post('/{run_id}/retry', response_model=TranslationRunResponse)
def retry_run(task_id: str, run_id: str, db: Session = Depends(get_db)):
    return call(translation.retry_run, db, task_id, run_id)


@router.get('/{run_id}/versions', response_model=TranslationVersionListResponse)
def list_versions(task_id: str, run_id: str, db: Session = Depends(get_db)):
    return {'items': call(translation.list_versions, db, task_id, run_id)}


@router.post('/{run_id}/versions', response_model=TranslationVersionResponse)
def edit_version(task_id: str, run_id: str, payload: TranslationEditRequest, db: Session = Depends(get_db)):
    return call(translation.edit_version, db, task_id, run_id, payload)


@router.get('/{run_id}/versions/{version_id}', response_model=TranslationVersionResponse)
def get_version(task_id: str, run_id: str, version_id: int, db: Session = Depends(get_db)):
    return call(translation.get_version, db, task_id, run_id, version_id)


@router.get('/{run_id}/versions/{version_id}/export/{fmt}')
def export_translation(task_id: str, run_id: str, version_id: int, fmt: str,
                       mode: str = 'translated', order: str = 'source-first', db: Session = Depends(get_db)):
    content, media_type, filename = call(export_version, db, task_id, run_id, version_id, fmt, mode, order)
    return Response(content, media_type=media_type, headers={'Content-Disposition': f'attachment; filename="{filename}"', 'Access-Control-Expose-Headers': 'Content-Disposition'})
