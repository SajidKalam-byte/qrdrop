from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from ..auth import get_core, is_loopback, require_auth
from ..sessions import MAX_TEXT

router = APIRouter(prefix="/api", dependencies=[Depends(require_auth)])


class TextIn(BaseModel):
    body: str


@router.post("/text", status_code=201)
async def add_text(payload: TextIn, request: Request):
    if not payload.body.strip():
        raise HTTPException(400, "Empty text")
    if len(payload.body) > MAX_TEXT:
        raise HTTPException(413, "Text too large; send it as a file instead")
    core = get_core(request)
    item = core.session.add_text(payload.body, "desktop" if is_loopback(request) else "phone")
    await core.publish(item["id"])
    return {"item": core.session.entity_view(item["id"])}
