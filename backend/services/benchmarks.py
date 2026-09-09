from __future__ import annotations

import time
from pathlib import Path

try:
    import resource
except ImportError:  # Windows 无 resource 模块
    resource = None

from sqlalchemy.orm import Session

from backend import config
from backend.backends.registry import get_model_config
from backend.database.models import ModelBenchmark
from backend.models import ModelBenchmarkRequest, ModelBenchmarkResponse, ModelRecommendationRequest
from backend.services import media
from backend.services import models as model_service
from backend.services.errors import ASRboxError
from backend.services import model_storage
from backend.services.transcribe import transcribe_with_local_model


def _to_response(row: ModelBenchmark) -> ModelBenchmarkResponse:
    return ModelBenchmarkResponse(
        id=row.id,
        model_name=row.model_name,
        engine=row.engine,
        language=row.language,
        audio_path=row.audio_path,
        duration_ms=row.duration_ms,
        wall_time_ms=row.wall_time_ms,
        realtime_factor=row.realtime_factor,
        peak_memory_mb=row.peak_memory_mb,
        text_length=row.text_length,
        segment_count=row.segment_count,
        success=bool(row.success),
        error_code=row.error_code,
        error=row.error,
        created_at=row.created_at,
    )


def list_benchmarks(db: Session) -> list[ModelBenchmarkResponse]:
    rows = db.query(ModelBenchmark).order_by(ModelBenchmark.created_at.desc()).all()
    return [_to_response(row) for row in rows]


def delete_benchmark(db: Session, benchmark_id: int) -> bool:
    row = db.query(ModelBenchmark).filter(ModelBenchmark.id == benchmark_id).first()
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True


def run_benchmark(db: Session, request: ModelBenchmarkRequest) -> list[ModelBenchmarkResponse]:
    with model_storage.model_operation("benchmark"):
        return _run_benchmark(db, request)


def _run_benchmark(db: Session, request: ModelBenchmarkRequest) -> list[ModelBenchmarkResponse]:
    if not request.audio_path:
        raise ValueError("audio_path is required for model benchmark")
    source_path = Path(request.audio_path).expanduser()
    if not source_path.exists():
        resolved = config.resolve_storage_path(request.audio_path)
        source_path = resolved if resolved else source_path
    if not source_path.exists():
        raise ValueError(f"Benchmark audio file not found: {request.audio_path}")

    normalized_path, metadata = media.prepare_media_for_asr(source_path)
    duration_ms = metadata.get("duration_ms")
    responses: list[ModelBenchmarkResponse] = []
    for model_name in request.model_names:
        model_config = get_model_config(model_name)
        engine = model_config.engine if model_config else "unknown"
        start = time.perf_counter()
        success = False
        error_code = None
        error = None
        text_length = 0
        segment_count = 0
        try:
            model_service.ensure_model_ready(model_name)
            result = transcribe_with_local_model(
                model_name,
                str(normalized_path),
                {"language": request.language, "vad": False, "word_timestamps": False},
            )
            text_length = len(result.text or "")
            segment_count = len(result.segments)
            success = True
        except ASRboxError as exc:
            error_code = exc.code
            error = exc.message
        except Exception as exc:
            error = str(exc)
        wall_time_ms = int((time.perf_counter() - start) * 1000)
        realtime_factor = None
        if duration_ms and wall_time_ms:
            realtime_factor = round((wall_time_ms / 1000) / (duration_ms / 1000), 3)
        if resource is not None:
            peak_memory_mb = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 2)
        else:
            peak_memory_mb = None
        row = ModelBenchmark(
            model_name=model_name,
            engine=engine,
            language=request.language,
            audio_path=str(source_path),
            duration_ms=duration_ms,
            wall_time_ms=wall_time_ms,
            realtime_factor=realtime_factor,
            peak_memory_mb=peak_memory_mb,
            text_length=text_length,
            segment_count=segment_count,
            success=success,
            error_code=error_code,
            error=error,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        responses.append(_to_response(row))
    return responses


def recommend_with_benchmarks(db: Session, request: ModelRecommendationRequest):
    base = model_service.recommend_model(request)
    candidates = [base.model_name]
    successful = (
        db.query(ModelBenchmark)
        .filter(ModelBenchmark.success.is_(True), ModelBenchmark.realtime_factor.isnot(None))
        .order_by(ModelBenchmark.realtime_factor.asc())
        .all()
    )
    for row in successful:
        config_row = get_model_config(row.model_name)
        if config_row and model_service.check_model_compatibility(row.model_name)["compatible"]:
            candidates.insert(0, row.model_name)
            break
    selected = candidates[0]
    if selected == base.model_name:
        return base
    config_row = get_model_config(selected)
    compatible = model_service.check_model_compatibility(selected)
    from backend.models import ModelRecommendationResponse

    return ModelRecommendationResponse(
        model_name=selected,
        display_name=config_row.display_name if config_row else selected,
        reason="Fastest compatible model from local benchmark history",
        downloaded=model_service.is_model_downloaded(selected),
        compatible=bool(compatible["compatible"]),
        download_required=not model_service.is_model_downloaded(selected),
    )
