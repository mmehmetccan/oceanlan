// public/electron.cjs

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Loglama ayarları
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

let mainWindow;
let splashWindow; // Splash penceresi değişkeni

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 300,
    height: 350,
    transparent: true, // Arka plan şeffaf olabilir (köşeler oval görünür)
    frame: false,      // Pencere çerçevesi (kapatma tuşu vs) olmasın
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false // Basit splash için güvenliği biraz esnetiyoruz
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));

  // Splash kapanınca değişkeni temizle
  splashWindow.on('closed', () => (splashWindow = null));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // 👈 ÖNEMLİ: İlk başta GİZLİ oluşturuyoruz
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  // Ana pencere hazır olduğunda değil, Splash işini bitirince göstereceğiz.
}

app.whenReady().then(() => {
  createSplashWindow(); // Önce Splash'i aç
  createMainWindow();   // Ana pencereyi arkada hazırla (ama gösterme)

  if (!isDev) {
    // Dev modunda değilsek güncellemeleri kontrol et
    autoUpdater.checkForUpdates();
  } else {
    // Dev modundaysak 2 saniye bekleyip ana ekrana geç (Simülasyon)
    setTimeout(() => {
      splashWindow.close();
      mainWindow.show();
    }, 2000);
  }
});

// --- UPDATER OLAYLARI ---

// 1. Güncelleme var mı diye kontrol ediliyor
autoUpdater.on('checking-for-update', () => {
  if (splashWindow) splashWindow.webContents.send('message', 'Güncellemeler kontrol ediliyor...');
});

// 2. Güncelleme bulundu, indiriliyor
autoUpdater.on('update-available', () => {
  if (splashWindow) splashWindow.webContents.send('message', 'Güncelleme bulundu, indiriliyor...');
});

// 3. Güncelleme YOKSA -> Splash kapa, Ana pencereyi aç
autoUpdater.on('update-not-available', () => {
  if (splashWindow) {
    splashWindow.close();
  }
  if (mainWindow) {
    mainWindow.show(); // Ana pencereyi göster
  }
});

// 4. Hata olursa -> Yine de uygulamayı aç (Kullanıcı mağdur olmasın)
autoUpdater.on('error', (err) => {
  log.error(err);
  if (splashWindow) {
    splashWindow.close();
  }
  if (mainWindow) {
    mainWindow.show();
  }
});

// 5. İndirme ilerlemesi (İstersen yüzde yazdırabilirsin)
autoUpdater.on('download-progress', (progressObj) => {
  if (splashWindow) {
    const log_message = `İndiriliyor... %${Math.round(progressObj.percent)}`;
    splashWindow.webContents.send('message', log_message);
  }
});

// 6. İndirme bitti -> Kur ve Yeniden Başlat
autoUpdater.on('update-downloaded', () => {
  if (splashWindow) splashWindow.webContents.send('message', 'Kuruluyor...');

  // Sessizce kur ve yeniden başlat (önceki cevaptaki ayar)
  autoUpdater.quitAndInstall(true, true);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});