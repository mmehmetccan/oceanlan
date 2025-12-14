// src/context/AudioSettingsContext.js
import React, { createContext, useState, useEffect } from 'react';

export const AudioSettingsContext = createContext();

export const AudioSettingsProvider = ({ children }) => {
  const [inputDeviceId, setInputDeviceId] = useState(localStorage.getItem('inputDeviceId') || 'default');
  const [outputDeviceId, setOutputDeviceId] = useState(localStorage.getItem('outputDeviceId') || 'default');

  const [inputMode, setInputMode] = useState(localStorage.getItem('inputMode') || 'VOICE_ACTIVITY');

  // 🟢 PTT İÇİN GELİŞMİŞ STATE
  const [pttKey, setPttKey] = useState(localStorage.getItem('pttKey') || 'SPACE'); // Ekranda görünen isim
  const [pttKeyCode, setPttKeyCode] = useState(localStorage.getItem('pttKeyCode') || 'Space'); // Teknik kod (Key code veya Mouse button index)

  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isNoiseSuppression, setIsNoiseSuppression] = useState(localStorage.getItem('isNoiseSuppression') === 'true');

  // Güvenli inputVolume okuma
  const [inputVolume, setInputVolume] = useState(() => {
      const saved = localStorage.getItem('inputVolume');
      const parsed = parseInt(saved);
      return !isNaN(parsed) ? parsed : 100;
  });

  const [userVolumes, setUserVolumes] = useState({});

  useEffect(() => { localStorage.setItem('inputDeviceId', inputDeviceId); }, [inputDeviceId]);
  useEffect(() => { localStorage.setItem('outputDeviceId', outputDeviceId); }, [outputDeviceId]);
  useEffect(() => { localStorage.setItem('inputMode', inputMode); }, [inputMode]);

  // 🟢 PTT KAYITLARI
  useEffect(() => { localStorage.setItem('pttKey', pttKey); }, [pttKey]);
  useEffect(() => { localStorage.setItem('pttKeyCode', pttKeyCode); }, [pttKeyCode]);

  useEffect(() => { localStorage.setItem('isNoiseSuppression', isNoiseSuppression); }, [isNoiseSuppression]);
  useEffect(() => { localStorage.setItem('inputVolume', inputVolume); }, [inputVolume]);

  const setUserVolume = (userId, volume) => {
    setUserVolumes(prev => ({ ...prev, [userId]: volume }));
  };

  const toggleMic = () => setIsMicMuted(prev => !prev);
  const toggleDeafen = () => setIsDeafened(prev => !prev);
  const toggleNoiseSuppression = () => setIsNoiseSuppression(prev => !prev);

  return (
    <AudioSettingsContext.Provider value={{
      inputDeviceId, setInputDeviceId, outputDeviceId, setOutputDeviceId,
      inputMode, setInputMode,
      pttKey, setPttKey, pttKeyCode, setPttKeyCode, // 🟢 DIŞARI AKTARILDI
      isMicMuted, setIsMicMuted, isDeafened, setIsDeafened, isNoiseSuppression, setIsNoiseSuppression,
      userVolumes, setUserVolume, inputVolume, setInputVolume,
      toggleMic, toggleDeafen, toggleNoiseSuppression
    }}>
      {children}
    </AudioSettingsContext.Provider>
  );
};