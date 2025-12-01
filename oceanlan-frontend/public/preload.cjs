// public/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Ekran Kaynakları (Screen Share)
  getScreenSources: () => ipcRenderer.invoke('DESKTOP_CAPTURER_GET_SOURCES'),

  // Pencere Kontrolleri (Kapat/Büyüt/Küçült)
  minimize: () => ipcRenderer.send('window-minimize'),
  toggleMaximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Electron kontrolü
  isElectron: true
});