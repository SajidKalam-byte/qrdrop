import pytest
from fastapi.testclient import TestClient

from qrdrop.app import create_app
from qrdrop.config import Config
from qrdrop.network import NetworkInfo

HOST = ("127.0.0.1", 50000)
PHONE = ("192.168.1.50", 50001)


@pytest.fixture
def app(tmp_path):
    cfg = Config(storage=tmp_path / "drops", watch_interval=3600, open_browser=False)
    return create_app(cfg, net=NetworkInfo("192.168.1.10", ["10.0.0.5"]))


@pytest.fixture
def core(app):
    return app.state.core


@pytest.fixture
def host(app):
    return TestClient(app, client=HOST, base_url="http://localhost:8765")


@pytest.fixture
def phone(app):
    return TestClient(app, client=PHONE, base_url="http://192.168.1.10:8765")


@pytest.fixture
def paired(phone, core):
    """A phone client that has already completed pairing (bearer header attached)."""
    r = phone.get(f"/s/{core.tokens.pair_token}")
    assert r.status_code == 200
    phone.headers["Authorization"] = f"Bearer {r.json()['bearer']}"
    return phone
