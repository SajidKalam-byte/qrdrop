from __future__ import annotations

import argparse
import socket
import sys
import threading
import webbrowser
from pathlib import Path

import uvicorn

from . import __version__, qr
from .app import create_app
from .config import Config
from .core import Core


def free_port(start: int, bind: str, tries: int = 20) -> int:
    for port in range(start, start + tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((bind, port))
                return port
            except OSError:
                continue
    raise SystemExit(f"No free port in {start}-{start + tries - 1}. Use --port.")


def banner(core: Core) -> None:
    out = sys.stdout
    try:
        out.reconfigure(encoding="utf-8")  # half-block QR needs UTF-8 (Windows consoles default otherwise)
    except Exception:
        pass
    local = f"http://localhost:{core.cfg.port}/"
    print(f"\n  qrdrop {__version__}  -  session {core.session.id}\n")
    url = core.pair_url
    if url:
        try:
            print(qr.render_terminal(url, invert=core.cfg.invert_qr))
        except Exception:
            print("  (QR could not be drawn in this terminal; open the page below instead)")
        print(f"\n  Scan with the qrdrop app    {url}")
        for alt in core.alt_urls:
            print(f"  If that fails, try          {alt}")
    else:
        print("  No LAN address found - connect to Wi-Fi. The QR appears on the page as soon as you do.")
    print(f"  Drop zone on this computer  {local}")
    print(f"  Received files              {core.session.dir}\n", flush=True)
    if core.cfg.open_browser:
        threading.Timer(0.8, webbrowser.open, args=(local,)).start()


def main() -> None:
    p = argparse.ArgumentParser(prog="qrdrop", description="Scan a QR code, drop anything between phone and laptop.")
    p.add_argument("--port", type=int, help="default 8765 (env QRDROP_PORT)")
    p.add_argument("--bind", help="default 0.0.0.0 (env QRDROP_BIND)")
    p.add_argument("--storage", type=Path, help="where received files go (env QRDROP_STORAGE)")
    p.add_argument("--no-browser", action="store_true", help="don't open the drop zone page")
    p.add_argument("--light-terminal", action="store_true", help="draw the terminal QR for light-background terminals")
    p.add_argument("--wipe-on-exit", action="store_true", help="delete received files when the server stops")
    args = p.parse_args()

    cfg = Config.from_env()
    if args.port:
        cfg.port = args.port
    if args.bind:
        cfg.bind = args.bind
    if args.storage:
        cfg.storage = args.storage
    cfg.open_browser = not args.no_browser
    cfg.invert_qr = args.light_terminal
    cfg.wipe_on_exit = cfg.wipe_on_exit or args.wipe_on_exit
    cfg.port = free_port(cfg.port, cfg.bind)

    app = create_app(cfg, on_ready=banner)
    uvicorn.run(app, host=cfg.bind, port=cfg.port, log_level="warning", proxy_headers=False)


if __name__ == "__main__":
    main()
