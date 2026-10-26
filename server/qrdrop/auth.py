"""Pair-code / bearer tokens and request authentication.

Trust model: the loopback browser is the `host`; everything else must present a bearer
(header, `?token=`, or the cookie set by a system-camera QR scan) and is a `guest`.
"""
from __future__ import annotations

import hmac
import ipaddress
import secrets
import time
from typing import TYPE_CHECKING, Callable
from urllib.parse import urlsplit

from fastapi import Depends, HTTPException
from starlette.requests import HTTPConnection

if TYPE_CHECKING:
    from .core import Core

COOKIE = "qrdrop_bearer"
LOOPBACK = {"127.0.0.1", "::1", "::ffff:127.0.0.1"}


class TokenStore:
    def __init__(self, pair_ttl: int, session_ttl: int, clock: Callable[[], float] = time.time) -> None:
        self.pair_ttl = pair_ttl
        self.session_ttl = session_ttl
        self._clock = clock
        self.pair_token = ""
        self.pair_code = ""  # short 6-digit twin of the token, for typing when the camera can't scan
        self.pair_expires_at = 0.0
        self._fails = 0
        self._bearers: dict[str, float] = {}
        self.rotate_pair()

    def rotate_pair(self) -> str:
        self.pair_token = secrets.token_urlsafe(16)
        self.pair_code = f"{secrets.randbelow(1_000_000):06d}"
        self.pair_expires_at = self._clock() + self.pair_ttl
        self._fails = 0
        return self.pair_token

    def pair_expired(self) -> bool:
        return self._clock() >= self.pair_expires_at

    def consume_pair(self, token: str) -> bool:
        """Single use: a successful check invalidates both forms immediately.

        Five wrong guesses rotate the pair code, so the 6-digit form can't be brute-forced.
        """
        live = bool(self.pair_token) and not self.pair_expired()
        by_token = hmac.compare_digest(token, self.pair_token)
        by_code = hmac.compare_digest(token, self.pair_code)
        ok = live and (by_token or by_code)
        if ok:
            self.pair_token = self.pair_code = ""
        else:
            self._fails += 1
            if self._fails >= 5:
                self.rotate_pair()
        return ok

    def issue_bearer(self) -> tuple[str, float]:
        token = secrets.token_urlsafe(32)
        expires = self._clock() + self.session_ttl
        self._bearers[token] = expires
        return token, expires

    def check_bearer(self, token: str) -> bool:
        now = self._clock()
        for t in [t for t, exp in self._bearers.items() if exp <= now]:
            del self._bearers[t]
        # compare against every stored token so timing doesn't reveal a prefix match
        return any([hmac.compare_digest(token, t) for t in self._bearers])

    def revoke(self, token: str) -> None:
        for t in [t for t in self._bearers if hmac.compare_digest(token, t)]:
            del self._bearers[t]

    def revoke_all(self) -> None:
        self._bearers.clear()


# --- request checks ---------------------------------------------------------------------------
def is_loopback(conn: HTTPConnection) -> bool:
    return bool(conn.client) and conn.client.host in LOOPBACK


def host_ok(conn: HTTPConnection) -> bool:
    """Reject DNS-rebinding: Host must be an IP literal, localhost, *.local or a bare hostname."""
    header = conn.headers.get("host")
    if not header:
        return False
    hostname = urlsplit("//" + header).hostname or ""
    if not hostname:
        return False
    try:
        ipaddress.ip_address(hostname)
        return True
    except ValueError:
        return hostname == "localhost" or hostname.endswith(".local") or "." not in hostname


def origin_ok(conn: HTTPConnection) -> bool:
    """Browsers always send Origin on cross-site writes; it must match our own Host."""
    origin = conn.headers.get("origin")
    if origin is None:
        return True
    return origin != "null" and urlsplit(origin).netloc == conn.headers.get("host")


def token_from(conn: HTTPConnection) -> str | None:
    header = conn.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip() or None
    return conn.query_params.get("token") or conn.cookies.get(COOKIE)


def identify(conn: HTTPConnection) -> tuple[str | None, int]:
    """Returns (role, http_status_if_denied). role is 'host', 'guest' or None."""
    core: Core = conn.app.state.core
    if not host_ok(conn) or not origin_ok(conn):
        return None, 403
    if is_loopback(conn):
        return "host", 200
    token = token_from(conn)
    if not token:
        return None, 403
    if core.tokens.check_bearer(token):
        return "guest", 200
    return None, 401


async def require_auth(conn: HTTPConnection) -> str:
    role, status = identify(conn)
    if role is None:
        raise HTTPException(status, "Scan the QR code on the host computer to connect." if status == 403 else "Session expired - scan the QR code again.")
    return role


async def require_host(role: str = Depends(require_auth)) -> str:
    if role != "host":
        raise HTTPException(403, "Only the host computer can do this.")
    return role


def get_core(conn: HTTPConnection) -> "Core":
    return conn.app.state.core


class RemoteSeenMiddleware:
    """Pure-ASGI (no body buffering): remember that some non-loopback device reached us."""

    def __init__(self, app, core_ref: Callable[[], "Core"]) -> None:
        self.app = app
        self._core_ref = core_ref

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket") and scope.get("client"):
            if scope["client"][0] not in LOOPBACK:
                self._core_ref().remote_seen = True
        await self.app(scope, receive, send)
