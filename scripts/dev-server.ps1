# Run the server with auto-reload, bound to all interfaces (Windows).
Set-Location "$PSScriptRoot\..\server"
.\.venv\Scripts\python -m uvicorn --factory qrdrop.app:create_app --host 0.0.0.0 --port 8765 --reload --reload-dir qrdrop --reload-dir static
