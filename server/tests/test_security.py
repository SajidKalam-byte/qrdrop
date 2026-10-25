import time

from test_uploads import upload


def test_wipe_revokes_everything(host, paired, core):
    upload(paired, "a.txt", b"data")
    old_dir = core.session.dir
    assert old_dir.exists() and any(old_dir.iterdir())
    assert host.post("/api/wipe").status_code == 204
    assert not old_dir.exists()
    assert paired.get("/api/items").status_code == 401  # old bearer is dead
    assert host.get("/api/items").json() == []
    assert core.session.dir != old_dir


def test_expired_qr_is_401(phone, core):
    core.tokens._clock = lambda: time.time() + 3 * 60
    assert phone.get(f"/s/{core.tokens.pair_token}").status_code == 401


def test_websocket_requires_auth_and_streams_events(host, phone):
    from starlette.websockets import WebSocketDisconnect
    import pytest

    with pytest.raises(WebSocketDisconnect):
        with phone.websocket_connect("/ws"):
            pass

    with host as c, c.websocket_connect("/ws") as ws:
        assert ws.receive_json()["type"] == "snapshot"
        c.post("/api/text", json={"body": "hi there"})
        msg = ws.receive_json()
        assert msg["type"] == "text_added" and msg["item"]["body"] == "hi there"
        uid, _ = upload(c, "f.txt", b"abc")
        types = []
        for _ in range(2):
            types.append(ws.receive_json()["type"])
        assert types == ["item_added", "item_updated"]
        c.delete(f"/api/items/{msg['item']['id']}")
        assert ws.receive_json() == {"type": "item_removed", "id": msg["item"]["id"]}


def test_open_folder_is_host_only(host, paired, monkeypatch):
    from qrdrop.api import info

    opened = []
    monkeypatch.setattr(info, "_open_in_file_manager", opened.append)
    assert paired.post("/api/open-folder").status_code == 403
    assert opened == []
    assert host.post("/api/open-folder").status_code == 204
    assert len(opened) == 1


def test_remote_seen_flag(phone, host, core):
    assert core.remote_seen is False
    host.get("/api/info")
    assert core.remote_seen is False
    phone.get("/api/info")  # even a 403 proves the phone can reach us
    assert core.remote_seen is True
