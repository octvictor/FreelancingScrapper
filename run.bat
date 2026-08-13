@echo off
REM One command to (re)start the app after the one-time setup in README.md.
cd /d "%~dp0"

if not exist ".venv" (
    echo No .venv found - run the one-time setup in README.md first.
    exit /b 1
)

call .venv\Scripts\activate.bat
streamlit run app.py
