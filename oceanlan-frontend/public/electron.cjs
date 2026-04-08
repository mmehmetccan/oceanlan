const { app, BrowserWindow, ipcMain, desktopCapturer, session, systemPreferences, globalShortcut } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// ✅ YENİ: Global keydown/keyup için
const { uIOhook, UiohookKey } = require('uiohook-napi');

// --- DEĞİŞKENLER ---
let mainWindow;
let splashWindow;

// ✅ YENİ: Global PTT state
let hookStarted = false;
let currentPTTCode = 'Space'; // renderer: KeyboardEvent.code ("Space", "KeyV") veya "MOUSE_3" gibi

// --- AYARLAR ---
autoUpdater.logger = require("electron-log");
autoUpdater.logger.transports.file.level = "info";
autoUpdater.autoDownload = true;


autoUpdater.requestHeaders = { "Cache-Control": "no-cache" };
autoUpdater.signals.updateCancelled(() => {
    console.log("Güncelleme iptal edildi.");
});

// Sesin kullanıcı etkileşimi olmadan çalabilmesi için:

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// 2. WebRTC için donanım hızlandırma desteğini zorla (Daha akıcı yayın için)
app.commandLine.appendSwitch('enable-exclusive-audio');

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
    show: false,
    icon: path.join(__dirname, 'ms-icon-310x310.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  let splashPath;

  if (app.isPackaged) {
    splashPath = path.join(app.getAppPath(), 'dist', 'splash.html');
  } else {
    splashPath = path.join(__dirname, 'splash.html');
  }

  splashWindow.loadFile(splashPath).catch(err => {
    console.error("Splash Yükleme Hatası:", err);
    if (app.isPackaged) {
      splashWindow.loadFile(path.join(app.getAppPath(), 'splash.html'));
    }
  });

  splashWindow.once('ready-to-show', () => splashWindow.show());

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
      contextIsolation: false,
      webSecurity: false,
      backgroundThrottling: false
    },
  });

  mainWindow.setMenuBarVisibility(false);

mainWindow.webContents.openDevTools({ mode: 'detach' });

  // Ekran Paylaşımı İzni
  mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      if (sources.length > 0) callback({ video: sources[0], audio: 'loopback' });
      else callback({ video: null, audio: null });
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
    
    const indexPath = path.join(__dirname, 'dist', 'index.html');
mainWindow.loadFile(indexPath).catch(err => {
    console.error("Ana sayfa yüklenemedi:", err);
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
});
}
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  

  // ✅ YENİ: Main window oluşunca global hook'u başlat
  startGlobalPTTHookIfNeeded();
}

// --- PENCERE KONTROLLERİ (IPC) ---
ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => { if (mainWindow) mainWindow.close(); });

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

// ✅ YENİ: Renderer ayarlardan PTT tuşunu değiştirince burası güncellenir
ipcMain.on('ptt:setKeyCode', (_event, code) => {
  if (typeof code === 'string' && code.length > 0) {
    currentPTTCode = code;
  }
});

// ✅ YENİ: yardımcı - renderer code -> uiohook key
function resolveUiohookKeyFromCode(code) {
  if (!code || typeof code !== 'string') return null;

  // Space, Enter, ShiftLeft, ControlLeft gibi özel tuşlar
  const special = {
    Space: UiohookKey.Space,
    Enter: UiohookKey.Enter,
    Escape: UiohookKey.Escape,
    Tab: UiohookKey.Tab,
    Backspace: UiohookKey.Backspace,
    ShiftLeft: UiohookKey.Shift,
    ShiftRight: UiohookKey.Shift,
    ControlLeft: UiohookKey.Ctrl,
    ControlRight: UiohookKey.Ctrl,
    AltLeft: UiohookKey.Alt,
    AltRight: UiohookKey.Alt,
    ArrowUp: UiohookKey.Up,
    ArrowDown: UiohookKey.Down,
    ArrowLeft: UiohookKey.Left,
    ArrowRight: UiohookKey.Right,
  };

  if (special[code]) return special[code];

  // KeyA..KeyZ -> A..Z
  if (code.startsWith('Key') && code.length === 4) {
    const letter = code.slice(3).toUpperCase(); // A
    return UiohookKey[letter] ?? null;
  }

  // Digit0..Digit9 -> 0..9 (bazı enumlarda "0" isimli alan olmayabilir; o yüzden kontrollü)
  if (code.startsWith('Digit') && code.length === 6) {
    const d = code.slice(5); // "0".."9"
    return UiohookKey[d] ?? null;
  }

  // F1..F12
  if (/^F\d{1,2}$/.test(code)) {
    return UiohookKey[code] ?? null;
  }

  return null;
}

