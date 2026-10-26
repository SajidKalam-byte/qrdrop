from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from ..auth import COOKIE, get_core, host_ok, is_loopback, require_auth, token_from

router = APIRouter()


@router.post("/api/disconnect", status_code=204)
async def disconnect(request: Request, _: str = Depends(require_auth)):
    """A phone leaving: its bearer dies now (not in 2 h). Received files stay until the host wipes."""
    core = get_core(request)
    token = token_from(request)
    if token and not is_loopback(request):
        core.tokens.revoke(token)
        core.log("device disconnected")
    return Response(status_code=204)


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
