@echo off
REM LetouMe FastAPI server startup script (Windows)

echo ==========================================
echo LetouMe FastAPI Server
echo ==========================================
echo.

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo X Error: Python not found
    echo Please install Python first: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo Starting FastAPI server...
echo.
echo Server URL: http://localhost:8000
echo Press Ctrl+C to stop the server
echo ==========================================
echo.

python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
