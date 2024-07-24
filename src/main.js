const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let flaskProcess;
let mainWindow;

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

app.on('ready', async () => {
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

  try {
    await waitForFlaskServer();
    createWindow();
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
  if (flaskProcess) {
    flaskProcess.kill();
  }
});

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

