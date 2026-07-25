@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py start-mini-ink.py
) else (
  python start-mini-ink.py
)
endlocal
