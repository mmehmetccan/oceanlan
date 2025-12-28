// src/pages/ServerDiscoveryPage.jsx
import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../utils/axiosInstance';
import { MagnifyingGlassIcon, FireIcon, UserGroupIcon, EyeIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/solid";
import { getImageUrl } from "../utils/urlHelper";
import { ToastContext } from '../context/ToastContext';

const ServerDiscoveryPage = () => {
    const [servers, setServers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    // Sayfalama State'leri
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const navigate = useNavigate();
    const { addToast } = useContext(ToastContext);

    useEffect(() => {
        const fetchServers = async () => {
            setLoading(true);
            try {
                const query = `?search=${searchTerm}&page=${page}&limit=20`;
                const res = await axiosInstance.get(`/servers/discover/all${query}`);

                setServers(res.data.data);

                if (res.data.pagination) {
                    setTotalPages(res.data.pagination.totalPages);
                }
            } catch (error) {
                console.error(error);
                addToast('Sunucular yüklenirken hata oluştu.', 'error');
            } finally {
                setLoading(false);
            }
        };

        const timeoutId = setTimeout(() => {
            fetchServers();
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [searchTerm, page]);

    useEffect(() => {
        setPage(1);
    }, [searchTerm]);

    const handleVisitServer = (serverId) => {
        navigate(`/dashboard/server/${serverId}`);
    };

    const getRankStyle = (rank) => {
        if (rank === 1) return { backgroundColor: '#FFD700', color: 'black' };
        if (rank === 2) return { backgroundColor: '#C0C0C0', color: 'black' };
        if (rank === 3) return { backgroundColor: '#CD7F32', color: 'black' };
        return { backgroundColor: 'rgba(0, 0, 0, 0.6)', color: 'white' };
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
                {loading ? <p style={{ textAlign: 'center', width: '100%', gridColumn: '1/-1' }}>Yükleniyor...</p> : servers.map((srv) => {

                    // 🟢 DEĞİŞİKLİK: Artık hesaba gerek yok, Backend'den gelen 'rank'ı kullanıyoruz.
                    // Eğer backend eski bir veri dönerse diye fallback ekledik.
                    const rank = srv.rank || '?';

                    return (
                        <div
                            key={srv._id}
                            onClick={() => handleVisitServer(srv._id)}
                            style={{ backgroundColor: '#2f3136', borderRadius: '12px', overflow: 'hidden', transition: 'transform 0.2s', cursor: 'pointer', position: 'relative' }}
                            className="server-card"
                        >
                            {/* RANK ROZETİ */}
                            <div style={{
                                position: 'absolute',
                                top: '10px',
                                left: '10px',
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 'bold',
                                fontSize: '14px',
                                zIndex: 2,
                                boxShadow: '0 2px 5px rgba(0,0,0,0.5)',
                                ...getRankStyle(rank)
                            }}>
                                #{rank}
                            </div>

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
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleVisitServer(srv._id);
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        borderRadius: '4px',
                                        border: '1px solid #1ab199',
                                        backgroundColor: 'transparent',
                                        color: '#1ab199',
                                        cursor: 'pointer',
                                        fontWeight: 'bold',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    <EyeIcon width={18} /> İncele
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {!loading && servers.length === 0 && (
                <div style={{ textAlign: 'center', color: '#b9bbbe', marginTop: '50px' }}>
                    Aradığınız kriterlere uygun sunucu bulunamadı.
                </div>
            )}

            {!loading && totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginTop: '40px', marginBottom: '20px' }}>
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        style={{
                            padding: '10px 15px',
                            backgroundColor: page === 1 ? 'rgba(255,255,255,0.05)' : '#5865F2',
                            color: page === 1 ? '#72767d' : 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: page === 1 ? 'default' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '5px'
                        }}
                    >
                        <ChevronLeftIcon width={16} /> Önceki
                    </button>

                    <span style={{ color: '#b9bbbe', fontSize: '14px' }}>
                        Sayfa {page} / {totalPages}
                    </span>

                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        style={{
                            padding: '10px 15px',
                            backgroundColor: page === totalPages ? 'rgba(255,255,255,0.05)' : '#5865F2',
                            color: page === totalPages ? '#72767d' : 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: page === totalPages ? 'default' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '5px'
                        }}
                    >
                        Sonraki <ChevronRightIcon width={16} />
                    </button>
                </div>
            )}
        </div>
    );
};

export default ServerDiscoveryPage;