from __future__ import annotations

import asyncio
import shutil
from contextlib import asynccontextmanager
from typing import Callable

from fastapi import FastAPI, WebSocket
from fastapi.responses import FileResponse, HTMLResponse
from starlette.requests import Request

from . import __version__, network
from .api import downloads, info, items, pair, text, uploads, wipe
from .auth import COOKIE, RemoteSeenMiddleware, host_ok, is_loopback
from .config import Config
from .core import Core
from .network import NetworkInfo
from .ws import ws_endpoint

DENIED_PAGE = """<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<title>qrdrop</title><body style="font-family:system-ui;background:#0f1115;color:#e7e9ee;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center;padding:24px"><h1>Scan the QR code</h1>
<p style="color:#9aa3b2">Open qrdrop on the computer, then scan the QR code it shows with the qrdrop app or your phone camera.</p></div>"""


async def _pair_expiry_loop(core: Core) -> None:
    while True:
        await asyncio.sleep(1)
        if core.tokens.pair_expired():
            await core.rotate_pair()


def create_app(cfg: Config | None = None, net: NetworkInfo | None = None, on_ready: Callable[[Core], None] | None = None) -> FastAPI:
    cfg = cfg or Config.from_env()
    core = Core(cfg, net)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        tasks = [asyncio.create_task(network.watch(core)), asyncio.create_task(_pair_expiry_loop(core))]
        if on_ready:
            on_ready(core)
        yield
        for t in tasks:
            t.cancel()
        if cfg.wipe_on_exit:
            shutil.rmtree(core.session.dir, ignore_errors=True)

    app = FastAPI(title="qrdrop", version=__version__, lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.core = core
    app.add_middleware(RemoteSeenMiddleware, core_ref=lambda: core)

    for module in (pair, info, uploads, text, items, downloads, wipe):
        app.include_router(module.router)
    app.add_api_websocket_route("/ws", ws_endpoint)

    def page_allowed(request: Request) -> bool:
        if not host_ok(request):
            return False
        if is_loopback(request):
            return True
        cookie = request.cookies.get(COOKIE)
        return bool(cookie) and core.tokens.check_bearer(cookie)

    @app.get("/", include_in_schema=False)
    async def index(request: Request):
        if not page_allowed(request):
            return HTMLResponse(DENIED_PAGE, status_code=403)
        return FileResponse(cfg.static_dir / "index.html", headers={"Cache-Control": "no-store"})

    @app.get("/static/{name}", include_in_schema=False)
    async def static_file(name: str, request: Request):
        path = (cfg.static_dir / name).resolve()
        if not page_allowed(request):
            return HTMLResponse(DENIED_PAGE, status_code=403)
        if not path.is_file() or not path.is_relative_to(cfg.static_dir.resolve()):
            return HTMLResponse("Not found", status_code=404)
        return FileResponse(path, headers={"Cache-Control": "no-store"})

    return app
