#!/usr/bin/env sh
# Run the server with auto-reload, bound to all interfaces (macOS/Linux).
cd "$(dirname "$0")/../server" || exit 1
exec .venv/bin/python -m uvicorn --factory qrdrop.app:create_app --host 0.0.0.0 --port 8765 --reload --reload-dir qrdrop --reload-dir static
