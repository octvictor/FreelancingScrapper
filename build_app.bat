@echo off
REM Builds a standalone, double-clickable app (dist\FreelancingTools.exe).
REM
REM Run this ONCE (and again only if you change requirements.txt or the
REM app's code) - after that, day-to-day use is just double-clicking
REM the .exe it produces. No terminal, no venv, no "uvicorn" needed for
REM regular use.
cd /d "%~dp0"

if not exist ".venv" (
    python -m venv .venv
)
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt
pip install -q pyinstaller

if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

pyinstaller --onefile --name FreelancingTools ^
    --add-data "frontend;frontend" ^
    --collect-all uvicorn ^
    launcher.py

echo.
echo Build finished: dist\FreelancingTools.exe
echo Move/copy that file anywhere (Desktop, Start Menu folder, ...) and double-click it to run the app.
