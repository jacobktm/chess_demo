#!/bin/bash

# Script to clone, build, and install Stockfish chess engine
# This script will:
# 1. Clone the Stockfish repository
# 2. Build the engine
# 3. Copy the executable to .venv/bin/

set -e  # Exit on any error

echo "🏁 Setting up Stockfish chess engine..."

# Check if we're in the right directory
if [ ! -f "app.py" ]; then
    echo "❌ Error: This script must be run from the chess_demo directory"
    exit 1
fi

# Create .venv/bin directory if it doesn't exist
echo "📁 Creating .venv/bin directory..."
mkdir -p .venv/bin

# Clone Stockfish repository if it doesn't exist
if [ ! -d "stockfish" ]; then
    echo "📥 Cloning Stockfish repository..."
    git clone https://github.com/official-stockfish/Stockfish.git stockfish
else
    echo "✅ Stockfish repository already exists, updating..."
    cd stockfish
    git pull
    cd ..
fi

# Build Stockfish
echo "🔨 Building Stockfish..."
cd stockfish/src

# Make the build directory
make clean
make -j$(nproc) build ARCH=x86-64-modern

echo "📋 Build completed successfully!"

# Find the built executable
STOCKFISH_BINARY=$(find . -name "stockfish" -type f -executable | head -1)

if [ -z "$STOCKFISH_BINARY" ]; then
    echo "❌ Error: Could not find built Stockfish executable"
    exit 1
fi

echo "🎯 Found Stockfish binary: $STOCKFISH_BINARY"

# Copy to .venv/bin
echo "📋 Copying Stockfish to .venv/bin/..."
cp "$STOCKFISH_BINARY" "../../.venv/bin/stockfish"

# Make it executable
chmod +x "../../.venv/bin/stockfish"

# Verify the installation
if [ -x "../../.venv/bin/stockfish" ]; then
    echo "✅ Stockfish successfully installed to .venv/bin/stockfish"
    echo "🧪 Testing Stockfish installation..."
    "../../.venv/bin/stockfish" <<< "quit" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "✅ Stockfish is working correctly!"
    else
        echo "⚠️  Warning: Stockfish installation test failed"
    fi
else
    echo "❌ Error: Failed to install Stockfish"
    exit 1
fi

# Get version info
echo "📊 Stockfish version information:"
"../../.venv/bin/stockfish" <<< "uci" | grep -E "(id name|id author)" | head -2

echo ""
echo "🎉 Stockfish setup completed successfully!"
echo "📍 Location: .venv/bin/stockfish"
echo ""
echo "💡 You can now run your chess demo with:"
echo "   source .venv/bin/activate"
echo "   python app.py"
