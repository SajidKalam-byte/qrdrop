from qrdrop.auth import TokenStore


def test_pair_token_single_use_and_ttl():
    now = [1000.0]
    ts = TokenStore(120, 7200, clock=lambda: now[0])
    tok = ts.pair_token
    assert ts.consume_pair(tok) is True
    assert ts.consume_pair(tok) is False  # reuse

    tok2 = ts.rotate_pair()
    now[0] += 121
    assert ts.pair_expired()
    assert ts.consume_pair(tok2) is False  # expired


def test_bearer_expiry_and_revoke():
    now = [0.0]
    ts = TokenStore(120, 100, clock=lambda: now[0])
    b, _ = ts.issue_bearer()
    assert ts.check_bearer(b)
    now[0] = 101
    assert not ts.check_bearer(b)
    b2, _ = ts.issue_bearer()
    ts.revoke_all()
    assert not ts.check_bearer(b2)


def test_pair_flow_over_http(phone, core):
    tok = core.tokens.pair_token
    r = phone.get(f"/s/{tok}")
    assert r.status_code == 200
    body = r.json()
    assert body["bearer"] and body["session_id"] == core.session.id
    assert phone.get(f"/s/{tok}").status_code == 401  # QR is single use
    assert core.tokens.pair_token != tok  # and a fresh one is ready


def test_camera_app_gets_cookie_and_page(phone, core):
    r = phone.get(f"/s/{core.tokens.pair_token}", headers={"accept": "text/html"}, follow_redirects=False)
    assert r.status_code == 303 and "qrdrop_bearer" in r.headers["set-cookie"]
    assert phone.get("/api/items").status_code == 200  # cookie works for the API
    assert phone.get("/").status_code == 200


def test_phone_without_token_is_403_and_bad_token_401(phone):
    assert phone.get("/api/items").status_code == 403
    assert phone.get("/").status_code == 403
    assert phone.get("/api/items", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_host_needs_no_token(host):
    assert host.get("/api/items").status_code == 200
    assert host.get("/").status_code == 200


def test_guest_cannot_see_pair_url_or_wipe(paired, host):
    info = paired.get("/api/info").json()
    assert info["role"] == "guest" and "pair_url" not in info
    assert paired.get("/api/qr.svg").status_code == 403
    assert paired.post("/api/wipe").status_code == 403
    assert "pair_url" in host.get("/api/info").json()


def test_cross_site_and_rebinding_blocked(host):
    assert host.post("/api/wipe", headers={"origin": "https://evil.example"}).status_code == 403
    assert host.get("/api/items", headers={"host": "evil.example.com"}).status_code == 403
    assert host.get("/api/items", headers={"origin": "http://localhost:8765"}).status_code == 200


def test_qr_rotates_on_expiry_loop_condition(core):
    core.tokens._clock = lambda: core.tokens.pair_expires_at + 1
    assert core.tokens.pair_expired()
