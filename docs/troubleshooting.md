# Troubleshooting

## "Can't reach your computer" on the phone

1. **Same Wi-Fi?** Phone and laptop must be on the same network (not phone on cellular).
2. **Client isolation.** Guest and many office networks block device-to-device traffic ("AP isolation"). qrdrop cannot work around this: use a different network or a phone hotspot.
3. **Windows Firewall.** The first run normally prompts "allow access", and if you dismissed it the phone is blocked silently. The page shows a hint after 20 s with no inbound connection. Fix (admin PowerShell):
   ```powershell
   netsh advfirewall firewall add rule name="qrdrop" dir=in action=allow protocol=TCP localport=8765
   ```
   macOS: System Settings → Network → Firewall → allow Python. Linux: `sudo ufw allow 8765/tcp`.
4. **VPN / Docker / WSL picked the wrong address.** The terminal and page list "alternate addresses". Open one on the phone's browser to test, or disconnect the VPN.

## "QR code expired"
Pair codes live 2 minutes and work once. The page refreshes the QR automatically; scan the current one.

## iOS app shows nothing / can't connect (release builds)
`NSLocalNetworkUsageDescription` and the local-networking ATS exception must be in the build (they're in `app/app.json`). Accept the "Local Network" permission prompt on first connect; if you declined, enable it in Settings → qrdrop.

## Android: "Network request failed"
Release builds block cleartext HTTP unless `usesCleartextTraffic` is set (done via `expo-build-properties` in `app/app.json`). Rebuild after changing it.

## Large transfer stops when the phone locks
The app keeps the screen awake while a transfer runs, but an OS battery saver can still suspend it. Keep the app in the foreground for multi-GB files. (Resumable uploads: v1.1.)

## Port 8765 busy
qrdrop picks the next free port automatically and shows it in the QR. To pin one: `--port 9000`.
