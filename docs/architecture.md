# Architecture

```
┌──────────────── Laptop ────────────────┐            ┌──── Phone (Expo) ─────┐
│ FastAPI + uvicorn  (0.0.0.0:8765)      │            │ CameraView QR scanner │
│  REST   /s/{pair} /api/*               │◄── LAN ───►│ single-screen feed    │
│  WS     /ws  (live item feed)          │  HTTP +    │ native uploadAsync    │
│  static drop-zone page                 │  bearer    │ (streams from disk)   │
│ ./drops/<session>/   files on disk     └────────────┴───────────────────────┘
│ in-memory item index
└─────────────────────────────────────────┘
 Browser on the laptop = http://localhost:8765  (loopback => trusted "host")
```

## Key decisions

| Concern | Decision | Why |
|---|---|---|
| Discovery | QR carries `http://<lan-ip>:<port>/s/<pair>`; regenerated on launch and on IP change | Always current; no static IPs, no mDNS dependency |
| Wrong IP (VPN/Docker/WSL) | UDP-connect trick picks the routed NIC; interface enumeration filters virtual adapters; the rest are shown as "alternate addresses" on the page | Most common real-world failure |
| Auth | single-use 2 min pair code → 2 h bearer; loopback is `host`; no credential = 403, bad/expired = 401 | QR *is* discovery and auth |
| Camera-app fallback | `GET /s/..` with `Accept: text/html` sets a cookie and redirects to the page | Works with no app installed |
| Browser CSRF/rebinding | `Host` must be IP/localhost/.local/bare name; `Origin` (if sent) must equal `Host` | The loopback-trusted page must not be drivable by other websites |
| Large files | raw `PUT` body streamed to disk (`request.stream()` → aiofiles); browser sends the disk-backed `File` via XHR; phone uses native `uploadAsync` | Flat memory; no chunking needed for that |
| API shape | `POST /api/uploads` → `upload_id`; `PUT /api/uploads/{id}` | Same endpoint becomes the resumable chunk-append path in v1.1 |
| Folders | relative path sent per file, sanitized server-side; all files under a folder collapse into one `folder:<name>` entry; download streams a ZIP built from disk (stored, zip64, ~1 chunk of RAM) | One card per folder; no archive in memory |
| Live updates | one WebSocket; snapshot on every (re)connect, then `item_added/updated/removed` (progress throttled to ~2/s) | `EventSource` doesn't exist in React Native |
| State | in-memory dict + files on disk | Ephemeral by design; no ORM/migrations |
| Transport | HTTP for v1 (cleartext exceptions declared in `app.json`) | Self-signed HTTPS is hostile to phones; v1.1 pins the cert via the QR |

## Server layout

```
server/qrdrop/
  __main__.py  CLI, port selection, banner + terminal QR
  app.py       app factory, lifespan (IP watcher, pair expiry), page routes
  core.py      shared state (session, tokens, hub, network) + change feed `publish()`
  network.py   UDP trick + interface filtering + watcher
  auth.py      TokenStore, identify()/dependencies, Host/Origin checks
  sessions.py  item registry, folder collapsing, wipe
  storage.py   path sanitising, collision-safe reserve(), streaming ZIP
  ws.py        Hub + /ws endpoint
  qr.py        terminal (half-block) and SVG QR rendering
  api/         pair, info, uploads, text, items, downloads, wipe
server/static/ index.html, app.js, dropzone.js, ws-client.js, styles.css
```

## Deviations from the original plan (and why)

* **No Tailwind build.** `styles.css` is hand-written (no toolchain, works offline, one less moving part).
* **`psutil` is a runtime dependency**, used for interface names/state when filtering virtual adapters.
* **Received files are kept on exit** unless `--wipe-on-exit` is set; deleting a user's files on Ctrl-C is a worse default than leaving them.
* **Wipe is host-only.** A paired phone cannot erase the laptop's session.
* **Pair code rotates after every successful scan**, so several phones can pair one after another from the same screen.
