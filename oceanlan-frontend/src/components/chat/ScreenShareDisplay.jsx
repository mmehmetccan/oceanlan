import React, { useContext, useEffect, useRef, useState } from 'react';
import { VoiceContext } from '../../context/VoiceContext';
import { AuthContext } from '../../context/AuthContext';
import { ServerContext } from '../../context/ServerContext';
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
    const [isMuted, setIsMuted] = useState(true);
    const [volume, setVolume] = useState(1);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = isMuted;
            videoRef.current.volume = volume;
        }
    }, [isMuted, volume]);

    const toggleExpand = () => setIsExpanded(!isExpanded);

    const toggleAudio = () => {
        if (isMuted) {
            setIsMuted(false);
            if (volume === 0) setVolume(0.5);
        } else {
            setIsMuted(true);
        }
    };

    const handleVolumeChange = (e) => {
        const newVol = parseFloat(e.target.value);
        setVolume(newVol);
        if (newVol > 0 && isMuted) setIsMuted(false);
        if (newVol === 0) setIsMuted(true);
    };

    return (
        <>
            {isExpanded && (
                <div
                    className="expanded-backdrop"
                    onClick={toggleExpand}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9998 }}
                />
            )}

            <div
                className={`video-player-wrapper ${isExpanded ? 'expanded' : ''}`}
                onDoubleClick={toggleExpand}
            >
                <video ref={videoRef} autoPlay playsInline className="main-video" />

                <div className="video-overlay-name">
                    {username} {isLocal ? '(Sen)' : ''}
                </div>

                <div className="video-controls-bar">
                    <div className="controls-group">
                        {!isLocal && (
                            <div className="volume-control-group">
                                <button onClick={toggleAudio} className="control-btn" style={{ background: 'transparent', padding: 0 }}>
                                    {isMuted || volume === 0
                                        ? <SpeakerXMarkIcon className="control-icon" />
                                        : <SpeakerWaveIcon className="control-icon" />
                                    }
                                </button>

                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={isMuted ? 0 : volume}
                                    onChange={handleVolumeChange}
                                    className="volume-slider"
                                />
                            </div>
                        )}
                    </div>

                    <div className="controls-group">
                        <button onClick={toggleExpand} className="control-btn">
                            {isExpanded
                                ? <ArrowsPointingInIcon className="control-icon" />
                                : <ArrowsPointingOutIcon className="control-icon" />
                            }
                        </button>

                        {isLocal && onStop && (
                            <button onClick={onStop} className="control-btn close-btn">
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
        socket,
        userIdBySocketId // ✅ VoiceContext’ten geliyor
    } = useContext(VoiceContext);

    const { user } = useContext(AuthContext);
    const { activeServer } = useContext(ServerContext);

    const myVideoTrackId = myScreenStream?.getVideoTracks()[0]?.id;

    const remoteStreams = Object.entries(peersWithVideo || {}).filter(([socketId, stream]) => {
        if (socket && socketId === socket.id) return false;
        if (myScreenStream && stream.id === myScreenStream.id) return false;
        const remoteTrackId = stream.getVideoTracks()[0]?.id;
        if (myVideoTrackId && remoteTrackId === myVideoTrackId) return false;
        return true;
    });

    if (!myScreenStream && remoteStreams.length === 0) return null;

    const resolveUsername = (socketId) => {
        const userId = userIdBySocketId?.[socketId];
        if (!userId || !activeServer?.members) return 'Bilinmeyen Kullanıcı';

        const member = activeServer.members.find(m => m.user._id === userId);
        return member?.user?.username || 'Bilinmeyen Kullanıcı';
    };

    return (
        <div className="screen-share-grid-container">
            {myScreenStream && (
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
                    username={resolveUsername(socketId)}
                />
            ))}
        </div>
    );
};

export default ScreenShareDisplay;
