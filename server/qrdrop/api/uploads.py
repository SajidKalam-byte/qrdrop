from __future__ import annotations

import os
import time

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.requests import ClientDisconnect

from .. import storage
from ..auth import get_core, is_loopback, require_auth

router = APIRouter(prefix="/api/uploads", dependencies=[Depends(require_auth)])

PROGRESS_INTERVAL = 0.5


class UploadIn(BaseModel):
    name: str = Field(min_length=1, max_length=1024)
    size: int | None = Field(default=None, ge=0)
    relative_path: str | None = Field(default=None, max_length=4096)
    mime: str | None = Field(default=None, max_length=255)


@router.post("", status_code=201)
async def create_upload(body: UploadIn, request: Request):
    core = get_core(request)
    source = "desktop" if is_loopback(request) else "phone"
    try:
        item = core.session.add_file(body.name, body.size, body.relative_path, body.mime, source)
    except storage.UnsafePath as exc:
        raise HTTPException(400, str(exc))
    await core.publish(core.session.entity_id(item))
    return {"upload_id": item["id"], "item": core.session.entity_view(core.session.entity_id(item))}


@router.put("/{upload_id}")
async def stream_upload(upload_id: str, request: Request):
    """Body is streamed straight to disk; memory stays flat regardless of file size."""
    core = get_core(request)
    session = core.session
    item = session.items.get(upload_id)
    if item is None or item["type"] != "file":
        raise HTTPException(404, "Unknown upload")
    if item["status"] != "uploading":
        raise HTTPException(409, "Upload already finished")
    eid = session.entity_id(item)
    path = session.path_of(item)
    declared = item["size"] or None
    received, last = 0, time.monotonic()
    ok = False
    try:
        async with aiofiles.open(path, "wb") as f:
            async for chunk in request.stream():
                received += len(chunk)
                if declared is not None and received > declared:
                    raise HTTPException(413, "More data than declared")
                await f.write(chunk)
                item["received"] = received
                if time.monotonic() - last >= PROGRESS_INTERVAL:
                    last = time.monotonic()
                    await core.publish(eid)
        ok = declared is None or received == declared
        if not ok:
            raise HTTPException(400, "Upload ended early")
    except ClientDisconnect:
        raise HTTPException(499, "Client disconnected")
    finally:
        if not ok:  # failed or aborted: leave nothing half-written behind
            session.items.pop(upload_id, None)
            try:
                os.remove(path)
            except OSError:
                pass
            await core.publish(eid)
    item.update(size=received, received=received, status="complete")
    await core.publish(eid)
    return {"item": session.entity_view(eid)}
