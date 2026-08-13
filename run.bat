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

streamlit run app.py
pause
