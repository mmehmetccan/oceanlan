// src/components/modals/JoinServerModal.jsx
import React, { useState, useContext } from 'react';
import axios from 'axios';
import { ServerContext } from '../../context/ServerContext';
import { ToastContext } from '../../context/ToastContext'; // 🟢 Toast Context Eklendi
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_URL = `${API_BASE}/api/v1/invites`;

const JoinServerModal = ({ onClose }) => {
    const [inviteCode, setInviteCode] = useState('');
    const [loading, setLoading] = useState(false);

    // Hata state'ine gerek kalmadı, toast kullanacağız
    // const [error, setError] = useState('');

    const { fetchServerDetails, fetchUserServers } = useContext(ServerContext);
    const { addToast } = useContext(ToastContext); // 🟢 addToast çekildi
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!inviteCode.trim()) {
            addToast('Lütfen geçerli bir davet kodu girin.', 'warning'); // 🟢 Uyarı Toast
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(
                `${API_URL}/${inviteCode}`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const newServerId = res.data.data.memberInfo.server;

            // 1. Yeni sunucunun detaylarını çek
            await fetchServerDetails(newServerId);

            // 2. Sol menüdeki sunucu listesini yenile
            if (fetchUserServers) {
                await fetchUserServers();
            }

            navigate(`/dashboard/server/${newServerId}`);

            // 🟢 Başarı Toast
            addToast(res.data.message || 'Sunucuya başarıyla katıldınız!', 'success');
            onClose();

        } catch (err) {
            const errorMsg = err.response?.data?.message || 'Sunucuya katılım başarısız oldu.';
            const serverId = err.response?.data?.serverId;

            // Eğer kullanıcı zaten üyeyse
            if (serverId && errorMsg.toLowerCase().includes('zaten üye')) {
                addToast('Zaten bu sunucunun üyesisiniz.', 'info'); // 🟢 Bilgi Toast
                navigate(`/dashboard/server/${serverId}`);
                onClose();
            } else {
                addToast(errorMsg, 'error'); // 🟢 Hata Toast
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h3>Davet Kodu ile Sunucuya Katıl</h3>
                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        placeholder="Davet Kodunu Girin (örn: 5d1f8a)"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value)}
                        disabled={loading}
                    />
                    <button type="submit" disabled={loading}>
                        {loading ? 'Katılıyor...' : 'Katıl'}
                    </button>
                    {/* Error mesajı artık Toast ile gösterildiği için buradan kaldırıldı */}
                </form>
                <button className="close-button" onClick={onClose}>X</button>
            </div>
        </div>
    );
};

export default JoinServerModal;