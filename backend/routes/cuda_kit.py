from __future__ import annotations

from fastapi import APIRouter, HTTPException
from starlette.concurrency import run_in_threadpool

from backend.models import CudaAccelerationStatusResponse, CudaAccelerationUpdate, CudaKitJobResponse
from backend.services import cuda_kit as cuda_kit_service
from backend.services.errors import ASRboxError

router = APIRouter(prefix="/settings/cuda-acceleration", tags=["settings"])


@router.get("", response_model=CudaAccelerationStatusResponse)
async def get_cuda_acceleration():
    return CudaAccelerationStatusResponse(**cuda_kit_service.acceleration_status())


@router.put("", response_model=CudaAccelerationStatusResponse)
async def update_cuda_acceleration(payload: CudaAccelerationUpdate):
    try:
        return CudaAccelerationStatusResponse(**cuda_kit_service.set_enabled(payload.enabled))
    except ASRboxError as exc:
        raise HTTPException(status_code=400, detail={"error_code": exc.code, "message": exc.message}) from exc


@router.post("/download", response_model=CudaKitJobResponse, status_code=202)
async def start_cuda_kit_download():
    try:
        return CudaKitJobResponse(**cuda_kit_service.start_download())
    except ASRboxError as exc:
        raise HTTPException(status_code=400, detail={"error_code": exc.code, "message": exc.message}) from exc


@router.get("/download", response_model=CudaKitJobResponse)
async def get_cuda_kit_download():
    return CudaKitJobResponse(**cuda_kit_service.current_job())


@router.post("/download/cancel", response_model=CudaKitJobResponse)
async def cancel_cuda_kit_download():
    return CudaKitJobResponse(**cuda_kit_service.cancel_download())


@router.delete("/kit", response_model=CudaAccelerationStatusResponse)
async def delete_cuda_kit():
    return CudaAccelerationStatusResponse(**await run_in_threadpool(cuda_kit_service.delete_kit))
