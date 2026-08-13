@echo off
REM Double-click this file to start the app. First run also sets itself up
REM (creates a virtual environment, installs packages) - that only happens
REM once and takes a minute or two; every run after that just starts the app.
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
    call .venv\Scripts\activate.bat
    pip install -r requirements.txt
    if errorlevel 1 (
        echo.
        echo Setup failed while installing packages - see the error above.
        pause
        exit /b 1
    )
) else (
    call .venv\Scripts\activate.bat
)

REM No --reload here on purpose: uvicorn's reload spawns a subprocess to
REM run the actual server, and on some Windows Python installs (notably
REM the newer per-version "pythoncore-X.Y-64" layout) that subprocess
REM doesn't correctly inherit this venv, causing "ModuleNotFoundError:
REM No module named 'fastapi'" even though it's installed. Backend (.py)
REM edits need a restart (Ctrl+C, then run.bat again) to take effect;
REM frontend files (frontend/**) still update on a plain browser refresh,
REM no restart needed either way.
start /b python -c "import time, webbrowser; time.sleep(1.2); webbrowser.open('http://127.0.0.1:8501')"
uvicorn server:app --port 8501
pause
