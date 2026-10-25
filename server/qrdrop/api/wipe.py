from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response

from ..auth import get_core, require_host

router = APIRouter(prefix="/api", dependencies=[Depends(require_host)])


@router.post("/wipe", status_code=204)
async def wipe(request: Request):
    core = get_core(request)
    await core.wipe()
    core.log("session wiped")
    return Response(status_code=204)
