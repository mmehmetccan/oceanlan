// src/components/modals/JoinServerModal.jsx
import React, { useState, useContext } from 'react';
import axios from 'axios';
import { ServerContext } from '../../context/ServerContext';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_URL = `${API_BASE}/api/v1/invites`;

const JoinServerModal = ({ onClose }) => {
    const [inviteCode, setInviteCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // 👇 fetchUserServers fonksiyonunu context'ten alıyoruz
    const { fetchServerDetails, fetchUserServers } = useContext(ServerContext);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!inviteCode) {
            setError('Lütfen bir davet kodu girin.');
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

            // 2. 📢 KRİTİK ADIM: Sol menüdeki sunucu listesini yenile
            if (fetchUserServers) {
                await fetchUserServers();
            }

            navigate(`/dashboard/server/${newServerId}`);
            alert(res.data.message);
            onClose();

        } catch (err) {
            const errorMsg = err.response?.data?.message || 'Sunucuya katılım başarısız oldu.';
            setError(errorMsg);

            const serverId = err.response?.data?.serverId;
            if (serverId && errorMsg.includes('zaten üyesiniz')) {
                navigate(`/dashboard/server/${serverId}`);
                onClose();
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
                    {error && <p className="error-message">{error}</p>}
                </form>
                <button className="close-button" onClick={onClose}>X</button>
            </div>
        </div>
    );
};

export default JoinServerModal;