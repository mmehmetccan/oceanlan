const { app, BrowserWindow, ipcMain, desktopCapturer, session, systemPreferences } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// --- AYARLAR ---
autoUpdater.logger = require("electron-log");
autoUpdater.logger.transports.file.level = "info";
autoUpdater.autoDownload = true;

// Sesin kullanıcı etkileşimi olmadan çalabilmesi için kritik:
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// --- HELPER: GÜNCELLEME İLETİŞİMİ ---
function sendStatusToWindow(type, text) {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('update-message', { type, text });
  });
}

// --- ANA PENCERE OLUŞTURMA ---
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
      // Güvenlik politikasını biraz gevşeterek WebRTC'nin rahat çalışmasını sağlar
      webSecurity: true,
      backgroundThrottling: false // Pencere alta inince mikrofonun kesilmemesi için
    },
  });

  win.setMenuBarVisibility(false);


  win.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      // Otomatik olarak Birinci Ekranı seç (Kullanıcıya sormadan başlatır)
      // Eğer birden fazla ekran varsa listedeki ilkini alır.
      if (sources.length > 0) {
        callback({ video: sources[0], audio: 'loopback' });
      } else {
        // Ekran bulunamazsa
        callback({ video: null, audio: null });
      }
    }).catch(err => {
      console.error("Ekran kaynakları alınamadı:", err);
      callback({ video: null, audio: null });
    });
  });

  // Pencere Kontrolleri
  ipcMain.on('window-minimize', () => win.minimize());
  ipcMain.on('window-maximize', () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window-close', () => win.close());

  // Ekran Paylaşımı
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

  // Yükleme
  if (isDev) {
    const devUrl = 'http://localhost:5173/';
    win.loadURL(devUrl);
  } else {
    const appPath = app.getAppPath();
    const indexPath = path.join(appPath, 'dist', 'index.html');
    win.loadFile(indexPath);
  }

  win.webContents.on('did-finish-load', () => {
    if (app.isPackaged) {
       autoUpdater.checkForUpdatesAndNotify();
    }
  });
}

// --- GÜNCELLEME OLAYLARI ---
autoUpdater.on('checking-for-update', () => console.log('Güncelleme kontrol ediliyor...'));
autoUpdater.on('update-available', (info) => sendStatusToWindow('info', 'Güncelleme indiriliyor...'));
autoUpdater.on('update-not-available', (info) => console.log('Güncel.'));
autoUpdater.on('error', (err) => sendStatusToWindow('error', 'Hata: ' + err.message));
autoUpdater.on('update-downloaded', (info) => {
  console.log('İndirildi, yükleniyor...');
  autoUpdater.quitAndInstall(true, true);
});

// --- APP READY (SIRALAMA DÜZELTİLDİ) ---
app.whenReady().then(async () => {

  // 1. ADIM: macOS İZİNLERİ (Mac kullanmasan bile kodda durmalı)
  if (process.platform === 'darwin') {
    const micStatus = await systemPreferences.getMediaAccessStatus('microphone');
    if (micStatus !== 'granted') {
      await systemPreferences.askForMediaAccess('microphone');
    }
  }

  // 2. ADIM: OTOMATİK İZİN YÖNETİCİSİ (Pencere açılmadan önce!)
  // `session.defaultSession` tüm pencereleri kapsar.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = [
      'media',          // Mikrofon/Kamera
      'display-capture', // Ekran Paylaşımı
      'audio-capture',
      'video-capture',
      'notifications',
      'mediaKeySystem'
    ];

    if (allowedPermissions.includes(permission)) {
      callback(true); // Otomatik onayla
    } else {
      console.log(`İzin reddedildi: ${permission}`);
      callback(false);
    }
  });

  // 3. ADIM: İZİN KONTROL (Check Handler)
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media' || permission === 'audio-capture' || permission === 'display-capture') {
      return true;
    }
    return false;
  });

  // 4. ADIM: PENCEREYİ OLUŞTUR (Artık her şey hazır)
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