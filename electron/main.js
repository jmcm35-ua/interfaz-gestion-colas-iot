const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Generar un ID único para esta ejecución
const instanceId = crypto.randomUUID();

// Por defecto userData es: %APPDATA%\UCAFlow
// Se cambiamos a una subcarpeta única por instancia ANTES del app.whenReady()
const defaultUserData = app.getPath('userData');
const isolatedPath = path.join(defaultUserData, `instances`, instanceId);

app.setPath('userData', isolatedPath);

app.whenReady().then(() => {
    const win = new BrowserWindow({
        width: 800,
        minWidth: 570,
        height: 600,

        autoHideMenuBar: true,

    });
    win.loadFile(path.join(__dirname, '../dist/UCAFlow/index.html'));

});

app.on('window-all-closed', () => {
    try {
        if (fs.existsSync(isolatedPath)) {
            // rmSync con recursive y force borra la carpeta y todo su contenido
            fs.rmSync(isolatedPath, { recursive: true, force: true });
            console.log('Datos de OPFS y sesión eliminados correctamente.');
        }
    } catch (error) {
        console.error('Error al intentar borrar la carpeta temporal:', error);
    }

    if (process.platform !== 'darwin') {
        app.quit();
    }
});