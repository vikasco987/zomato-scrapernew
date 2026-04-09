import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import isDev from 'electron-is-dev';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ⚡ Load .env from the current directory exactly, not process.cwd()
dotenv.config({ path: path.join(__dirname, '.env') });

let mainWindow;
let serverProcess;

function startServer() {
    // 🚀 Start our Express Server in the background
    // In production, __dirname is the root of our app inside app.asar
    const serverPath = path.join(__dirname, 'dist', 'server.js');
    
    console.log(`[Main]: Starting server at ${serverPath}`);

    serverProcess = fork(serverPath, [], {
        env: { ...process.env, PORT: 3000, NODE_ENV: isDev ? 'development' : 'production' },
        stdio: 'inherit' // Pipe stdout/stderr to the main process terminal
    });

    serverProcess.on('error', (err) => {
        console.error(`[Server Error]: ${err}`);
    });
    
    serverProcess.on('exit', (code) => {
        console.log(`[Server]: Process exited with code ${code}`);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 850,
        title: "Kravy AI Scraper Desktop",
        backgroundColor: '#05060a',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            devTools: true // Allow inspecting in production for debugging
        },
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'public', 'favicon.ico') 
    });

    // 🕒 Wait for the server (3 seconds usually enough, but retry if needed)
    const loadUrl = () => {
        mainWindow.loadURL('http://localhost:3000').catch(() => {
            console.log('[Main]: Server not ready, retrying...');
            setTimeout(loadUrl, 1000);
        });
    };

    setTimeout(loadUrl, 2500);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Open external links in the default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
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
