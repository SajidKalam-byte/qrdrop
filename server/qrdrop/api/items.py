from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from ..auth import get_core, require_auth

router = APIRouter(prefix="/api/items", dependencies=[Depends(require_auth)])


@router.get("")
async def list_items(request: Request):
    return get_core(request).session.list_view()


@router.delete("/{item_id}", status_code=204)
async def delete_item(item_id: str, request: Request):
    core = get_core(request)
    if not core.session.remove(item_id):
        raise HTTPException(404, "No such item")
    await core.publish(item_id)
    return Response(status_code=204)
