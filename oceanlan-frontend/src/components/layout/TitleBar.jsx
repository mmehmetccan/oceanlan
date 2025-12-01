// src/components/layout/TitleBar.jsx
import React, { useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { ServerContext } from '../../context/ServerContext';
import { isElectron } from '../../utils/platformHelper';
import { MinusIcon, Square2StackIcon, XMarkIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import '../../styles/TitleBar.css';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

const TitleBar = () => {
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

    const handleMinimize = () => ipcRenderer?.send('window-minimize');
    const handleMaximize = () => ipcRenderer?.send('window-maximize');
    const handleClose = () => ipcRenderer?.send('window-close');

    return (
        <div className="app-titlebar">
            {/* SOL: Logo veya Boşluk */}
            <div className="titlebar-left">
                <span className="app-name">OceanLan</span>
            </div>

            {/* ORTA: Mevcut Sayfa İsmi */}
            <div className="titlebar-center">
                <ChatBubbleLeftRightIcon className="title-icon" />
                <span>{title}</span>
            </div>

            {/* SAĞ: Pencere Kontrolleri */}
            <div className="window-controls">
                <button onClick={handleMinimize} className="win-btn min" title="Küçült">
                    <MinusIcon />
                </button>
                <button onClick={handleMaximize} className="win-btn max" title="Büyüt">
                    <Square2StackIcon />
                </button>
                <button onClick={handleClose} className="win-btn close" title="Kapat">
                    <XMarkIcon />
                </button>
            </div>
        </div>
    );
};

export default TitleBar;