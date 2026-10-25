# qrdrop API contract

Single source of truth shared by the server (`server/`), the browser page (`server/static/`) and the phone app (`app/`).

## Auth model

| Caller | Credential | Role |
|---|---|---|
| Browser on the server machine (loopback) | none | `host` |
| Phone app | `Authorization: Bearer <bearer>` | `guest` |
| Phone's system browser (QR scanned with the camera app) | `qrdrop_bearer` cookie, set by `GET /s/{pair_token}` | `guest` |

* No credential -> **403**. Unknown/expired credential or pair code -> **401**.
* Every request must have a plausible `Host` (IP literal, `localhost`, `*.local`, single-label name) and, if it sends `Origin`, that origin must equal the `Host` (blocks DNS rebinding and cross-site requests against the loopback-trusted host page).
* Pair token: single use, 2 min TTL, rotated automatically after use/expiry/IP change. Bearer: 2 h TTL.

## Pairing

```
GET /s/{pair_token}
  Accept: application/json  -> 200 { "bearer": str, "session_id": str, "expires_at": float(epoch s) }
  Accept: text/html         -> 303 -> "/" with cookie qrdrop_bearer
  expired / reused          -> 401
```

QR payload is the plain URL `http://<lan-ip>:<port>/s/<pair_token>`.

## REST (all require auth)

```
GET    /api/info                       -> { version, session_id, role, hostname, remote_seen, uptime,
                                            (host only) pair_url, pair_expires_at, alt_urls, storage_dir, port }
GET    /api/qr.svg                     -> image/svg+xml of the current pair_url           (host only)

POST   /api/uploads                    body { name, size?, relative_path?, mime? }
                                       -> 201 { upload_id, item }
PUT    /api/uploads/{upload_id}        raw streamed body (Content-Type ignored)
                                       -> 200 { item }       409 if not in "uploading" state
                                       (v1.1 resume: same endpoint + Content-Range)

POST   /api/text                       body { body }   (<= 1,000,000 chars)  -> 201 { item }

GET    /api/items                      -> [item]
GET    /api/items/{id}/download        file: streamed bytes (HTTP Range supported)
                                       text: text/plain
                                       "folder:<name>": streamed ZIP
DELETE /api/items/{id}                 -> 204   (also accepts "folder:<name>")
POST   /api/wipe                       -> 204   (host only) deletes session files, revokes all bearers,
                                                closes every WebSocket, rotates pair token
```

### item

```
{ id, type: "file"|"text"|"folder", name, size, created_at, source: "desktop"|"phone",
  status: "uploading"|"complete",
  file:   { received, mime }
  text:   { body }
  folder: { id: "folder:<name>", count, received }   // all files dropped under one folder collapse to one entry
}
```

## WebSocket `/ws` (cookie, `?token=<bearer>`, or loopback)

Server -> client JSON:

```
{ type: "snapshot",    items: [item], session_id }   // first message, on every (re)connect
{ type: "item_added",  item }
{ type: "item_updated", item }                       // upload progress, throttled to ~2/s
{ type: "text_added",  item }
{ type: "item_removed", id }
{ type: "qr_rotated" }                               // host page: refetch /api/info
{ type: "wiped" }                                    // connection is closed right after
```

Client -> server: the text `ping` is answered with `pong`.
