// src/components/chat/ScreenShareDisplay.jsx
import React, { useContext, useEffect, useRef, useState } from 'react';
import { VoiceContext } from '../../context/VoiceContext';
import { AuthContext } from '../../context/AuthContext';
import {
    XMarkIcon,
    ArrowsPointingOutIcon,
    ArrowsPointingInIcon,
    SpeakerWaveIcon,
    SpeakerXMarkIcon
} from '@heroicons/react/24/solid';
import '../../styles/ScreenShareDisplay.css';

const VideoPlayer = ({ stream, isLocal, username, onStop }) => {
    const videoRef = useRef(null);
    const [isMuted, setIsMuted] = useState(true); // Başlangıçta sessiz
    const [volume, setVolume] = useState(1); // Ses seviyesi (0 ile 1 arası)
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    // Ses Seviyesini ve Mute Durumunu Uygula
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = isMuted;
            videoRef.current.volume = volume;
        }
    }, [isMuted, volume]);

    const toggleExpand = () => setIsExpanded(!isExpanded);

    // Sesi Aç/Kapat Butonu
    const toggleAudio = () => {
        if (isMuted) {
            setIsMuted(false);
            if (volume === 0) setVolume(0.5); // Eğer ses 0 iken açarsa %50 yap
        } else {
            setIsMuted(true);
        }
    };

    // Slider Değişince
    const handleVolumeChange = (e) => {
        const newVol = parseFloat(e.target.value);
        setVolume(newVol);

        // Eğer slider hareket ettirilirse ve ses kapalıysa, otomatik sesi aç
        if (newVol > 0 && isMuted) {
            setIsMuted(false);
        }
        // Eğer ses 0'a çekilirse mute ikonuna dön
        if (newVol === 0) {
            setIsMuted(true);
        }
    };

    return (
        <>
            {isExpanded && <div className="expanded-backdrop" onClick={toggleExpand} style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:9998}}/>}

            <div
                className={`video-player-wrapper ${isExpanded ? 'expanded' : ''}`}
                onDoubleClick={toggleExpand}
            >
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="main-video"
                />

                <div className="video-overlay-name">
                    {username} {isLocal ? '(Sen)' : ''}
                </div>

                <div className="video-controls-bar">

                    {/* SOL: SES KONTROLLERİ (Slider Eklendi) */}
                    <div className="controls-group">
                        {!isLocal && (
                            <div className="volume-control-group">
                                {/* Mute Butonu */}
                                <button onClick={toggleAudio} className="control-btn" style={{background:'transparent', padding:0}}>
                                    {isMuted || volume === 0 ?
                                        <SpeakerXMarkIcon className="control-icon" /> :
                                        <SpeakerWaveIcon className="control-icon" />
                                    }
                                </button>

                                {/* 🟢 SES SLIDER'I */}
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={isMuted ? 0 : volume}
                                    onChange={handleVolumeChange}
                                    className="volume-slider"
                                    title={`Ses: %${Math.round(volume * 100)}`}
                                />
                            </div>
                        )}
                    </div>

                    {/* SAĞ: BÜYÜT & KAPAT */}
                    <div className="controls-group">
                        <button onClick={toggleExpand} className="control-btn" title={isExpanded ? "Küçült" : "Büyüt"}>
                            {isExpanded ? <ArrowsPointingInIcon className="control-icon"/> : <ArrowsPointingOutIcon className="control-icon"/>}
                        </button>

                        {isLocal && onStop && (
                            <button onClick={onStop} className="control-btn close-btn" title="Yayını Sonlandır">
                                <XMarkIcon className="control-icon" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

const ScreenShareDisplay = () => {
    const {
        myScreenStream,
        peersWithVideo,
        stopScreenShare,
        socket
    } = useContext(VoiceContext);

    const { user } = useContext(AuthContext);

    // Track ID Kontrolü (Yansımayı Engellemek İçin)
    const myVideoTrackId = myScreenStream?.getVideoTracks()[0]?.id;

    // Uzak Yayınları Filtrele
    const remoteStreams = Object.entries(peersWithVideo || {}).filter(([socketId, stream]) => {
        if (socket && socketId === socket.id) return false;
        if (myScreenStream && stream.id === myScreenStream.id) return false;
        const remoteTrackId = stream.getVideoTracks()[0]?.id;
        if (myVideoTrackId && remoteTrackId === myVideoTrackId) return false;
        return true;
    });

    const hasMyStream = !!myScreenStream;
    const peerCount = remoteStreams.length;

    if (!hasMyStream && peerCount === 0) return null;

    const totalStreams = (hasMyStream ? 1 : 0) + peerCount;

    return (
        <div className="screen-share-grid-container" style={{ gridTemplateColumns: `repeat(${totalStreams > 1 ? 2 : 1}, 1fr)` }}>
            {hasMyStream && (
                <VideoPlayer
                    stream={myScreenStream}
                    isLocal={true}
                    username={user?.username || 'Sen'}
                    onStop={stopScreenShare}
                />
            )}

            {remoteStreams.map(([socketId, stream]) => (
                <VideoPlayer
                    key={socketId}
                    stream={stream}
                    isLocal={false}
                    username={`Kullanıcı ${socketId.substr(0, 4)}`}
                />
            ))}
        </div>
    );
};

export default ScreenShareDisplay;