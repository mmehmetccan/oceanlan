// public/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Ekran Kaynakları
  getScreenSources: () => ipcRenderer.invoke('DESKTOP_CAPTURER_GET_SOURCES'),

  // Pencere Kontrolleri
  minimize: () => ipcRenderer.send('window-minimize'),
  toggleMaximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // 👇 YENİ: Güncelleme Mesajlarını Dinle
  onUpdateMessage: (callback) => ipcRenderer.on('update-message', (_event, data) => callback(data)),

  isElectron: true
});