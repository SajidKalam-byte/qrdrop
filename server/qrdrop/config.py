from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ[name])
    except (KeyError, ValueError):
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Config:
    port: int = 8765
    bind: str = "0.0.0.0"
    storage: Path = field(default_factory=lambda: Path("./drops"))
    pair_ttl: int = 120
    session_ttl: int = 7200
    wipe_on_exit: bool = False
    open_browser: bool = True
    invert_qr: bool = False
    watch_interval: float = 3.0
    static_dir: Path = STATIC_DIR

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            port=_env_int("QRDROP_PORT", 8765),
            bind=os.environ.get("QRDROP_BIND", "0.0.0.0"),
            storage=Path(os.environ.get("QRDROP_STORAGE", "./drops")),
            pair_ttl=_env_int("QRDROP_TTL_PAIR", 120),
            session_ttl=_env_int("QRDROP_TTL_SESSION", 7200),
            wipe_on_exit=_env_bool("QRDROP_WIPE_ON_EXIT", False),
        )
