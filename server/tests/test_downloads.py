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


def test_range_download(host):
    uid, _ = upload(host, "r.bin", bytes(range(100)))
    r = host.get(f"/api/items/{uid}/download", headers={"Range": "bytes=10-19"})
    assert r.status_code == 206 and r.content == bytes(range(10, 20))
