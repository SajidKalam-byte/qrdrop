@echo off
title qrdrop
chcp 65001 >nul
cd /d "%~dp0server"
if not exist ".venv\Scripts\python.exe" (
  echo First run: setting up...
  python -m venv .venv && .venv\Scripts\python -m pip install -q -e . || goto :fail
)
.venv\Scripts\python -m qrdrop %*
if errorlevel 1 goto :fail
exit /b 0
:fail
echo.
echo qrdrop stopped with an error. Press any key to close.
pause >nul
