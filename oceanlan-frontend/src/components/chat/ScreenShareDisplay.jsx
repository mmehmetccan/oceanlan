import React, { useContext, useEffect, useRef, useState } from 'react';
import { VoiceContext } from '../../context/VoiceContext';
import { XMarkIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/react/24/outline';
import '../../styles/ScreenShareDisplay.css';

const VideoPlayer = ({ stream, isLocal, username, onStop }) => {
    const videoRef = useRef(null);
    const wrapperRef = useRef(null);
    const [isHovered, setIsHovered] = useState(false);
    const [viewMode, setViewMode] = useState('contain');
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    useEffect(() => {
        const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFsChange);
        return () => document.removeEventListener('fullscreenchange', handleFsChange);
    }, []);

    const toggleFullscreen = () => {
        if (!wrapperRef.current) return;
        if (!document.fullscreenElement) {
            wrapperRef.current.requestFullscreen().catch(err => console.error(err));
        } else {
            document.exitFullscreen();
        }
    };

    return (
        <div
            className={`video-player-wrapper ${isFullscreen ? 'fullscreen' : ''}`}
            ref={wrapperRef}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={true}
                style={{ objectFit: viewMode }}
                className="main-video"
            />

            <div className="video-overlay-name">
                {isLocal ? 'Senin Ekranın' : `${username || 'Kullanıcı'} Ekranı`}
            </div>

            <div className={`video-controls ${isHovered || isFullscreen ? 'visible' : ''}`}>
                <div className="controls-left">
                    <button onClick={() => setViewMode(p => p === 'contain' ? 'cover' : 'contain')} className="control-btn text-btn">
                        {viewMode === 'contain' ? 'Doldur' : 'Sığdır'}
                    </button>
                </div>

                <div className="controls-right">
                    {isLocal && (
                        <button onClick={onStop} className="control-btn stop-btn" title="Yayını Durdur">
                            <XMarkIcon style={{ width: 24, height: 24 }} />
                        </button>
                    )}
                    <button onClick={toggleFullscreen} className="control-btn">
                        {isFullscreen ? <ArrowsPointingInIcon style={{width:20}}/> : <ArrowsPointingOutIcon style={{width:20}}/>}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ScreenShareDisplay = () => {
    const {
        myScreenStream,
        peersWithVideo,
        stopScreenShare,
        socket // 🟢 Kendi ID'mizi kontrol etmek için socket'i aldık
    } = useContext(VoiceContext);

    const videos = peersWithVideo || {};
    const mySocketId = socket?.id;

    // 🟢 FİLTRELEME: Eğer listede kendi Socket ID'm varsa onu çıkar (Yansımayı önle)
    const remoteStreams = Object.entries(videos).filter(([socketId]) => socketId !== mySocketId);

    const hasMyStream = !!myScreenStream;
    const peerCount = remoteStreams.length;

    // Hiç yayın yoksa gizle
    if (!hasMyStream && peerCount === 0) {
        return null;
    }

    // Grid ayarı
    const totalStreams = (hasMyStream ? 1 : 0) + peerCount;

    return (
        <div className="screen-share-grid-container" style={{ gridTemplateColumns: `repeat(${totalStreams > 1 ? 2 : 1}, 1fr)` }}>

            {/* 🟢 1. SENİN YAYININ (Sadece 1 kere görünür) */}
            {hasMyStream && (
                <VideoPlayer
                    stream={myScreenStream}
                    isLocal={true}
                    onStop={stopScreenShare}
                />
            )}

            {/* 🟢 2. DİĞER KULLANICILAR (Kendin hariç) */}
            {remoteStreams.map(([socketId, stream]) => (
                <VideoPlayer
                    key={socketId}
                    stream={stream}
                    isLocal={false}
                    username={`Kullanıcı (${socketId.substring(0,4)})`}
                />
            ))}
        </div>
    );
};

export default ScreenShareDisplay;