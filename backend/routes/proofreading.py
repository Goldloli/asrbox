from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import (
    ProofreadingApplyRequest,
    ProofreadingApplyResponse,
    ProofreadingCreateRequest,
    ProofreadingRunListResponse,
    ProofreadingRunResponse,
)
from backend.services import proofreading
from backend.services import tasks as task_service
from backend.services import versions as version_service

router = APIRouter(prefix="/tasks", tags=["proofreading"])


def _raise_proofreading_error(exc: proofreading.ProofreadingError) -> None:
    status = 409 if exc.code in {
        "PROOFREADING_RUN_ACTIVE",
        "PROOFREADING_STALE",
        "PROOFREADING_ALREADY_APPLIED",
        "PROOFREADING_NOT_APPLICABLE",
    } else 404 if exc.code in {
        "TASK_NOT_FOUND",
        "LLM_PROVIDER_NOT_FOUND",
        "PROOFREADING_RUN_NOT_FOUND",
    } else 400
    raise HTTPException(
        status_code=status,
        detail={"code": exc.code, "message": exc.message},
    ) from exc


@router.post("/{task_id}/proofreading-runs", response_model=ProofreadingRunResponse)
async def create_run(
    task_id: str,
    payload: ProofreadingCreateRequest,
    db: Session = Depends(get_db),
):
    try:
        run = proofreading.create_run(db, task_id, payload.provider_id)
    except proofreading.ProofreadingError as exc:
        _raise_proofreading_error(exc)
    return proofreading.to_response(db, run)


@router.get("/{task_id}/proofreading-runs", response_model=ProofreadingRunListResponse)
async def list_runs(task_id: str, db: Session = Depends(get_db)):
    if task_service.get_task_row(db, task_id) is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return ProofreadingRunListResponse(items=proofreading.list_runs(db, task_id))


@router.get("/{task_id}/proofreading-runs/{run_id}", response_model=ProofreadingRunResponse)
async def get_run(task_id: str, run_id: str, db: Session = Depends(get_db)):
    run = proofreading.get_run(db, task_id, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Proofreading run not found")
    return proofreading.to_response(db, run)


@router.post(
    "/{task_id}/proofreading-runs/{run_id}/apply",
    response_model=ProofreadingApplyResponse,
)
async def apply_run(
    task_id: str,
    run_id: str,
    payload: ProofreadingApplyRequest,
    db: Session = Depends(get_db),
):
    run = proofreading.get_run(db, task_id, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Proofreading run not found")
    try:
        version = proofreading.apply_suggestions(db, run.id, payload.suggestion_ids)
    except proofreading.ProofreadingError as exc:
        _raise_proofreading_error(exc)
    refreshed = proofreading.get_run(db, task_id, run_id)
    return ProofreadingApplyResponse(
        run=proofreading.to_response(db, refreshed),
        version=version_service.to_response(version),
    )
