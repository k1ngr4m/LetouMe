#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "LetouMe Production Preview Stack"
echo "=========================================="
echo ""

if [ -x "$SCRIPT_DIR/.venv/bin/python" ]; then
    PYTHON_CMD="$SCRIPT_DIR/.venv/bin/python"
elif command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
else
    echo "Error: Python 3 not found"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "Error: npm not found"
    echo "Please install Node.js first: https://nodejs.org/"
    exit 1
fi

if [ ! -f "$SCRIPT_DIR/.env.prod" ]; then
    echo "Error: .env.prod not found"
    echo "Please create production environment config first."
    exit 1
fi

if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    (cd "$SCRIPT_DIR/frontend" && npm install)
    echo ""
fi

set -a
. "$SCRIPT_DIR/.env.prod"
set +a

PROD_API_BASE_URL="${PROD_API_BASE_URL:-${FRONTEND_ORIGIN}:8000}"

echo "Building frontend for production preview..."
(cd "$SCRIPT_DIR/frontend" && VITE_API_BASE_URL="$PROD_API_BASE_URL" npm run build)
echo ""

cleanup() {
    echo ""
    echo "Stopping LetouMe production preview stack..."
    if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "${FRONTEND_PID:-}" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    wait 2>/dev/null || true
}

trap cleanup EXIT INT TERM

echo "Starting FastAPI API in prod mode..."
APP_ENV=prod "$PYTHON_CMD" -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

echo "Starting frontend preview..."
(
    cd "$SCRIPT_DIR/frontend"
    npm run preview -- --host 0.0.0.0 --port 4173
) &
FRONTEND_PID=$!

echo ""
echo "Frontend Preview: ${FRONTEND_ORIGIN}:4173"
echo "Backend API: ${PROD_API_BASE_URL}"
echo "Press Ctrl+C to stop both services"
echo "=========================================="
echo ""

wait "$BACKEND_PID" "$FRONTEND_PID"
