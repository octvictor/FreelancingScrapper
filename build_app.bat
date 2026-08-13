@echo off
REM Builds a standalone, double-clickable app (dist\FreelancingTools.exe).
REM
REM Run this ONCE (and again only if you change requirements.txt or add
REM new scraper modules) - after that, day-to-day use is just
REM double-clicking the .exe it produces. No terminal, no venv, no
REM "uvicorn" needed for regular use.
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
echo First launch will take a little longer while it downloads the browser component - that's normal, one-time (and only needed if you turn Safe mode off).
