#!/bin/bash

# Chess Demo Application Startup Script
# This script starts both the Flask backend and Electron frontend

set -e  # Exit on any error

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to cleanup background processes
cleanup() {
    echo ""
    echo "🛑 Stopping applications..."
    if [ ! -z "$FLASK_PID" ]; then
        kill $FLASK_PID 2>/dev/null || true
        echo "   ✅ Flask server stopped"
    fi
    if [ ! -z "$ELECTRON_PID" ]; then
        kill $ELECTRON_PID 2>/dev/null || true
        echo "   ✅ Electron app stopped"
    fi
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

echo "🚀 Starting Chess Demo Application..."
echo "======================================"

# Check if we're in the right directory
if [ ! -f "app.py" ]; then
    echo "❌ Error: This script must be run from the chess_demo directory"
    echo "   Current directory: $(pwd)"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "❌ Error: Virtual environment not found!"
    echo "   Please run './setup_environment.sh' first"
    exit 1
fi

# Check if Stockfish is installed
if [ ! -x ".venv/bin/stockfish" ]; then
    echo "❌ Error: Stockfish not found!"
    echo "   Please run './setup_environment.sh' first"
    exit 1
fi

# Load nvm and set up environment
echo "📦 Setting up Node.js environment..."
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    \. "$NVM_DIR/nvm.sh"
    echo "   ✅ NVM loaded"
else
    echo "❌ Error: NVM not found!"
    echo "   Please run './setup_environment.sh' first"
    exit 1
fi

# Activate virtual environment
echo "🐍 Activating Python virtual environment..."
source .venv/bin/activate
echo "   ✅ Virtual environment activated"

# Start Flask server in background
echo "🌐 Starting Flask server..."
python app.py &
FLASK_PID=$!
echo "   ✅ Flask server started (PID: $FLASK_PID)"

# Wait for Flask to start
echo "⏳ Waiting for Flask server to start..."
sleep 5

# Check if Flask is running
echo "🔍 Checking Flask server status..."
for i in {1..10}; do
    if curl -s http://localhost:5000 > /dev/null 2>&1; then
        echo "   ✅ Flask server is running on http://localhost:5000"
        break
    else
        if [ $i -eq 10 ]; then
            echo "   ❌ Flask server failed to start after 10 attempts"
            echo "   💡 Check if port 5000 is available or if there are any errors"
            cleanup
        else
            echo "   ⏳ Attempt $i/10 - waiting for Flask..."
            sleep 2
        fi
    fi
done

# Start Electron app
echo "⚡ Starting Electron application..."
npm start &
ELECTRON_PID=$!
echo "   ✅ Electron app started (PID: $ELECTRON_PID)"

echo ""
echo "🎉 Chess Demo Application Started Successfully!"
echo "==============================================="
echo "   🌐 Flask server: http://localhost:5000"
echo "   ⚡ Electron app: Should open automatically"
echo "   🏁 Stockfish: Ready for chess games"
echo ""
echo "📋 Controls:"
echo "   • Press Ctrl+C to stop both applications"
echo "   • Click on boards to start new games"
echo "   • CPU monitor shows system performance"
echo ""
echo "🎮 Enjoy your chess demo!"

# Wait for Electron process
wait $ELECTRON_PID
