// public/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

  onPTTDown: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('ptt-down', handler);
    return () => ipcRenderer.removeListener('ptt-down', handler);
  },
  onPTTUp: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('ptt-up', handler);
    return () => ipcRenderer.removeListener('ptt-up', handler);
  },

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