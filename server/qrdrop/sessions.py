"""In-memory item registry for the current session. Files live under `<storage>/<session_id>/`."""
from __future__ import annotations

import secrets
import shutil
import time
from pathlib import Path

from . import storage

FOLDER_PREFIX = "folder:"
MAX_TEXT = 1_000_000


class Session:
    def __init__(self, root: Path) -> None:
        self.root = root
        self._start()

    def _start(self) -> None:
        self.id = secrets.token_urlsafe(8)
        self.dir = (self.root / self.id).resolve()
        self.dir.mkdir(parents=True, exist_ok=True)
        self.items: dict[str, dict] = {}

    # --- mutation -------------------------------------------------------------------------
    def add_file(self, name: str, size: int | None, relative_path: str | None, mime: str | None, source: str) -> dict:
        _, rel = storage.reserve(self.dir, storage.sanitize_relative_path(relative_path or name))
        item = {
            "id": secrets.token_hex(6),
            "type": "file",
            "name": rel.rsplit("/", 1)[-1],
            "rel": rel,
            "folder": rel.split("/")[0] if "/" in rel else None,
            "size": size or 0,
            "received": 0,
            "status": "uploading",
            "mime": mime,
            "source": source,
            "created_at": time.time(),
        }
        self.items[item["id"]] = item
        return item

    def add_text(self, body: str, source: str) -> dict:
        first = next((ln.strip() for ln in body.splitlines() if ln.strip()), "")
        item = {
            "id": secrets.token_hex(6),
            "type": "text",
            "name": first[:80] or "(blank)",
            "body": body,
            "size": len(body.encode("utf-8")),
            "status": "complete",
            "source": source,
            "created_at": time.time(),
        }
        self.items[item["id"]] = item
        return item

    def path_of(self, item: dict) -> Path:
        return self.dir / item["rel"]

    def remove(self, eid: str) -> bool:
        if eid.startswith(FOLDER_PREFIX):
            name = eid[len(FOLDER_PREFIX):]
            members = [i for i in self.items.values() if i.get("folder") == name]
            if not members:
                return False
            for m in members:
                del self.items[m["id"]]
            shutil.rmtree(self.dir / name, ignore_errors=True)
            return True
        item = self.items.pop(eid, None)
        if item is None:
            return False
        if item["type"] == "file":
            self.path_of(item).unlink(missing_ok=True)
        return True

    def wipe(self) -> None:
        shutil.rmtree(self.dir, ignore_errors=True)
        self._start()

    # --- views ----------------------------------------------------------------------------
    @staticmethod
    def entity_id(item: dict) -> str:
        return f"{FOLDER_PREFIX}{item['folder']}" if item.get("folder") else item["id"]

    def entity_view(self, eid: str) -> dict | None:
        if eid.startswith(FOLDER_PREFIX):
            name = eid[len(FOLDER_PREFIX):]
            members = [i for i in self.items.values() if i.get("folder") == name]
            if not members:
                return None
            return {
                "id": eid,
                "type": "folder",
                "name": name,
                "count": len(members),
                "size": sum(m["size"] for m in members),
                "received": sum(m["received"] for m in members),
                "status": "uploading" if any(m["status"] == "uploading" for m in members) else "complete",
                "source": members[0]["source"],
                "created_at": min(m["created_at"] for m in members),
            }
        item = self.items.get(eid)
        if item is None or item.get("folder"):
            return None
        return {k: v for k, v in item.items() if k not in ("rel", "folder")}

    def list_view(self) -> list[dict]:
        eids = {self.entity_id(i) for i in self.items.values()}
        views = [v for v in (self.entity_view(e) for e in eids) if v]
        return sorted(views, key=lambda v: v["created_at"], reverse=True)

    def folder_files(self, name: str) -> list[tuple[Path, str]]:
        return [
            (self.path_of(i), i["rel"])
            for i in sorted(self.items.values(), key=lambda i: i["rel"])
            if i.get("folder") == name and i["status"] == "complete"
        ]