// ✅ YENİ: renderer MOUSE_0..4 -> libuiohook button 1..5
// Browser: 0 left, 1 middle, 2 right, 3 back, 4 forward
// libuiohook: 1 left, 2 right, 3 middle, 4 x1(back), 5 x2(forward) :contentReference[oaicite:5]{index=5}
function resolveUiohookMouseButtonFromRenderer(code) {
  if (!code || typeof code !== 'string' || !code.startsWith('MOUSE_')) return null;

  const n = Number(code.replace('MOUSE_', ''));
  if (!Number.isFinite(n)) return null;

  if (n === 0) return 1; // left
  if (n === 2) return 2; // right
  if (n === 1) return 3; // middle
  if (n === 3) return 4; // back
  if (n === 4) return 5; // forward

  // Eğer ileride zaten 4/5 gibi kaydederse direkt kabul et
  if (n >= 1 && n <= 5) return n;

  return null;
}

function sendToRenderer(channel) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel);
  }
}

// ✅ YENİ: Global hook (oyun odaktayken bile bas-konuş)
function startGlobalPTTHookIfNeeded()
{
  if (hookStarted) return;
  hookStarted = true;

  uIOhook.on('keydown', (e) => {
    // klavye PTT
    if (!currentPTTCode || currentPTTCode.startsWith('MOUSE_')) return;

    const target = resolveUiohookKeyFromCode(currentPTTCode);
    if (!target) return;

    if (e.keycode === target) {
      sendToRenderer('ptt-down');
    }
  });

  uIOhook.on('keyup', (e) => {
    if (!currentPTTCode || currentPTTCode.startsWith('MOUSE_')) return;

    const target = resolveUiohookKeyFromCode(currentPTTCode);
    if (!target) return;

    if (e.keycode === target) {
      sendToRenderer('ptt-up');
    }
  });

  uIOhook.on('mousedown', (e) => {
    // mouse PTT
    if (!currentPTTCode || !currentPTTCode.startsWith('MOUSE_')) return;

    const btn = resolveUiohookMouseButtonFromRenderer(currentPTTCode);
    if (!btn) return;

    if (e.button === btn) {
      sendToRenderer('ptt-down');
    }
  });

  uIOhook.on('mouseup', (e) => {
    if (!currentPTTCode || !currentPTTCode.startsWith('MOUSE_')) return;

    const btn = resolveUiohookMouseButtonFromRenderer(currentPTTCode);
    if (!btn) return;

    if (e.button === btn) {
      sendToRenderer('ptt-up');
    }
  });

  uIOhook.start();
}

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

  // 🟢 GLOBAL KISAYOL (senin F9 örneğin kalsın)
  globalShortcut.register('F9', () => {
    if (mainWindow) {
      mainWindow.webContents.send('global-hotkey-pressed', 'F9');
    }
  });


  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: true, // Açılışta başlat
      path: app.getPath('exe'), // Uygulamanın çalıştırılabilir dosya yolu
      openAsHidden: false // Arka planda gizli başlamasın, direkt açılsın (Steam gibi)
    });
  }

  globalShortcut.register('F9', () => {
    if (mainWindow) {
      mainWindow.webContents.send('global-hotkey-pressed', 'F9');
    }
  });



  // 2. AÇILIŞ MANTIĞI


  createSplashWindow();



  // Dev modunda güncelleme kontrolünü atla
  if (!app.isPackaged) {
    setTimeout(() => {
      if (splashWindow) splashWindow.close();
      createMainWindow();
    }, 2000);
  } else {
    autoUpdater.checkForUpdates();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

// Uygulama kapanırken kısayolları temizle + hook'u durdur
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  try { uIOhook.stop(); } catch (e) { }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- AUTO UPDATER OLAYLARI ---
autoUpdater.on('checking-for-update', () => { 
  console.log("Güncelleme kontrol ediliyor...");
});

autoUpdater.on('update-available', (info) => {
  if (splashWindow) {
    splashWindow.webContents.send('message', `Yeni sürüm (${info.version}) bulundu, indiriliyor...`);
  }
});autoUpdater.on('update-not-available', (info) => {
  if (splashWindow) {
    splashWindow.webContents.send('message', 'Uygulama güncel, başlatılıyor...');
    setTimeout(() => {
      if (splashWindow) splashWindow.close();
      createMainWindow();
    }, 1000);
  }
});

// ❌ BEYAZ EKRAN ÇÖZÜMÜ: Hata olsa bile ana pencereyi aç
autoUpdater.on('error', (err) => {
  console.error("Güncelleme hatası:", err);
  if (splashWindow) {
    splashWindow.webContents.send('message', 'Güncelleme sunucusuna bağlanılamadı. Uygulama başlatılıyor...');
    setTimeout(() => {
      if (splashWindow) splashWindow.close();
      if (!mainWindow) createMainWindow(); // Hata durumunda ana pencereyi zorla aç
    }, 2000);
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  if (splashWindow) {
    // İlerlemeyi logla ve splash penceresine gönder
    console.log(`İndirme yüzdesi: ${progressObj.percent}`);
    splashWindow.webContents.send('download-progress', progressObj.percent);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  if (splashWindow) splashWindow.webContents.send('message', 'Güncelleme hazır, yükleniyor...');
  // quitAndInstall(isSilent, isForceRunAfter)
  autoUpdater.quitAndInstall(false, true);
});
