# qrdrop

Scan a QR code, then move **anything** between your phone and your laptop over the local network. No accounts, no internet, no size limit, no compression.

```
laptop:  python -m qrdrop        -> terminal + browser show a QR code
phone:   open app -> scan        -> connected; drop files / paste text on either side
```

* **Network-proof.** The QR code is generated fresh at every launch (and whenever your Wi-Fi changes), so it always holds the current LAN IP. Home, office, farmhouse: nothing to configure.
* **One drop surface.** The browser page accepts dragged files, dragged folders, pasted screenshots and pasted text with no category picker.
* **Big files are fine.** Uploads are streamed straight to disk on both ends; memory stays flat (a 200 MB test file moved with the server at ~54 MB RSS).
* **Scoped access.** The QR holds a single-use pair code (2 min). It's exchanged for a 2 h bearer token. Anything else on the Wi-Fi gets `403`.

## Quick start

### 0. Easiest on Windows

1. Install [Python 3.10+](https://www.python.org/downloads/) (tick **Add python.exe to PATH**).
2. Double-click `qrdrop.bat`. The first run sets itself up (about a minute); after that it starts instantly.
3. Optional: run `powershell -ExecutionPolicy Bypass -File scripts\create-shortcut.ps1` for a Desktop shortcut with the logo, then right-click it → *Show more options* → *Pin to taskbar*.
4. Install the Android app (APK, see below), open it and scan the QR.

### 1. Laptop (Windows / macOS / Linux, Python 3.10+), manual

```bash
cd server
python -m venv .venv
.venv/bin/pip install -e .          # Windows: .venv\Scripts\pip install -e .
.venv/bin/python -m qrdrop          # Windows: .venv\Scripts\python -m qrdrop
```

A QR code prints in the terminal and the drop-zone page opens at `http://localhost:8765/`.
Received files land in `./drops/<session-id>/`.

Options: `--port`, `--bind`, `--storage DIR`, `--no-browser`, `--light-terminal`, `--wipe-on-exit`
(env: `QRDROP_PORT`, `QRDROP_BIND`, `QRDROP_STORAGE`, `QRDROP_TTL_PAIR`, `QRDROP_TTL_SESSION`, `QRDROP_WIPE_ON_EXIT`).

### 2. Phone

**Android:** download the APK from this repo's **Releases** page and install it (allow "install unknown apps"). Both devices must be on the same Wi-Fi.

**Build it yourself / iOS (Expo):**

```bash
cd app
npm install
npx expo start          # scan with Expo Go, or build a dev client (see below)
```

The app opens straight to the camera. Scan the laptop's QR code; the feed appears. Tap **+ Send** for files, photos/videos, or clipboard text.

> **No app? ** Scan the QR with the phone's normal camera instead: the link opens the same drop-zone page in the phone browser (cookie-authenticated).

> **Standalone builds:** the iOS local-network permission and cleartext-HTTP exceptions are already declared in `app/app.json`. Without them a TestFlight / release build silently can't talk to the laptop. Use `npx expo run:android|ios` or EAS for a dev client.

### 3. Tests

```bash
cd server && .venv/bin/pip install -e ".[dev]" && .venv/bin/python -m pytest
cd app && npx tsc --noEmit
```

## How it works

See [docs/architecture.md](docs/architecture.md) and the endpoint list in [shared/api-contract.md](shared/api-contract.md). Troubleshooting (Windows Firewall, guest Wi-Fi isolation, VPNs) is in [docs/troubleshooting.md](docs/troubleshooting.md). Release gates are in [docs/acceptance-tests.md](docs/acceptance-tests.md).

## Security model (read this)

This tool **trusts the local network** and speaks plain HTTP. The pair code and bearer protect against other devices on the Wi-Fi *using* your session, but not against someone *sniffing* it. Use it on networks you trust. HTTPS with the certificate fingerprint carried in the QR is the planned v1.1 upgrade.

Other protections: loopback-only host controls (wipe, QR), `Host`/`Origin` checks (DNS-rebinding and cross-site request protection for the loopback-trusted page), path-traversal-safe storage, and a **Wipe** button that deletes the session folder, revokes every token and disconnects every device.

## Status / roadmap

v1.0 (this repo): everything in the brief's *Must have* list, plus live WebSocket updates and the wipe button.
v1.1: resumable chunked uploads (same `PUT /api/uploads/{id}` + `Content-Range`), HTTPS with QR-pinned fingerprint, multi-IP racing in the app, `drop.local` via mDNS, optional PIN.

## License

MIT
