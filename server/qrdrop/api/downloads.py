from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse
from starlette.concurrency import iterate_in_threadpool

from .. import storage
from ..auth import get_core, require_auth
from ..sessions import FOLDER_PREFIX

router = APIRouter(prefix="/api/items", dependencies=[Depends(require_auth)])


def _disposition(name: str) -> str:
    return f"attachment; filename*=UTF-8''{quote(name)}"


@router.get("/{item_id}/download")
async def download(item_id: str, request: Request):
    session = get_core(request).session

    if item_id.startswith(FOLDER_PREFIX):
        name = item_id[len(FOLDER_PREFIX):]
        files = session.folder_files(name)
        if not files:
            raise HTTPException(404, "No such folder")
        return StreamingResponse(
            iterate_in_threadpool(storage.zip_stream(files)),
            media_type="application/zip",
            headers={"Content-Disposition": _disposition(f"{name}.zip")},
        )

    item = session.items.get(item_id)
    if item is None or item.get("folder"):
        raise HTTPException(404, "No such item")
    if item["type"] == "text":
        return PlainTextResponse(item["body"], headers={"Content-Disposition": _disposition("text.txt")})
    if item["status"] != "complete":
        raise HTTPException(409, "Still uploading")
    return FileResponse(session.path_of(item), filename=item["name"], media_type=item.get("mime") or None)
