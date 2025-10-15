#!/bin/bash

# Complete environment setup script for chess_demo
# This script will:
# 1. Set up Python virtual environment
# 2. Install Python dependencies
# 3. Set up Stockfish chess engine
# 4. Install Node.js dependencies (if needed)

set -e  # Exit on any error

echo "🚀 Setting up complete chess_demo environment..."

# Check if we're in the right directory
if [ ! -f "app.py" ]; then
    echo "❌ Error: This script must be run from the chess_demo directory"
    exit 1
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 1. Set up Python virtual environment
echo ""
echo "🐍 Setting up Python virtual environment..."
if [ ! -d ".venv" ]; then
    echo "📁 Creating Python virtual environment..."
    python3 -m venv .venv
else
    echo "✅ Virtual environment already exists"
fi

# Activate virtual environment
echo "🔄 Activating virtual environment..."
source .venv/bin/activate

# 2. Install Python dependencies
echo ""
echo "📦 Installing Python dependencies..."
if [ -f "requirements.txt" ]; then
    pip install --upgrade pip
    pip install -r requirements.txt
    echo "✅ Python dependencies installed"
else
    echo "⚠️  Warning: requirements.txt not found"
fi

# 3. Set up Stockfish
echo ""
echo "🏁 Setting up Stockfish chess engine..."
if [ -x ".venv/bin/stockfish" ]; then
    echo "✅ Stockfish already installed"
else
    echo "📥 Installing Stockfish..."
    ./setup_stockfish.sh
fi

# 4. Set up Node.js (if needed)
echo ""
echo "📦 Checking Node.js setup..."
if command_exists node && command_exists npm; then
    echo "✅ Node.js and npm are available"
    if [ -f "package.json" ]; then
        echo "📦 Installing Node.js dependencies..."
        npm install
        echo "✅ Node.js dependencies installed"
    fi
else
    echo "⚠️  Node.js not found. You may need to install it manually."
    echo "   For Ubuntu/Debian: sudo apt install nodejs npm"
    echo "   Or use nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
fi

# 5. Verify setup
echo ""
echo "🧪 Verifying setup..."

# Test Python environment
echo "🐍 Testing Python environment..."
python3 -c "import flask, chess.engine, psutil; print('✅ Python dependencies working')" || {
    echo "❌ Python dependencies test failed"
    exit 1
}

# Test Stockfish
echo "🏁 Testing Stockfish..."
if [ -x ".venv/bin/stockfish" ]; then
    .venv/bin/stockfish <<< "uci" | grep -q "id name" && echo "✅ Stockfish working" || {
        echo "❌ Stockfish test failed"
        exit 1
    }
else
    echo "❌ Stockfish not found"
    exit 1
fi

# Test Node.js (if available)
if command_exists node; then
    echo "📦 Testing Node.js..."
    node --version > /dev/null && echo "✅ Node.js working" || echo "⚠️  Node.js test failed"
fi

echo ""
echo "🎉 Environment setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "   1. Activate the virtual environment:"
echo "      source .venv/bin/activate"
echo ""
echo "   2. Start the chess demo:"
echo "      python app.py"
echo ""
echo "   3. Or start with Electron (if Node.js is installed):"
echo "      npm start"
echo ""
echo "📍 Stockfish location: .venv/bin/stockfish"
echo "📍 Python environment: .venv/"
echo "📍 Node.js dependencies: node_modules/"
