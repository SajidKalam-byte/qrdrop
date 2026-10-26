import io
import zipfile

from test_uploads import upload


def drop_folder(client, files):
    for rel, data in files.items():
        upload(client, rel.rsplit("/", 1)[-1], data, rel)


def test_folder_collapses_to_one_entry(host):
    drop_folder(host, {"proj/a.txt": b"A", "proj/sub/b.txt": b"BB", "proj/sub/deep/c.txt": b"CCC"})
    upload(host, "loose.txt", b"x")
    items = {i["id"]: i for i in host.get("/api/items").json()}
    folder = items["folder:proj"]
    assert folder["type"] == "folder" and folder["count"] == 3 and folder["size"] == 6
    assert "loose.txt" in [i["name"] for i in items.values()]
    assert len(items) == 2


def test_folder_zip_contents_match(host):
    files = {"proj/a.txt": b"A" * 5000, "proj/sub/b.bin": bytes(range(256)) * 100}
    drop_folder(host, files)
    r = host.get("/api/items/folder:proj/download")
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        assert z.testzip() is None
        assert {n: z.read(n) for n in z.namelist()} == files


def test_delete_folder_removes_files(host, core):
    drop_folder(host, {"proj/a.txt": b"A", "proj/b.txt": b"B"})
    assert (core.session.dir / "proj" / "a.txt").exists()
    assert host.delete("/api/items/folder:proj").status_code == 204
    assert host.get("/api/items").json() == []
    assert not (core.session.dir / "proj").exists()


def _upload_mime(client, name, data, mime):
    r = client.post("/api/uploads", json={"name": name, "size": len(data), "mime": mime})
    uid = r.json()["upload_id"]
    client.put(f"/api/uploads/{uid}", content=data)
    return uid


def test_inline_preview_only_for_safe_types(host):
    png = _upload_mime(host, "a.png", b"\x89PNG....", "image/png")
    pdf = _upload_mime(host, "doc.pdf", b"%PDF-1.4", None)  # type guessed from the name
    html = _upload_mime(host, "x.html", b"<script>alert(1)</script>", "text/html")
    svg = _upload_mime(host, "x.svg", b"<svg onload=alert(1)/>", "image/svg+xml")

    r = host.get(f"/api/items/{png}/download?inline=1")
    assert r.headers["content-disposition"].startswith("inline") and r.headers["content-type"] == "image/png"
    assert r.headers["x-content-type-options"] == "nosniff"
    assert host.get(f"/api/items/{pdf}/download?inline=1").headers["content-type"] == "application/pdf"
    for unsafe in (html, svg):  # forced to download, never rendered on our origin
        assert host.get(f"/api/items/{unsafe}/download?inline=1").headers["content-disposition"].startswith("attachment")
    assert {i["id"]: i.get("preview") for i in host.get("/api/items").json()}[html] is None


def test_range_download(host):
    uid, _ = upload(host, "r.bin", bytes(range(100)))
    r = host.get(f"/api/items/{uid}/download", headers={"Range": "bytes=10-19"})
    assert r.status_code == 206 and r.content == bytes(range(10, 20))
