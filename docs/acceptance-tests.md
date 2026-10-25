# Acceptance tests (release gates)

"Auto" rows are covered by `server/tests`; "Manual" rows need real devices.

| Gate | Pass condition | How |
|---|---|---|
| Fresh network | server start → QR → first text transfer in < 10 s | Manual, stopwatch |
| App speed | camera live in < 2 s with permission granted | Manual |
| Offline | internet disabled, LAN up: transfers still work | Manual (nothing in the code needs the internet; the UDP trick sends no packets) |
| Text | 40-line paste arrives exactly | Auto `test_text_item` + manual |
| Clipboard image | pasted screenshot arrives as a valid PNG | Manual (browser paste handler) |
| 2 GB file | memory stays flat, completes, SHA-256 matches | Auto: 300 MB RSS test `test_large_upload_streams_with_flat_memory`; Manual: 2 GB in the browser, watch DevTools memory. Smoke test: 200 MB over the LAN IP matched SHA-256 with the server at ~54 MB RSS |
| Folder | nested folder keeps paths; ZIP download matches | Auto `test_folder_zip_contents_match` |
| Security | 3 min later old QR → 401; no token → 403 | Auto `test_expired_qr_is_401`, `test_phone_without_token_is_403_and_bad_token_401` |
| Wipe | old bearer 401; session folder gone | Auto `test_wipe_revokes_everything` |
| Path traversal | `../` names are rejected | Auto `test_path_traversal_neutralised` |
| Cross-site | foreign `Origin` / rebinding `Host` rejected | Auto `test_cross_site_and_rebinding_blocked` |
| Cross-platform | server on Win/macOS/Linux; app on Android + iOS | Manual |
