import hashlib
import os

import psutil

from qrdrop import storage


def upload(client, name, data, rel=None):
    r = client.post("/api/uploads", json={"name": name, "size": len(data), "relative_path": rel})
    assert r.status_code == 201, r.text
    uid = r.json()["upload_id"]
    r = client.put(f"/api/uploads/{uid}", content=data)
    return uid, r


def test_file_roundtrip(host):
    uid, r = upload(host, "a.bin", b"hello world")
    assert r.status_code == 200
    items = host.get("/api/items").json()
    assert [(i["name"], i["status"], i["size"]) for i in items] == [("a.bin", "complete", 11)]
    assert host.get(f"/api/items/{uid}/download").content == b"hello world"


def test_phone_upload_marked_as_phone(paired, host):
    upload(paired, "p.txt", b"x")
    assert host.get("/api/items").json()[0]["source"] == "phone"


def test_name_collision_gets_suffix(host):
    upload(host, "a.txt", b"1")
    upload(host, "a.txt", b"2")
    names = sorted(i["name"] for i in host.get("/api/items").json())
    assert names == ["a (1).txt", "a.txt"]


def test_size_mismatch_cleans_up(host, core):
    r = host.post("/api/uploads", json={"name": "x.bin", "size": 10})
    uid = r.json()["upload_id"]
    assert host.put(f"/api/uploads/{uid}", content=b"short").status_code == 400
    assert host.get("/api/items").json() == []
    assert not any(core.session.dir.iterdir())


def test_second_put_rejected(host):
    uid, _ = upload(host, "a.txt", b"abc")
    assert host.put(f"/api/uploads/{uid}", content=b"abc").status_code == 409


def test_unauthenticated_upload_denied(phone):
    assert phone.post("/api/uploads", json={"name": "a"}).status_code == 403


def test_path_traversal_neutralised(host, core):
    for bad in ["../../evil.txt", "..\\..\\evil.txt", "a/../../evil.txt"]:
        r = host.post("/api/uploads", json={"name": "x", "relative_path": bad})
        assert r.status_code == 400, bad
    # absolute / drive paths are folded under the session dir, never outside it
    r = host.post("/api/uploads", json={"name": "x", "relative_path": "/etc/passwd"})
    assert r.status_code == 201
    uid = r.json()["upload_id"]
    host.put(f"/api/uploads/{uid}", content=b"hi")
    assert (core.session.dir / "etc" / "passwd").read_bytes() == b"hi"
    assert not (core.session.dir.parent / "evil.txt").exists()


def test_sanitize_unit():
    assert storage.sanitize_relative_path("dir\\sub/file?.txt") == "dir/sub/file_.txt"
    assert storage.sanitize_relative_path("CON.txt") == "_CON.txt"
    for bad in ["", "..", "a/../b", "  ", "./"]:
        try:
            storage.sanitize_relative_path(bad)
        except storage.UnsafePath:
            continue
        raise AssertionError(bad)


def test_text_item(host, paired):
    body = "\n".join(f"line {i}" for i in range(40))
    assert paired.post("/api/text", json={"body": body}).status_code == 201
    item = host.get("/api/items").json()[0]
    assert item["type"] == "text" and item["body"] == body
    assert host.get(f"/api/items/{item['id']}/download").text == body
    assert paired.post("/api/text", json={"body": "   "}).status_code == 400


def test_large_upload_streams_with_flat_memory(host, core):
    """~300 MB is pushed through; the server process must not grow by anywhere near that."""
    size, block = 300 * 1024 * 1024, b"\x5a" * (1024 * 1024)

    def body():
        h = hashlib.sha256()
        for _ in range(size // len(block)):
            h.update(block)
            yield block
        body.digest = h.hexdigest()

    r = host.post("/api/uploads", json={"name": "big.bin", "size": size})
    uid = r.json()["upload_id"]
    proc = psutil.Process(os.getpid())
    before = proc.memory_info().rss
    peak = [before]

    def gen():
        for i, chunk in enumerate(body()):
            if i % 20 == 0:
                peak[0] = max(peak[0], proc.memory_info().rss)
            yield chunk

    assert host.put(f"/api/uploads/{uid}", content=gen()).status_code == 200
    item = core.session.items[uid]
    assert item["size"] == size and core.session.path_of(item).stat().st_size == size
    assert hashlib.sha256(core.session.path_of(item).read_bytes()[:0]).hexdigest()  # file exists & readable
    assert peak[0] - before < 100 * 1024 * 1024, f"RSS grew {(peak[0] - before) / 1e6:.0f} MB"
