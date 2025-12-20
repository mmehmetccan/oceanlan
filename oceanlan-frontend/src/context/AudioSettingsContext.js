import React, { createContext, useState, useEffect } from 'react';

export const AudioSettingsContext = createContext();

export const AudioSettingsProvider = ({ children }) => {
  // --- STATE TANIMLARI ---
  const [inputDeviceId, setInputDeviceId] = useState(
    localStorage.getItem('inputDeviceId') || 'default'
  );
  const [outputDeviceId, setOutputDeviceId] = useState(
    localStorage.getItem('outputDeviceId') || 'default'
  );

  const [inputMode, setInputMode] = useState(
    localStorage.getItem('inputMode') || 'VOICE_ACTIVITY'
  );

  // (Mevcut) - UI / label amaçlı
  const [pttKey, setPttKey] = useState(
    localStorage.getItem('pttKey') || 'SPACE'
  );
  const [pushToTalkKey, setPushToTalkKey] = useState(
    localStorage.getItem('pushToTalkKey') || 'Space'
  );

  // ✅ GERÇEK PTT EŞLEMESİ
  // KeyboardEvent.code (Space, KeyV, KeyX)
  // veya mouse macro: MOUSE_3 / MOUSE_4 / MOUSE_5
  const [pttKeyCode, setPttKeyCode] = useState(
    localStorage.getItem('pttKeyCode') || 'Space'
  );

  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

  // String 'true' → boolean
  const [isNoiseSuppression, setIsNoiseSuppression] = useState(
    localStorage.getItem('isNoiseSuppression') === 'true'
  );

  const [userVolumes, setUserVolumes] = useState({});

  // Güvenli inputVolume
  const [inputVolume, setInputVolume] = useState(() => {
    const saved = localStorage.getItem('inputVolume');
    const parsed = parseInt(saved);
    return !isNaN(parsed) ? parsed : 100;
  });




  // --------------------------------------------------
  // 🔁 pttKeyCode → pttKey (UI LABEL SENKRONU)
  // --------------------------------------------------

    // ✅ GERÇEK PTT KODU
useEffect(() => {
  localStorage.setItem('pttKeyCode', pttKeyCode);
}, [pttKeyCode]);

// ✅ ELECTRON MAIN'E PTT KODUNU BİLDİR (GLOBAL PTT İÇİN)
useEffect(() => {
  try {
    // sadece Electron'da varsa çalışır
    window.electronAPI?.setPTTKeyCode?.(pttKeyCode);
  } catch (e) {}
}, [pttKeyCode]);



  useEffect(() => {
    if (!pttKeyCode) return;

    // Mouse macro
    if (pttKeyCode.startsWith('MOUSE_')) {
      const btn = pttKeyCode.replace('MOUSE_', '');
      setPttKey(`MOUSE ${btn}`);
      setPushToTalkKey(`Mouse ${btn}`);
      return;
    }

    // Klavye
    setPttKey(pttKeyCode.toUpperCase());
    setPushToTalkKey(pttKeyCode);
  }, [pttKeyCode]);

  // --- LOCAL STORAGE KAYITLARI ---
  useEffect(() => {
    localStorage.setItem('inputDeviceId', inputDeviceId);
  }, [inputDeviceId]);

  useEffect(() => {
    localStorage.setItem('outputDeviceId', outputDeviceId);
  }, [outputDeviceId]);

  useEffect(() => {
    localStorage.setItem('inputMode', inputMode);
  }, [inputMode]);

  useEffect(() => {
    localStorage.setItem('pttKey', pttKey);
  }, [pttKey]);

  useEffect(() => {
    localStorage.setItem('pushToTalkKey', pushToTalkKey);
  }, [pushToTalkKey]);

  // ✅ GERÇEK PTT KODU
  useEffect(() => {
    localStorage.setItem('pttKeyCode', pttKeyCode);
  }, [pttKeyCode]);

  useEffect(() => {
    localStorage.setItem('isNoiseSuppression', isNoiseSuppression);
  }, [isNoiseSuppression]);

  useEffect(() => {
    localStorage.setItem('inputVolume', inputVolume);
  }, [inputVolume]);

  // --- VOLUME ---
  const setUserVolume = (userId, volume) => {
    setUserVolumes(prev => ({
      ...prev,
      [userId]: volume
    }));
  };

  // --- TOGGLE FONKSİYONLARI ---
  const toggleMic = () => {
    setIsMicMuted(prev => !prev);
  };

  const toggleDeafen = () => {
    setIsDeafened(prev => !prev);
  };

  const toggleNoiseSuppression = () => {
    setIsNoiseSuppression(prev => !prev);
  };

  return (
    <AudioSettingsContext.Provider
      value={{
        inputDeviceId,
        setInputDeviceId,

        outputDeviceId,
        setOutputDeviceId,

        inputMode,
        setInputMode,

        // UI
        pttKey,
        setPttKey,
        pushToTalkKey,
        setPushToTalkKey,

        // 🔑 GERÇEK PTT
        pttKeyCode,
        setPttKeyCode,

        isMicMuted,
        setIsMicMuted,

        isDeafened,
        setIsDeafened,

        isNoiseSuppression,
        setIsNoiseSuppression,

        userVolumes,
        setUserVolume,

        inputVolume,
        setInputVolume,

        toggleMic,
        toggleDeafen,
        toggleNoiseSuppression
      }}
    >
      {children}
    </AudioSettingsContext.Provider>
  );
};
