// public/electron.cjs
const { app, BrowserWindow, ipcMain, desktopCapturer, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// Loglama ayarları
autoUpdater.logger = require("electron-log");
autoUpdater.logger.transports.file.level = "info";

// Otomatik indirsin mi? Evet.
autoUpdater.autoDownload = true;

// 👇 BU FONKSİYON ARTIK DIŞARIDA (Global Scope)
// Böylece her yerden erişilebilir.
function sendStatusToWindow(type, text) {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('update-message', { type, text });
  });
}

function createWindow() {
  const isDev = !app.isPackaged;

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    icon: path.join(__dirname, 'ms-icon-310x310.png'),
    frame: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
        color: '#202225',
        symbolColor: '#ffffff',
        height: 30
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: true,
      contextIsolation: true,
    },
  });

  win.setMenuBarVisibility(false);

  // Pencere Kontrolleri
  ipcMain.on('window-minimize', () => win.minimize());
  ipcMain.on('window-maximize', () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window-close', () => win.close());

  // Ekran Paylaşımı Kaynakları
  ipcMain.handle('DESKTOP_CAPTURER_GET_SOURCES', async (event, opts) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 300, height: 300 },
        fetchWindowIcons: true
      });

      return sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL()
      }));
    } catch (error) {
      console.error("Kaynaklar alınamadı:", error);
      return [];
    }
  });

  if (isDev) {
    const devUrl = 'http://localhost:5173/';
    console.log('[DEV] loading:', devUrl);
    win.loadURL(devUrl);
  } else {
    const appPath = app.getAppPath();
    const indexPath = path.join(appPath, 'dist', 'index.html');
    console.log('[PROD] indexPath:', indexPath);
    win.loadFile(indexPath);
  }

  // İzin Yönetimi
  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'display-capture', 'notifications', 'audio-capture', 'video-capture'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  win.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    // Custom modal kullandığımız için burayı boş bırakıyoruz veya varsayılanı eziyoruz.
  });

  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    console.error('[did-fail-load]', code, desc, url);
  });

  // 👇 PENCERE YÜKLENİNCE GÜNCELLEME KONTROLÜ BAŞLASIN
  win.webContents.on('did-finish-load', () => {
    if (app.isPackaged) {
       autoUpdater.checkForUpdatesAndNotify();
    }
  });
}

// --- GÜNCELLEME OLAYLARI (Burada sendStatusToWindow kullanabiliriz) ---

autoUpdater.on('checking-for-update', () => {
  console.log('Güncellemeler kontrol ediliyor...');
  // İsterseniz bunu da açabilirsiniz:
  // sendStatusToWindow('info', 'Güncellemeler kontrol ediliyor...');
});

autoUpdater.on('update-available', (info) => {
  sendStatusToWindow('info', 'Yeni güncelleme bulundu, arka planda indiriliyor...');
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Güncel sürüm kullanılıyor.');
});

autoUpdater.on('error', (err) => {
  sendStatusToWindow('error', 'Güncelleme hatası: ' + (err.message || err));
});

autoUpdater.on('download-progress', (progressObj) => {
  // İndirme yüzdesini loglayabiliriz
  // const log_message = "İndirme hızı: " + progressObj.bytesPerSecond;
  // console.log(log_message);
});

autoUpdater.on('update-downloaded', (info) => {
  sendStatusToWindow('success', 'Güncelleme indi! Uygulama yeniden başlatılıyor...');

  // 👇 HEMEN KURULUM YAP
  setTimeout(() => {
    autoUpdater.quitAndInstall();
  }, 2000); // Kullanıcı mesajı okusun diye 2 saniye bekle
});

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