#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "LetouMe Full Dev Stack"
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

if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    (cd "$SCRIPT_DIR/frontend" && npm install)
    echo ""
fi

cleanup() {
    echo ""
    echo "Stopping LetouMe dev stack..."
    if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "${FRONTEND_PID:-}" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    wait 2>/dev/null || true
}

trap cleanup EXIT INT TERM

echo "Starting FastAPI API..."
APP_ENV=dev "$PYTHON_CMD" -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

echo "Starting React frontend..."
(
    cd "$SCRIPT_DIR/frontend"
    npm run dev -- --host 0.0.0.0
) &
FRONTEND_PID=$!

echo ""
echo "Frontend: http://localhost:5173"
echo "Backend API: http://localhost:8000"
echo "Press Ctrl+C to stop both services"
echo "=========================================="
echo ""

wait "$BACKEND_PID" "$FRONTEND_PID"
