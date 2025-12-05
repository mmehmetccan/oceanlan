// src/components/chat/VoiceConnectionManager.jsx
import React, { useEffect, useContext } from 'react';
import { useVoiceChannel } from '../../hooks/useVoiceChannel';
import { VoiceContext } from '../../context/VoiceContext';

const VoiceConnectionManager = () => {
    // Ses mantığını (WebRTC) burada çalıştırıyoruz
    const { startScreenShare, stopScreenShare } = useVoiceChannel();
    const { setScreenShareMethods } = useContext(VoiceContext);

    // Fonksiyonları Context'e aktar ki VoiceRoom (UI) kullanabilsin
    useEffect(() => {
        setScreenShareMethods({ startScreenShare, stopScreenShare });
    }, [startScreenShare, stopScreenShare, setScreenShareMethods]);

    // Bu bileşen görünmezdir (Render etmez)
    return null;
};

export default VoiceConnectionManager;