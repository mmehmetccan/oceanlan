// public/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getScreenSources: () => ipcRenderer.invoke('DESKTOP_CAPTURER_GET_SOURCES'),
  isElectron: true
});