// src/pages/ServerDiscoveryPage.jsx
import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../utils/axiosInstance';
import { MagnifyingGlassIcon, FireIcon, UserGroupIcon } from "@heroicons/react/24/solid";
import { getImageUrl } from "../utils/urlHelper";
// 🔴 react-toastify yerine projenin kendi context'ini kullanıyoruz
import { ToastContext } from '../context/ToastContext';

const ServerDiscoveryPage = () => {
    const [servers, setServers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    // ✅ Context'ten addToast fonksiyonunu alıyoruz
    const { addToast } = useContext(ToastContext);

    useEffect(() => {
        const fetchServers = async () => {
            setLoading(true);
            try {
                const query = searchTerm ? `?search=${searchTerm}` : '';
                const res = await axiosInstance.get(`/servers/discover/all${query}`);
                setServers(res.data.data);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };

        const timeoutId = setTimeout(() => {
            fetchServers();
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [searchTerm]);

    const handleJoin = async (serverId) => {
        try {
            const res = await axiosInstance.post(`/servers/${serverId}/join-public`);
            if (res.data.status === 'pending') {
                addToast('Katılım isteği gönderildi.', 'info');
            } else {
                addToast('Sunucuya katıldın!', 'success');
                navigate(`/dashboard/server/${serverId}`);
            }
        } catch (error) {
            if (error.response?.data?.message === 'Zaten üyesiniz.') {
                navigate(`/dashboard/server/${serverId}`);
            } else {
                addToast(error.response?.data?.message || 'Hata oluştu', 'error');
            }
        }
    };

    return (
        <div className="discovery-page" style={{ padding: '40px', color: 'white', flex: 1, overflowY: 'auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                <h1 style={{ fontSize: '32px', marginBottom: '10px' }}>Sunucuları Keşfet</h1>
                <p style={{ color: '#b9bbbe', marginBottom: '30px' }}>Topluluklara katıl, yeni arkadaşlar edin ve seviyeni yükselt.</p>

                <div style={{ position: 'relative', maxWidth: '500px', margin: '0 auto' }}>
                    <MagnifyingGlassIcon style={{ width: 20, position: 'absolute', left: 15, top: 12, color: '#b9bbbe' }} />
                    <input
                        type="text"
                        placeholder="Sunucu ara..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%', padding: '12px 12px 12px 45px', borderRadius: '8px', border: 'none',
                            backgroundColor: '#202225', color: 'white', fontSize: '16px'
                        }}
                    />
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                {loading ? <p>Yükleniyor...</p> : servers.map(srv => (
                    <div key={srv._id} style={{ backgroundColor: '#2f3136', borderRadius: '12px', overflow: 'hidden', transition: 'transform 0.2s' }} className="server-card">
                        <div style={{ height: '100px', backgroundColor: srv.iconUrl ? 'transparent' : '#1ab199', backgroundImage: srv.iconUrl ? `url(${getImageUrl(srv.iconUrl)})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }}>
                            {!srv.iconUrl && <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px', fontWeight: 'bold', opacity: 0.3 }}>{srv.name.charAt(0)}</div>}
                        </div>

                        <div style={{ padding: '15px' }}>
                            <h3 style={{ margin: '0 0 5px 0', fontSize: '18px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{srv.name}</h3>

                            <div style={{ display: 'flex', gap: '15px', fontSize: '12px', color: '#b9bbbe', marginBottom: '15px' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Toplam Güç">
                                    <FireIcon width={14} color="#FFD700" /> {srv.totalLevel} XP
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <UserGroupIcon width={14} /> {srv.memberCount} Üye
                                </span>
                            </div>

                            <button
                                onClick={() => handleJoin(srv._id)}
                                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: 'none', backgroundColor: '#1ab199', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                Katıl
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {!loading && servers.length === 0 && (
                <div style={{ textAlign: 'center', color: '#b9bbbe', marginTop: '50px' }}>
                    Hiç sunucu bulunamadı.
                </div>
            )}
        </div>
    );
};

export default ServerDiscoveryPage;