// src/components/layout/TitleBar.jsx
import React, { useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { ServerContext } from '../../context/ServerContext';
import { isElectron } from '../../utils/platformHelper';
import { MinusIcon, Square2StackIcon, XMarkIcon, ChatBubbleLeftRightIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import '../../styles/TitleBar.css';

const TitleBar = ({ onContactClick }) => {
    const location = useLocation();
    const { activeServer } = useContext(ServerContext);

    // Sadece Electron uygulamasındaysa göster
    if (!isElectron()) return null;

    // Başlığı belirle
    let title = "OceanLan";
    if (location.pathname.includes('/dashboard/feed')) title = "Ana Sayfa";
    else if (location.pathname.includes('/dashboard/friends')) title = "Arkadaşlar";
    else if (location.pathname.includes('/dashboard/server') && activeServer) title = activeServer.name;
    else if (location.pathname.includes('/settings')) title = "Ayarlar";

    // 👇 YENİ: Preload üzerinden fonksiyonları çağırıyoruz
    const handleMinimize = () => {
        if (window.electronAPI) window.electronAPI.minimize();
    };
    const handleMaximize = () => {
        if (window.electronAPI) window.electronAPI.toggleMaximize();
    };
    const handleClose = () => {
        if (window.electronAPI) window.electronAPI.close();
    };

    return (
        <div className="app-titlebar">
            {/* SOL: Logo veya İsim */}
            <div className="titlebar-left">
                <span className="app-name">OceanLan</span>
            </div>

            {/* ORTA: Sayfa Başlığı */}
            <div className="titlebar-center">
                <ChatBubbleLeftRightIcon className="title-icon"/>
                <span>{title}</span>
            </div>
            <div className="window-controls">

                {/* 📢 İLETİŞİM BUTONU */}
                <button
                    onClick={onContactClick}
                    className="win-btn"
                    title="İletişim / Destek"
                    style={{ color: '#b9bbbe' }}
                >
                    <EnvelopeIcon style={{width: 18, height: 18}} />
                </button>

                <button onClick={handleMinimize} className="win-btn min" title="Küçült"><MinusIcon /></button>
                <button onClick={handleMaximize} className="win-btn max" title="Büyüt"><Square2StackIcon /></button>
                <button onClick={handleClose} className="win-btn close" title="Kapat"><XMarkIcon /></button>
            </div>
        </div>
    );
};

            export default TitleBar;