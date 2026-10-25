"""Safe path handling and disk helpers. Everything user-supplied goes through here."""
from __future__ import annotations

import io
import re
import zipfile
from pathlib import Path
from typing import Iterator

_BAD_CHARS = re.compile(r'[<>:"|?*\x00-\x1f]')
_RESERVED = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}
MAX_PART = 180


class UnsafePath(ValueError):
    pass


def sanitize_relative_path(raw: str) -> str:
    """Turn a client-supplied name/path into a safe relative POSIX path, or raise UnsafePath."""
    parts = [p for p in raw.replace("\\", "/").split("/") if p not in ("", ".")]
    if not parts or any(p == ".." for p in parts):
        raise UnsafePath("invalid path")
    clean: list[str] = []
    for part in parts:
        part = _BAD_CHARS.sub("_", part).strip(" .")
        if not part:
            raise UnsafePath("invalid path component")
        if part.split(".")[0].upper() in _RESERVED:
            part = "_" + part
        clean.append(part[:MAX_PART])
    return "/".join(clean)


def reserve(base: Path, rel: str) -> tuple[Path, str]:
    """Pick a non-colliding path under `base`, create parents, touch the file. Returns (path, rel)."""
    base = base.resolve()
    target = (base / rel).resolve()
    if not target.is_relative_to(base):
        raise UnsafePath("path escapes session directory")
    stem, suffix = target.stem, target.suffix
    n = 1
    while target.exists():
        target = target.with_name(f"{stem} ({n}){suffix}")
        n += 1
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.touch(exist_ok=False)
    except (FileExistsError, NotADirectoryError) as exc:
        raise UnsafePath("name conflicts with an existing file") from exc
    return target, target.relative_to(base).as_posix()


class _Sink(io.RawIOBase):
    """Unseekable in-memory sink so zipfile emits a stream with data descriptors."""

    def __init__(self) -> None:
        self._chunks: list[bytes] = []
        self._pos = 0

    def writable(self) -> bool:
        return True

    def write(self, b) -> int:
        self._chunks.append(bytes(b))
        self._pos += len(b)
        return len(b)

    def tell(self) -> int:
        return self._pos

    def drain(self) -> bytes:
        data = b"".join(self._chunks)
        self._chunks.clear()
        return data


def zip_stream(files: list[tuple[Path, str]], chunk: int = 1 << 20) -> Iterator[bytes]:
    """Yield a ZIP (stored, zip64) built incrementally from disk; RAM use is ~one chunk."""
    sink = _Sink()
    with zipfile.ZipFile(sink, "w", zipfile.ZIP_STORED, allowZip64=True) as zf:
        for path, arcname in files:
            info = zipfile.ZipInfo.from_file(path, arcname)
            info.compress_type = zipfile.ZIP_STORED
            with zf.open(info, "w", force_zip64=True) as dst, open(path, "rb") as src:
                while block := src.read(chunk):
                    dst.write(block)
                    data = sink.drain()
                    if data:
                        yield data
    tail = sink.drain()
    if tail:
        yield tail
