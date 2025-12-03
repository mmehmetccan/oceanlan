// public/electron.cjs
const { app, BrowserWindow ,ipcMain,desktopCapturer,session} = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

autoUpdater.logger = require("electron-log");
autoUpdater.logger.transports.file.level = "info";

// Otomatik indirsin mi? Evet.
autoUpdater.autoDownload = true;

function createWindow() {
  // Paketlenmiş mi, değil mi? En güvenilir check bu:
  const isDev = !app.isPackaged;

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    icon: path.join(__dirname, 'ms-icon-310x310.png'),
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
      contextIsolation: true,
    },
  });

  // 👇 PENCEREYE MESAJ GÖNDEREN YARDIMCI FONKSİYON
function sendStatusToWindow(type, text) {
  // Tüm pencerelere gönder
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('update-message', { type, text });
  });
}

  //win.removeMenu();


  win.setMenuBarVisibility(false);

  ipcMain.on('window-minimize', () => win.minimize());
  ipcMain.on('window-maximize', () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window-close', () => win.close());


ipcMain.handle('DESKTOP_CAPTURER_GET_SOURCES', async (event, opts) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 300, height: 300 }, // Önizleme kalitesi
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

  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    // Medya (Kamera/Mikrofon/Ekran) izinlerini otomatik onayla
    const allowedPermissions = ['media', 'display-capture', 'notifications', 'audio-capture', 'video-capture'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  win.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    // Biz kendi modalımızı kullanacağımız için burayı pas geçebiliriz
    // veya ileride native bir pencere açtırabiliriz.
    // Şimdilik default davranışı null yaparak engelliyoruz ki bizim kod çalışsın.
    // Veya desktopCapturer kullanacağımız için buraya düşmeyebilir.
    // callback({ video: request.video, audio: request.audio });
  });

  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    console.error('[did-fail-load]', code, desc, url);
  });

  win.webContents.on('did-finish-load', () => {
    if (app.isPackaged) { // Sadece build edilmiş (.exe) versiyonda çalışsın
       autoUpdater.checkForUpdatesAndNotify();
    }
  });
}
autoUpdater.on('checking-for-update', () => {
  // sendStatusToWindow('info', 'Güncellemeler kontrol ediliyor...'); // Çok sık çıkmasın diye kapalı
  console.log('Güncellemeler kontrol ediliyor...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Yeni güncelleme bulundu, indiriliyor...');
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Güncel sürüm kullanılıyor.');
});

autoUpdater.on('error', (err) => {
  console.log('Güncelleme hatası:', err);
});

autoUpdater.on('download-progress', (progressObj) => {
  // İstersen indirme yüzdesini de loglayabilirsin
  // let log_message = "İndirme hızı: " + progressObj.bytesPerSecond;
  // log_message = log_message + ' - İndirilen ' + progressObj.percent + '%';
  // sendStatusToWindow('progress', log_message);
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Güncelleme indirildi.');
  // Frontend'e bilgi ver
  sendStatusToWindow('success', 'Güncelleme indi! Uygulama yeniden başlatılıyor...');

  // 👇 BU KOMUTUN BAŞINDAKİ // İŞARETİNİ KALDIRDIM. ARTIK OTOMATİK KURACAK.
  autoUpdater.quitAndInstall();
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
