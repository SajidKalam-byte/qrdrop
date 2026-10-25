# qrdrop-server

FastAPI server and browser drop zone for qrdrop. See the [root README](../README.md).

```bash
pip install -e ".[dev]"
python -m qrdrop          # prints a QR code, opens http://localhost:8765/
python -m pytest          # 32 tests
```

Note: the dev scripts in `../scripts` start uvicorn directly (no terminal banner/QR); use `python -m qrdrop` for normal use.
