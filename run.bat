@echo off
REM Double-click this file to start the app. Creates a virtual environment
REM the first time (takes a minute or two); every run - including this
REM one - re-checks dependencies against requirements.txt, since a plain
REM "pip install" is a fast no-op when everything's already satisfied.
REM That's deliberate: skipping it whenever .venv already existed used to
REM mean a requirements.txt change (like a new dependency) silently never
REM got installed into an existing venv - which is exactly what caused a
REM "No module named 'fastapi'" error here even after fastapi was added
REM to requirements.txt.
cd /d "%~dp0"

if not exist ".venv" (
    echo First run: setting up - this only happens once...
    python -m venv .venv
    if errorlevel 1 (
        echo.
        echo Setup failed: could not create the virtual environment. Is Python installed and on PATH?
        pause
        exit /b 1
    )
)
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt
if errorlevel 1 (
    echo.
    echo Setup failed while installing packages - see the error above.
    pause
    exit /b 1
)

REM No --reload here: uvicorn's reload uses a subprocess-based file
REM watcher, and there's a known class of issue where that subprocess
REM doesn't correctly inherit an active venv on some Windows setups.
REM Staying conservative here rather than risk another confusing crash -
REM backend (.py) edits need a manual restart (Ctrl+C, then run.bat
REM again) to take effect. Frontend files (frontend/**) always update on
REM a plain browser refresh, no restart needed either way.
start /b python -c "import time, webbrowser; time.sleep(1.2); webbrowser.open('http://127.0.0.1:8501')"
uvicorn server:app --port 8501
pause
