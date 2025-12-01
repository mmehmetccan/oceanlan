// public/electron.cjs
const { app, BrowserWindow ,ipcMain,desktopCapturer} = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');


function createWindow() {
  // Paketlenmiş mi, değil mi? En güvenilir check bu:
  const isDev = !app.isPackaged;

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    icon: path.join(__dirname, 'oceanlanlogo.png'),
    frame: false, // 👈 1. Çerçeveyi tamamen kaldırıyoruz (Kendi barımızı yapacağız)
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
        color: '#202225',      // Sidebar renginizle aynı yapıldı
        symbolColor: '#ffffff', // Buton ikonları (X, -, □) beyaz olsun
        height: 30              // Çubuğun yüksekliği
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.removeMenu();


  win.setMenuBarVisibility(false);

  ipcMain.on('window-minimize', () => win.minimize());
  ipcMain.on('window-maximize', () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window-close', () => win.close());
ipcMain.handle('DESKTOP_CAPTURER_GET_SOURCES', async (event, opts) => {
  const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL()
  }));
});

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
