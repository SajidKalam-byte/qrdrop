"""Shared server state, hung off `app.state.core`."""
from __future__ import annotations

import time

from .auth import TokenStore
from .config import Config
from .network import NetworkInfo, detect
from .sessions import Session
from .ws import Hub


class Core:
    def __init__(self, cfg: Config, net: NetworkInfo | None = None) -> None:
        self.cfg = cfg
        self.session = Session(cfg.storage)
        self.tokens = TokenStore(cfg.pair_ttl, cfg.session_ttl)
        self.hub = Hub()
        self.net = net if net is not None else detect()
        self.started = time.time()
        self.remote_seen = False
        self._announced: set[str] = set()

    def log(self, msg: str) -> None:
        print(f"[qrdrop] {msg}", flush=True)

    # --- pairing ---------------------------------------------------------------------------
    @property
    def pair_url(self) -> str | None:
        if not self.net.primary:
            return None
        return f"http://{self.net.primary}:{self.cfg.port}/s/{self.tokens.pair_token}"

    @property
    def alt_urls(self) -> list[str]:
        return [f"http://{ip}:{self.cfg.port}/" for ip in self.net.alternates]

    async def rotate_pair(self) -> None:
        self.tokens.rotate_pair()
        await self.hub.broadcast({"type": "qr_rotated"})

    async def wipe(self) -> None:
        self.session.wipe()
        self._announced.clear()
        self.tokens.revoke_all()
        await self.hub.broadcast({"type": "wiped"})
        await self.hub.close_all()
        await self.rotate_pair()

    # --- change feed -----------------------------------------------------------------------
    async def publish(self, eid: str) -> None:
        """Broadcast the current state of one list entry (a file, text, or a whole folder)."""
        view = self.session.entity_view(eid)
        if view is None:
            if eid in self._announced:
                self._announced.discard(eid)
                await self.hub.broadcast({"type": "item_removed", "id": eid})
        elif eid not in self._announced:
            self._announced.add(eid)
            kind = "text_added" if view["type"] == "text" else "item_added"
            await self.hub.broadcast({"type": kind, "item": view})
        else:
            await self.hub.broadcast({"type": "item_updated", "item": view})
