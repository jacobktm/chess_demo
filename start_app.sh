#!/bin/bash

# Load nvm and set up environment
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Function to cleanup background processes
cleanup() {
    echo "Stopping applications..."
    kill $FLASK_PID 2>/dev/null
    kill $ELECTRON_PID 2>/dev/null
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

echo "Starting Chess Demo Application..."
echo "=================================="

# Start Flask server in background
echo "Starting Flask server..."
cd /home/system76/chess_demo
source .venv/bin/activate
python app.py &
FLASK_PID=$!

# Wait for Flask to start
echo "Waiting for Flask server to start..."
sleep 3

# Check if Flask is running
if curl -s http://localhost:5000 > /dev/null; then
    echo "✅ Flask server is running on http://localhost:5000"
else
    echo "❌ Flask server failed to start"
    cleanup
fi

# Start Electron app
echo "Starting Electron application..."
npm start &
ELECTRON_PID=$!

echo ""
echo "🎉 Chess Demo Application Started!"
echo "   - Flask server: http://localhost:5000"
echo "   - Electron app: Should open automatically"
echo ""
echo "Press Ctrl+C to stop both applications"

# Wait for Electron process
wait $ELECTRON_PID
