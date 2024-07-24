const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');

let flaskProcess;
let mainWindow;
let memoryCheckInterval;

// Function to wait for the Flask server to start
function waitForFlaskServer() {
  return new Promise((resolve, reject) => {
    const maxRetries = 20;
    let retries = 0;

    const checkServer = () => {
      const request = http.get('http://127.0.0.1:5000', (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      });

      request.on('error', retry);
      request.end();
    };

    const retry = () => {
      retries += 1;
      if (retries < maxRetries) {
        setTimeout(checkServer, 1000);
      } else {
        reject(new Error('Flask server did not start in time.'));
      }
    };

    checkServer();
  });
}

// Function to create the Electron window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
    }
  });

  mainWindow.loadURL('http://127.0.0.1:5000');
  mainWindow.maximize();

  mainWindow.on('closed', function () {
    mainWindow = null;
  });

  // Remove the application menu
  Menu.setApplicationMenu(null);
}

// Function to start the Flask server
function startFlaskServer() {
  flaskProcess = spawn('python3', ['app.py'], { cwd: path.join(__dirname, '..') });

  flaskProcess.stdout.on('data', (data) => {
    console.log(`Flask stdout: ${data}`);
  });

  flaskProcess.stderr.on('data', (data) => {
    console.error(`Flask stderr: ${data}`);
  });

  flaskProcess.on('close', (code) => {
    console.log(`Flask process exited with code ${code}`);
  });
}

// Function to stop the Flask server
function stopFlaskServer() {
  if (flaskProcess) {
    flaskProcess.kill();
    flaskProcess = null;
  }
}

// Function to restart the Electron app
function restartApp() {
  stopFlaskServer();
  app.relaunch();
  app.exit();
}

// Function to monitor system memory
function monitorMemory(thresholdMB) {
  memoryCheckInterval = setInterval(() => {
    const freeMemoryMB = os.freemem() / 1024 / 1024;
    console.log(`Available memory: ${freeMemoryMB.toFixed(2)} MB`);

    if (freeMemoryMB < thresholdMB) {
      console.warn(`Memory is below threshold (${thresholdMB} MB). Restarting app.`);
      clearInterval(memoryCheckInterval);
      restartApp();
    }
  }, 5000); // Check every 5 seconds
}

// Main app event listeners
app.on('ready', async () => {
  startFlaskServer();

  try {
    await waitForFlaskServer();
    createWindow();
    monitorMemory(8000); // Set memory threshold to 500 MB
  } catch (err) {
    console.error(err);
    app.quit();
  }
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  stopFlaskServer();
  clearInterval(memoryCheckInterval);
});

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});