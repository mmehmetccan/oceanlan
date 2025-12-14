const { app, BrowserWindow, ipcMain, desktopCapturer, session, systemPreferences } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// --- DEĞİŞKENLER ---
let mainWindow;
let splashWindow;

// --- AYARLAR ---
autoUpdater.logger = require("electron-log");
autoUpdater.logger.transports.file.level = "info";
autoUpdater.autoDownload = true; // Otomatik indirsin

// Sesin kullanıcı etkileşimi olmadan çalabilmesi için kritik:
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// --- 1. SPLASH PENCERESİ OLUŞTURMA ---
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    transparent: false,
    frame: false, // Çerçevesiz
    alwaysOnTop: true,
    resizable: false,
    center: true,
    icon: path.join(__dirname, 'ms-icon-310x310.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Splash için basit yapı yeterli
    },
  });

  // splash.html dosyasını yükle (Bu dosyayı oluşturmayı unutma!)
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

// --- 2. ANA PENCERE OLUŞTURMA (Senin eski createWindow fonksiyonun) ---
function createMainWindow() {
  const isDev = !app.isPackaged;

  mainWindow = new BrowserWindow({
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
      webSecurity: true,
      backgroundThrottling: false
    },
  });

  mainWindow.setMenuBarVisibility(false);

  // Ekran Paylaşımı İzni (Loopback Audio)
  mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      if (sources.length > 0) {
        callback({ video: sources[0], audio: 'loopback' });
      } else {
        callback({ video: null, audio: null });
      }
    }).catch(err => {
      console.error("Ekran kaynakları alınamadı:", err);
      callback({ video: null, audio: null });
    });
  });

  // Yükleme
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173/');
  } else {
    // Burada app.getAppPath() kullanımı bazen dist yolunu şaşırabilir,
    // __dirname daha güvenli olabilir ama senin yapında çalışıyorsa kalsın.
    // Eğer beyaz ekran alırsan burayı kontrol et.
    const appPath = app.getAppPath();
    const indexPath = path.join(appPath, 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- PENCERE KONTROLLERİ (IPC) ---
ipcMain.on('window-minimize', () => {
    if(mainWindow) mainWindow.minimize();
});
ipcMain.on('window-maximize', () => {
  if (mainWindow) {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => {
    if(mainWindow) mainWindow.close();
});

// --- EKRAN PAYLAŞIMI KAYNAKLARI ---
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

// --- APP READY (BAŞLANGIÇ NOKTASI) ---
app.whenReady().then(async () => {

  // 1. İZİNLER
  if (process.platform === 'darwin') {
    const micStatus = await systemPreferences.getMediaAccessStatus('microphone');
    if (micStatus !== 'granted') {
      await systemPreferences.askForMediaAccess('microphone');
    }
  }

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'display-capture', 'audio-capture', 'video-capture', 'notifications', 'mediaKeySystem'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media' || permission === 'audio-capture' || permission === 'display-capture') return true;
    return false;
  });

  // 2. AÇILIŞ MANTIĞI
  // Önce Splash ekranını açıyoruz
  createSplashWindow();

  // Eğer geliştirme ortamıysa güncellemeyi pas geç, 2 saniye sonra ana ekranı aç
  if (!app.isPackaged) {
      setTimeout(() => {
          if(splashWindow) splashWindow.close();
          createMainWindow();
      }, 2000);
  } else {
      // Üretim ortamıysa (exe ise) güncellemeyi denetle
      autoUpdater.checkForUpdates();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- AUTO UPDATER OLAYLARI (Splash Screen ile İletişim) ---

autoUpdater.on('checking-for-update', () => {
    // Splash ekrana bilgi gönderilebilir (opsiyonel)
});

// Güncelleme VAR: Splash'e bilgi ver
autoUpdater.on('update-available', (info) => {
    if(splashWindow) splashWindow.webContents.send('message', 'Güncelleme bulundu, indiriliyor...');
});

// Güncelleme YOK: Splash'i kapat, Ana Ekranı Aç
autoUpdater.on('update-not-available', (info) => {
    if(splashWindow) {
        splashWindow.webContents.send('message', 'Uygulama başlatılıyor...');
        setTimeout(() => {
            splashWindow.close();
            createMainWindow();
        }, 1000);
    }
});

// Hata Oldu: Splash'i kapat, Ana Ekranı Aç (Kullanıcıyı engelleme)
autoUpdater.on('error', (err) => {
    if(splashWindow) {
        splashWindow.webContents.send('message', 'Başlatılıyor...'); // Hatayı kullanıcıya göstermeyebiliriz
        setTimeout(() => {
            splashWindow.close();
            createMainWindow();
        }, 1000);
    }
});

// İndirme İlerlemesi: Splash'e yüzdeyi gönder
autoUpdater.on('download-progress', (progressObj) => {
    if(splashWindow) {
        splashWindow.webContents.send('download-progress', progressObj.percent);
    }
});

// İndirme Bitti: Kur ve Yeniden Başlat
autoUpdater.on('update-downloaded', (info) => {
    if(splashWindow) splashWindow.webContents.send('message', 'Yükleniyor...');
    autoUpdater.quitAndInstall(true, true);
});