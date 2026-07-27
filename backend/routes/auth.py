from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.models import ResourceTicketRequest, ResourceTicketResponse
from backend.services import resource_tickets

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/resource-ticket", response_model=ResourceTicketResponse)
async def create_resource_ticket(request: ResourceTicketRequest):
    try:
        grant = resource_tickets.issue(request.path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ResourceTicketResponse(
        ticket=grant.ticket,
        path=grant.path,
        expires_at=grant.expires_at,
    )
