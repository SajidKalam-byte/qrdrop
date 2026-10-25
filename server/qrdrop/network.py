"""LAN address detection.

Two signals are combined:
  * the UDP-connect trick asks the OS which source address it would use to reach
    the outside world (no packet is sent), which is almost always the right NIC;
  * interface enumeration gives every private IPv4 address minus virtual adapters
    (Docker, WSL, VPN, ...), which become the "alternates" shown on the page.
"""
from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import psutil

if TYPE_CHECKING:
    from .core import Core

PRIVATE_NETS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
]

VIRTUAL_NAME = re.compile(
    r"docker|veth|br-|vmnet|virtualbox|vbox|vethernet|hyper-v|wsl|tailscale|zerotier|"
    r"utun|\btun|\btap|vpn|loopback|awdl|llw|bridge|virbr|lxc|podman",
    re.IGNORECASE,
)


@dataclass
class NetworkInfo:
    primary: str | None
    alternates: list[str] = field(default_factory=list)


def is_private_lan(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return addr.version == 4 and any(addr in net for net in PRIVATE_NETS)


def udp_primary_ip() -> str | None:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))  # UDP: selects a route, sends nothing
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def candidate_ips() -> list[str]:
    """Private IPv4 addresses on up, non-virtual interfaces."""
    stats = psutil.net_if_stats()
    out: list[str] = []
    for name, addrs in psutil.net_if_addrs().items():
        if VIRTUAL_NAME.search(name):
            continue
        st = stats.get(name)
        if st is not None and not st.isup:
            continue
        for a in addrs:
            if a.family == socket.AF_INET and is_private_lan(a.address) and a.address not in out:
                out.append(a.address)
    return out


def detect() -> NetworkInfo:
    candidates = candidate_ips()
    udp = udp_primary_ip()
    if udp in candidates:
        primary: str | None = udp
    elif candidates:
        primary = candidates[0]
    else:
        primary = None
    return NetworkInfo(primary=primary, alternates=[c for c in candidates if c != primary])


async def watch(core: "Core") -> None:
    """Re-detect the LAN address; when it changes, rotate the pair token so the QR is current."""
    while True:
        await asyncio.sleep(core.cfg.watch_interval)
        try:
            info = await asyncio.to_thread(detect)
        except Exception:  # never let the watcher die on a flaky adapter
            continue
        changed = info.primary != core.net.primary
        core.net = info
        if changed:
            core.log(f"network changed -> {info.primary or 'no LAN'}")
            await core.rotate_pair()
