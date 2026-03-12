@echo off
REM LetouMe FastAPI server startup script (Windows)

echo ==========================================
echo LetouMe FastAPI Server
echo ==========================================
echo.

cd /d %~dp0

if exist ".venv\Scripts\python.exe" (
    set "PYTHON_CMD=.venv\Scripts\python.exe"
) else (
    python --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo X Error: Python not found
        echo Please install Python first: https://www.python.org/downloads/
        pause
        exit /b 1
    )
    set "PYTHON_CMD=python"
)

echo Starting FastAPI server...
echo.
echo Server URL: http://localhost:8000
echo Press Ctrl+C to stop the server
echo ==========================================
echo.

%PYTHON_CMD% -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
