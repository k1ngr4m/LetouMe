#!/bin/bash

echo "=========================================="
echo "LetouMe FastAPI Server"
echo "=========================================="
echo ""

if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 not found"
    echo "Please install Python 3: https://www.python.org/downloads/"
    exit 1
fi

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

echo "Starting FastAPI server..."
echo ""
echo "Server URL: http://localhost:8000"
echo "Press Ctrl+C to stop the server"
echo "=========================================="
echo ""

python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
