from __future__ import annotations

import asyncio

from fastapi import WebSocket, WebSocketDisconnect

from .auth import identify


class Hub:
    def __init__(self) -> None:
        self._conns: dict[WebSocket, str] = {}

    def add(self, ws: WebSocket, role: str) -> None:
        self._conns[ws] = role

    def remove(self, ws: WebSocket) -> None:
        self._conns.pop(ws, None)

    @property
    def count(self) -> int:
        return len(self._conns)

    async def _send(self, ws: WebSocket, msg: dict) -> None:
        try:
            await asyncio.wait_for(ws.send_json(msg), timeout=3)
        except Exception:
            self._conns.pop(ws, None)  # dead or too slow: drop it, never stall an upload

    async def broadcast(self, msg: dict) -> None:
        if self._conns:
            await asyncio.gather(*(self._send(ws, msg) for ws in list(self._conns)))

    async def close_all(self, code: int = 4000) -> None:
        conns, self._conns = list(self._conns), {}
        for ws in conns:
            try:
                await ws.close(code=code)
            except Exception:
                pass


async def ws_endpoint(ws: WebSocket) -> None:
    core = ws.app.state.core
    role, _ = identify(ws)
    if role is None:
        await ws.close(code=4401)
        return
    await ws.accept()
    core.hub.add(ws, role)
    try:
        await ws.send_json({"type": "snapshot", "items": core.session.list_view(), "session_id": core.session.id})
        while True:
            if await ws.receive_text() == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        core.hub.remove(ws)
