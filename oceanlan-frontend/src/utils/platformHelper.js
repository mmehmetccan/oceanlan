// src/utils/platformHelper.js

export const isElectron = () => {
  // Kullanıcı ajanı string'inde 'Electron' kelimesi geçiyor mu?
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.indexOf(' electron/') > -1;
};