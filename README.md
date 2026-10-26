# qrdrop

Scan a QR code, then move **anything** between your phone and your laptop over the local network. No accounts, no internet, no size limit, no compression.

```
laptop:  double-click qrdrop.bat   -> page opens with a QR code
phone:   open the app -> scan      -> connected; drop files / paste or type text on either side
```

* **Network-proof.** The QR code is made fresh at every launch and whenever your Wi-Fi changes, so it always holds the current LAN address. Home, office, farmhouse: nothing to configure.
* **One drop surface.** The web page accepts dragged files, dragged folders, pasted screenshots and pasted or typed text.
* **Preview without downloading.** Images, PDFs, video and audio open in a viewer on the page. Everything else downloads.
* **Big files are fine.** Uploads stream straight to disk on both ends, so memory stays flat (a 200 MB file moved with the server at about 54 MB of RAM).
* **Scoped access.** The QR holds a one-time pair code (2 min). It is swapped for a 2-hour token. Any other device on the Wi-Fi gets `403`.
* **Always a way in.** Can't scan? The page also shows a 6-digit code to type into the app.

## Install

### 1. Computer (Windows)

1. Install [Python 3.10 or newer](https://www.python.org/downloads/) and tick **Add python.exe to PATH**.
2. Download or clone this repo and double-click **`qrdrop.bat`**. The first run sets itself up (about a minute), then it starts in seconds.
3. Optional: put a logo shortcut on your Desktop with
   `powershell -ExecutionPolicy Bypass -File scripts\create-shortcut.ps1`
   then right-click it and choose **Pin to taskbar**.

macOS / Linux: see [Manual start](#manual-start-any-os).

The first time, Windows may ask to allow Python through the firewall. Choose **Allow**, or the phone can't reach the computer ([troubleshooting](docs/troubleshooting.md)).

### 2. Phone (Android)

1. Download **[qrdrop.apk](https://github.com/SajidKalam-byte/qrdrop/releases/latest/download/qrdrop.apk)** from the Releases page.
2. Open it and allow "Install unknown apps" for your browser or file manager when asked.
3. Put the phone on the **same Wi-Fi** as the computer.

iOS: no ready-made build yet; run it yourself with Expo (see [Build the phone app](#build-the-phone-app)).

### 3. Connect

Open the app and either:

* **Scan** the QR code on the computer's page (click the QR to enlarge it, hold the phone about 25 cm away), or
* tap **Enter code** and type the address and 6-digit code shown under the QR. The app remembers the address, so next time you only type the code.

You can also scan the QR with the phone's normal camera: the link opens the same page in the phone's browser.

## Using it

| You want to | Do this |
|---|---|
| Send to the computer | In the app: type text and tap **Send**, or tap **Files**, **Photos** or **Paste** |
| Send to the phone | On the page: drop files or a folder, paste (`Ctrl+V`), or type text and press `Enter` |
| Look at a received image or PDF | Click **Preview** on the page |
| Open the saved files | Click **Open saved files folder** on the page |
| Save a file on the phone | Tap **Save** on the item, then choose where in the share sheet |
| Stop a phone's access | Tap **Disconnect** in the app (its token ends immediately) |
| Delete everything | Click **Wipe session** on the page (files deleted, all phones disconnected, new QR) |

Received files are kept in `server/drops/<session>/` until you wipe or delete them.

## Manual start (any OS)

```bash
cd server
python -m venv .venv
.venv/bin/pip install -e .          # Windows: .venv\Scripts\pip install -e .
.venv/bin/python -m qrdrop          # Windows: .venv\Scripts\python -m qrdrop
```

Options: `--port`, `--bind`, `--storage DIR`, `--no-browser`, `--light-terminal`, `--wipe-on-exit`
(environment: `QRDROP_PORT`, `QRDROP_BIND`, `QRDROP_STORAGE`, `QRDROP_TTL_PAIR`, `QRDROP_TTL_SESSION`, `QRDROP_WIPE_ON_EXIT`).

## Build the phone app

The app is Expo (React Native) in `app/`.

```bash
cd app
npm install
npx expo start                      # Android/iOS dev: needs a dev build, Expo Go lacks some modules
```

**Build an APK** with [EAS](https://expo.dev) (free account; builds queue on the free tier):

```bash
cd app
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

EAS builds only **committed** code, so commit first. Download links on expo.dev expire after about 30 days, so keep the APK on a GitHub Release instead.

**Over-the-air updates:** JavaScript-only changes can reach installed apps without a new APK:

```bash
cd app
npx eas-cli update --channel preview --environment preview --message "what changed"
```

Close and reopen the app to pick it up. Changes to permissions, icons, native packages or `version` in `app.json` need a new APK.

The app scans with the phone's built-in scanner and, for phones where that stays silent, a JavaScript backup reader, so it works on Android phones without Google Play Services.

## Publish a release (maintainers)

1. Build the APK as above (rebuild after big changes so the bundled app is current).
2. Download it and rename it to exactly **`qrdrop.apk`**:
   ```bash
   cd app
   npx eas-cli build:download --platform android --latest
   ```
3. On GitHub: **Releases → Draft a new release** → pick a tag such as `v0.1.0` → drag **`qrdrop.apk`** into the assets box → **Publish**.

The README link `releases/latest/download/qrdrop.apk` then always points at the newest release.

## Tests

```bash
cd server && .venv/bin/pip install -e ".[dev]" && .venv/bin/python -m pytest
cd app && npx tsc --noEmit
```

## How it works

See [docs/architecture.md](docs/architecture.md) and the endpoint list in [shared/api-contract.md](shared/api-contract.md). Troubleshooting (Windows Firewall, guest Wi-Fi isolation, VPNs) is in [docs/troubleshooting.md](docs/troubleshooting.md). Release gates are in [docs/acceptance-tests.md](docs/acceptance-tests.md).

## Security model (read this)

qrdrop **trusts the local network** and speaks plain HTTP. The pair code and token stop other devices on the Wi-Fi from *using* your session, but not from *sniffing* it. Use it on networks you trust.

Also in place: host-only controls (wipe, QR, open folder), `Host`/`Origin` checks (DNS-rebinding and cross-site protection for the loopback-trusted page), path-traversal-safe storage, a preview that only serves images, video, audio and PDF (never HTML or SVG), and a Wipe button that deletes the session and revokes every token.

## Roadmap

v1.1: resumable uploads, HTTPS with the certificate fingerprint carried in the QR, `drop.local` via mDNS, optional PIN, faster scan pairing.

## License

MIT
