# Chess Demo Application

A dynamic chess tournament application featuring multiple AI players with different strengths and playing styles, running on multiple boards simultaneously.

## Features

- **Dynamic Board Scaling**: Automatically adjusts the number of chess boards based on your CPU cores
- **AI Players**: 30+ unique chess personalities with different playing strengths and styles
- **Real-time Performance**: CPU monitoring and memory usage tracking
- **Responsive UI**: Intelligent grid layout that adapts to screen size
- **Memory Optimized**: Comprehensive memory leak fixes for long-running sessions

## Quick Start

### 1. Setup (One-time)
```bash
./setup_environment.sh
```

This script will:
- Create a Python virtual environment
- Install all Python dependencies
- Download, build, and install Stockfish chess engine
- Install Node.js via NVM
- Install Node.js dependencies
- Verify everything is working

### 2. Run the Application
```bash
./start_app.sh
```

This will start:
- Flask backend server (http://localhost:5000)
- Electron frontend application
- All chess engines and game logic

## Manual Setup (Alternative)

If you prefer to set up manually:

### Python Setup
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Stockfish Setup
```bash
./setup_stockfish.sh
```

### Node.js Setup
```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# Install Node.js
nvm install --lts
nvm use --lts
npm install
```

### Run Application
```bash
source .venv/bin/activate
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
npm start
```

## System Requirements

- **Python 3.7+**
- **Git** (for cloning Stockfish)
- **Make** and **GCC** (for building Stockfish)
- **curl** (for downloading NVM)
- **At least 2GB RAM** (more recommended for multiple boards)

## How It Works

### Dynamic Scaling
The application automatically detects your CPU cores and creates an optimal number of chess boards:
- **2 cores**: 4 boards minimum
- **4-8 cores**: Uses exact core count
- **8+ cores**: Up to 16 boards maximum

### Player Profiles
Each AI player has unique characteristics:
- **Strength**: UCI ELO rating (1400-3100)
- **Speed**: Thinking time per move (0.1-0.4s)
- **Depth**: Analysis depth (8-25 moves)
- **Personality**: Thematic names and playing styles

### Memory Management
- Automatic cleanup of finished games
- Thread management for player engines
- DOM cleanup for frontend components
- Process monitoring and resource tracking

## Controls

- **Click any board**: Start a new game on that board
- **CPU Monitor**: Shows real-time system performance
- **Player Profiles**: Display current players and their stats
- **Ctrl+C**: Stop the application gracefully

## Troubleshooting

### Flask Server Issues
```bash
# Check if port 5000 is in use
lsof -i :5000

# Kill existing Flask processes
pkill -f "python app.py"
```

### Node.js Issues
```bash
# Reload NVM
source ~/.bashrc
nvm use --lts
```

### Stockfish Issues
```bash
# Rebuild Stockfish
./setup_stockfish.sh
```

### Memory Issues
The application is designed to handle long-running sessions, but if you encounter memory issues:
1. Restart the application periodically
2. Reduce the number of boards by modifying the CPU core detection
3. Check system resources with the built-in CPU monitor

## Development

### File Structure
```
chess_demo/
├── app.py                 # Flask backend server
├── player_profiles.json   # AI player configurations
├── setup_environment.sh   # Complete setup script
├── setup_stockfish.sh     # Stockfish installation
├── start_app.sh          # Application startup
├── src/                  # Electron main process
├── static/               # Frontend assets
│   ├── css/             # Stylesheets
│   ├── js/              # JavaScript logic
│   └── img/             # Player profile images
└── templates/            # HTML templates
```

### Key Components
- **PlayerProfile Class**: Manages individual AI players
- **Dynamic Grid Layout**: Responsive board arrangement
- **Memory Management**: Comprehensive cleanup systems
- **Real-time Updates**: WebSocket-like polling for game state

## License

This project is part of the SIGGRAPH 2024 demonstration.

## Support

For issues or questions, check the troubleshooting section above or examine the application logs for detailed error information.
