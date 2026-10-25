PY ?= server/.venv/bin/python
ifeq ($(OS),Windows_NT)
PY = server/.venv/Scripts/python
endif

.PHONY: setup server app test
setup:
	python -m venv server/.venv
	$(PY) -m pip install -e "server[dev]"
	cd app && npm install

server:
	cd server && ../$(PY) -m qrdrop

app:
	cd app && npx expo start

test:
	cd server && ../$(PY) -m pytest
	cd app && npx tsc --noEmit
