// src/context/VoiceContext.js
import React, { createContext, useState, useRef } from 'react';

export const VoiceContext = createContext();

export const VoiceProvider = ({ children }) => {
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState(null);
  const [currentServerId, setCurrentServerId] = useState(null);

  // 📢 YENİ: Ekran Paylaşımı State'leri
  const [myScreenStream, setMyScreenStream] = useState(null); // Kendi paylaştığım ekran
  const [incomingStreams, setIncomingStreams] = useState({}); // { socketId: stream } (Başkalarının ekranları)
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);

  const joinVoiceChannel = (serverId, channelId) => {
    if (currentVoiceChannelId === channelId) return;
    setCurrentVoiceChannelId(channelId);
    setCurrentServerId(serverId);
  };

  const leaveVoiceChannel = () => {
    setCurrentVoiceChannelId(null);
    setCurrentServerId(null);

    // Çıkarken ekran paylaşımı varsa kapat
    if (myScreenStream) {
        myScreenStream.getTracks().forEach(track => track.stop());
        setMyScreenStream(null);
    }
    setIncomingStreams({});
  };

  // 📢 YENİ: Gelen video akışını listeye ekle
  const addIncomingStream = (socketId, stream) => {
      console.log(`[VoiceContext] Yeni video akışı eklendi: ${socketId}`);
      setIncomingStreams(prev => ({
          ...prev,
          [socketId]: stream
      }));
  };

  // 📢 YENİ: Gelen video akışını listeden çıkar
  const removeIncomingStream = (socketId) => {
      setIncomingStreams(prev => {
          const newStreams = { ...prev };
          delete newStreams[socketId];
          return newStreams;
      });
  };

  return (
    <VoiceContext.Provider value={{
        currentVoiceChannelId,
        currentServerId,
        joinVoiceChannel,
        leaveVoiceChannel,
        // Yeni değerler
        myScreenStream,
        setMyScreenStream,
        incomingStreams,
        addIncomingStream,
        removeIncomingStream,
        isLocalSpeaking,
        setIsLocalSpeaking,
    }}>
      {children}
    </VoiceContext.Provider>
  );
};