const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        minWidth: 570,
        height: 600,

        // Corrección aquí: '../dist' en lugar de '..dist'
        icon: path.join(__dirname, '../assets/icons/icon.ico'),
        autoHideMenuBar: true,

        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile(path.join(__dirname, '../dist/fuse/index.html'));
}

app.whenReady().then(createWindow);