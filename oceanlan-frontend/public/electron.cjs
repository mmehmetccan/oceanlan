const { app, BrowserWindow, ipcMain, desktopCapturer, session, systemPreferences, globalShortcut } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// --- DEĞİŞKENLER ---
let mainWindow;
let splashWindow;

// --- AYARLAR ---
autoUpdater.logger = require("electron-log");
autoUpdater.logger.transports.file.level = "info";
autoUpdater.autoDownload = true;

// Sesin kullanıcı etkileşimi olmadan çalabilmesi için:
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// --- 1. SPLASH PENCERESİ OLUŞTURMA ---
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    transparent: false,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    show: false, // 👈 Başta gizli (Beyaz ekranı önler)
    icon: path.join(__dirname, 'ms-icon-310x310.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const splashPath = path.join(__dirname, 'splash.html');
  splashWindow.loadFile(splashPath);

  // İçerik yüklenince göster
  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
  });

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

// --- 2. ANA PENCERE OLUŞTURMA ---
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

  // Ekran Paylaşımı İzni
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
    const appPath = app.getAppPath();
    const indexPath = path.join(appPath, 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- PENCERE KONTROLLERİ (IPC) ---
ipcMain.on('window-minimize', () => { if(mainWindow) mainWindow.minimize(); });
ipcMain.on('window-maximize', () => {
  if (mainWindow) {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => { if(mainWindow) mainWindow.close(); });

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
    if (micStatus !== 'granted') await systemPreferences.askForMediaAccess('microphone');
  }

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'display-capture', 'audio-capture', 'video-capture', 'notifications', 'mediaKeySystem'];
    if (allowedPermissions.includes(permission)) callback(true);
    else callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media' || permission === 'audio-capture' || permission === 'display-capture') return true;
    return false;
  });

  // 🟢 GLOBAL KISAYOL (Hata veren kısım burasıydı, artık doğru yerde)
  // F9 tuşuna basınca (Pencere arkada olsa bile)
  globalShortcut.register('F9', () => {
    if (mainWindow) {
        // React tarafına "F9'a basıldı" diye haber ver
        mainWindow.webContents.send('global-hotkey-pressed', 'F9');
    }
  });

  // 2. AÇILIŞ MANTIĞI
  createSplashWindow();

  // Dev modunda güncelleme kontrolünü atla
  if (!app.isPackaged) {
      setTimeout(() => {
          if(splashWindow) splashWindow.close();
          createMainWindow();
      }, 2000);
  } else {
      autoUpdater.checkForUpdates();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

// Uygulama kapanırken kısayolları temizle
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- AUTO UPDATER OLAYLARI ---
autoUpdater.on('checking-for-update', () => {});
autoUpdater.on('update-available', (info) => {
    if(splashWindow) splashWindow.webContents.send('message', 'Güncelleme bulundu, indiriliyor...');
});
autoUpdater.on('update-not-available', (info) => {
    if(splashWindow) {
        splashWindow.webContents.send('message', 'Uygulama başlatılıyor...');
        setTimeout(() => {
            splashWindow.close();
            createMainWindow();
        }, 1000);
    }
});
autoUpdater.on('error', (err) => {
    if(splashWindow) {
        splashWindow.webContents.send('message', 'Başlatılıyor...');
        setTimeout(() => {
            splashWindow.close();
            createMainWindow();
        }, 1000);
    }
});
autoUpdater.on('download-progress', (progressObj) => {
    if(splashWindow) {
        splashWindow.webContents.send('download-progress', progressObj.percent);
    }
});
autoUpdater.on('update-downloaded', (info) => {
    if(splashWindow) splashWindow.webContents.send('message', 'Yükleniyor...');
    autoUpdater.quitAndInstall(true, true);
});