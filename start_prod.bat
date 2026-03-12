@echo off
setlocal

echo ==========================================
echo LetouMe Production Preview Stack
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

if not exist ".env.prod" (
    echo Error: .env.prod not found
    echo Please create production environment config first.
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

set "FRONTEND_ORIGIN="
for /f "usebackq tokens=1,* delims==" %%A in (".env.prod") do (
    if /i "%%A"=="FRONTEND_ORIGIN" set "FRONTEND_ORIGIN=%%B"
)

if "%PROD_API_BASE_URL%"=="" (
    if not "%FRONTEND_ORIGIN%"=="" (
        set "PROD_API_BASE_URL=%FRONTEND_ORIGIN%:8000"
    ) else (
        set "PROD_API_BASE_URL=http://116.62.134.169:8000"
    )
)

echo Building frontend for production preview...
pushd frontend
set "VITE_API_BASE_URL=%PROD_API_BASE_URL%"
call npm run build
if %errorlevel% neq 0 (
    popd
    pause
    exit /b 1
)
popd
echo.

echo Starting FastAPI API in prod mode...
start "LetouMe Backend Prod" cmd /k "set APP_ENV=prod && %PYTHON_CMD% -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000"

echo Starting frontend preview...
start "LetouMe Frontend Prod" cmd /k "cd /d %~dp0frontend && npm run preview -- --host 0.0.0.0 --port 4173"

echo.
echo Frontend Preview: %FRONTEND_ORIGIN%:4173
echo Backend API: %PROD_API_BASE_URL%
echo Both services are running in separate windows.
echo ==========================================
echo.

pause
