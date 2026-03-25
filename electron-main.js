const { app, BrowserWindow } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

function startServer() {
    // 🚀 Start our Express Server in the background
    const serverPath = path.join(__dirname, 'dist', 'server.js');
    serverProcess = spawn('node', [serverPath], {
        env: { ...process.env, PORT: 3000 }
    });

    serverProcess.stdout.on('data', (data) => {
        console.log(`[Server]: ${data}`);
    });

    serverProcess.stderr.on('data', (data) => {
        console.error(`[Server Error]: ${data}`);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "Kravy AI Scraper Desktop",
        backgroundColor: '#0a0b10',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'public', 'favicon.ico') 
    });

    // 🕒 Wait a bit for the server to spin up
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:3000');
    }, 3000);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ⚡ APP LIFECYCLE
app.on('ready', () => {
    startServer();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// 🛑 CLEANUP
app.on('before-quit', () => {
    if (serverProcess) {
        serverProcess.kill();
    }
});
