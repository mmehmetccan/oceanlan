// public/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // PTT Olayları
  onPTTDown: (cb) => ipcRenderer.on('ptt-down', () => cb()),
  onPTTUp: (cb) => ipcRenderer.on('ptt-up', () => cb()),
  setPTTKeyCode: (code) => ipcRenderer.send('ptt:setKeyCode', code),

  // Ekran Kaynakları
  getScreenSources: () => ipcRenderer.invoke('DESKTOP_CAPTURER_GET_SOURCES'),

  // Pencere Kontrolleri
  minimize: () => ipcRenderer.send('window-minimize'),
  toggleMaximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // ✅ GÜNCELLEME TAKİBİ (Splash ve Main için ortak)
  // Bu kanal üzerinden 'message' ve 'download-progress' verilerini alabilirsin
  onUpdateMessage: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('message', subscription);
    return () => ipcRenderer.removeListener('message', subscription);
  },
  
  onDownloadProgress: (callback) => {
    const subscription = (_event, percent) => callback(percent);
    ipcRenderer.on('download-progress', subscription);
    return () => ipcRenderer.removeListener('download-progress', subscription);
  },

  isElectron: true
});