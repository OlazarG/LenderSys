import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import './src/server.js'; // Levantamos el servidor Express

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "UsureroSystem - Gestión de Préstamos",
        icon: path.join(__dirname, 'public/favicon.ico'), // Opcional
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Cargamos la interfaz del servidor local
    // Esperamos un poco a que el servidor Express levante o reintentamos
    win.loadURL('http://localhost:3000');

    // Quitar menú por defecto
    win.setMenu(null);
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
