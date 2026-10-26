from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from ..auth import COOKIE, get_core, host_ok

router = APIRouter()


@router.get("/s/{pair_token}")
async def pair(pair_token: str, request: Request):
    core = get_core(request)
    if not host_ok(request):
        raise HTTPException(403, "Bad Host header")
    before = core.tokens.pair_token
    if not core.tokens.consume_pair(pair_token):
        if core.tokens.pair_token != before:  # too many wrong guesses -> code was rotated; refresh the host page
            await core.hub.broadcast({"type": "qr_rotated"})
        raise HTTPException(401, "This QR code expired or was already used. Use the fresh one on the computer.")
    bearer, expires_at = core.tokens.issue_bearer()
    await core.rotate_pair()  # next phone gets a fresh QR; the old one is dead anyway
    core.log("device paired")

    if "text/html" in request.headers.get("accept", ""):  # phone camera app opened the link in a browser
        resp = RedirectResponse("/", status_code=303)
        resp.set_cookie(COOKIE, bearer, max_age=core.cfg.session_ttl, httponly=True, samesite="lax")  # lax: strict cookies are dropped when the link was opened from Lens/another app
        return resp
    return {"bearer": bearer, "session_id": core.session.id, "expires_at": expires_at}
