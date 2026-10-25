from __future__ import annotations

import os
import socket
import subprocess
import sys
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from .. import __version__, qr
from ..auth import get_core, require_auth, require_host

router = APIRouter(prefix="/api")


@router.get("/info")
async def info(request: Request, role: str = Depends(require_auth)):
    core = get_core(request)
    data = {
        "version": __version__,
        "session_id": core.session.id,
        "role": role,
        "hostname": socket.gethostname(),
        "remote_seen": core.remote_seen,
        "uptime": round(time.time() - core.started, 1),
    }
    if role == "host":
        data.update(
            pair_url=core.pair_url,
            pair_expires_at=core.tokens.pair_expires_at,
            alt_urls=core.alt_urls,
            storage_dir=str(core.session.dir),
            port=core.cfg.port,
        )
    return data


def _open_in_file_manager(path: str) -> None:
    if sys.platform.startswith("win"):
        os.startfile(path)  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", path])
    else:
        subprocess.Popen(["xdg-open", path])


@router.post("/open-folder", status_code=204, dependencies=[Depends(require_host)])
async def open_folder(request: Request):
    """Open the session's save folder in Explorer/Finder on the host computer."""
    session = get_core(request).session
    session.dir.mkdir(parents=True, exist_ok=True)
    try:
        _open_in_file_manager(str(session.dir))
    except OSError as exc:
        raise HTTPException(500, f"Could not open the folder: {exc}")
    return Response(status_code=204)


@router.get("/qr.svg", dependencies=[Depends(require_host)])
async def qr_svg(request: Request):
    url = get_core(request).pair_url
    if not url:
        return Response(status_code=404)
    return Response(qr.render_svg(url), media_type="image/svg+xml", headers={"Cache-Control": "no-store"})
