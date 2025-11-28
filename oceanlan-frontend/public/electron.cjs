// public/electron.cjs
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  // Paketlenmiş mi, değil mi? En güvenilir check bu:
  const isDev = !app.isPackaged;

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    icon: path.join(__dirname, 'oceanlan.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.setMenuBarVisibility(false);

  if (isDev) {
    // ==== DEV MODU: Vite server ====
    const devUrl = 'http://localhost:5173/';
    console.log('[DEV] loading:', devUrl);
    win.loadURL(devUrl);
    win.webContents.openDevTools();
  } else {
    // ==== PROD MODU: dist/index.html ====
    const appPath = app.getAppPath();          // asar kökü
    const indexPath = path.join(appPath, 'dist', 'index.html');

    console.log('[PROD] appPath:', appPath);
    console.log('[PROD] indexPath:', indexPath, 'exists =', fs.existsSync(indexPath));

    win.loadFile(indexPath);
  }

  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    console.error('[did-fail-load]', code, desc, url);
  });

  win.webContents.on('did-finish-load', () => {
    console.log('[did-finish-load]');
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
