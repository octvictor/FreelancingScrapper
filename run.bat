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

REM launcher.py, not `uvicorn` directly: it starts the same server and
REM then opens the app in its own window rather than a browser tab.
REM Closing that window stops the server and ends this script.
REM
REM To get a browser window instead - useful while editing the frontend,
REM for the devtools - run these two lines in a terminal instead of
REM double-clicking this file:
REM     set VAIO_BROWSER=1
REM     run.bat
python launcher.py
pause
