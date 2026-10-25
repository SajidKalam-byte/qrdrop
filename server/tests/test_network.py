import socket
from types import SimpleNamespace

from qrdrop import network


def _addr(ip):
    return SimpleNamespace(family=socket.AF_INET, address=ip)


def _patch(monkeypatch, ifaces, udp):
    monkeypatch.setattr(network.psutil, "net_if_addrs", lambda: {n: [_addr(ip)] for n, (ip, _) in ifaces.items()})
    monkeypatch.setattr(network.psutil, "net_if_stats", lambda: {n: SimpleNamespace(isup=up) for n, (_, up) in ifaces.items()})
    monkeypatch.setattr(network, "udp_primary_ip", lambda: udp)


def test_private_ranges():
    assert network.is_private_lan("192.168.0.4")
    assert network.is_private_lan("172.31.9.9")
    assert not network.is_private_lan("172.32.0.1")
    assert not network.is_private_lan("8.8.8.8")
    assert not network.is_private_lan("100.100.1.1")  # CGNAT / tailscale
    assert not network.is_private_lan("169.254.1.1")


def test_virtual_adapters_filtered(monkeypatch):
    _patch(monkeypatch, {
        "Wi-Fi": ("192.168.1.20", True),
        "vEthernet (WSL)": ("172.20.0.1", True),
        "docker0": ("172.17.0.1", True),
        "Tailscale": ("10.9.9.9", True),
        "Ethernet 2": ("10.0.0.7", False),  # down
    }, udp="192.168.1.20")
    assert network.candidate_ips() == ["192.168.1.20"]


def test_udp_ip_preferred_and_alternates_listed(monkeypatch):
    _patch(monkeypatch, {"Wi-Fi": ("192.168.1.20", True), "Ethernet": ("10.0.0.7", True)}, udp="10.0.0.7")
    info = network.detect()
    assert info.primary == "10.0.0.7"
    assert info.alternates == ["192.168.1.20"]


def test_falls_back_to_candidate_when_udp_ip_is_virtual(monkeypatch):
    _patch(monkeypatch, {"Wi-Fi": ("192.168.1.20", True)}, udp="172.17.0.1")
    assert network.detect().primary == "192.168.1.20"


def test_no_network(monkeypatch):
    _patch(monkeypatch, {}, udp=None)
    info = network.detect()
    assert info.primary is None and info.alternates == []
