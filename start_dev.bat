@echo off
setlocal

echo ==========================================
echo LetouMe Full Dev Stack
echo ==========================================
echo.

cd /d %~dp0

if exist ".venv\Scripts\python.exe" (
    set "PYTHON_CMD=.venv\Scripts\python.exe"
) else (
    python --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo Error: Python not found
        pause
        exit /b 1
    )
    set "PYTHON_CMD=python"
)

npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: npm not found
    echo Please install Node.js first: https://nodejs.org/
    pause
    exit /b 1
)

if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    pushd frontend
    call npm install
    if %errorlevel% neq 0 (
        popd
        pause
        exit /b 1
    )
    popd
    echo.
)

echo Starting FastAPI API...
start "LetouMe Backend" cmd /k "set APP_ENV=dev && %PYTHON_CMD% -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000"

echo Starting React frontend...
start "LetouMe Frontend" cmd /k "cd /d %~dp0frontend && npm run dev -- --host 0.0.0.0"

echo.
echo Frontend: http://localhost:5173
echo Backend API: http://localhost:8000
echo Both services are running in separate windows.
echo ==========================================
echo.

pause
