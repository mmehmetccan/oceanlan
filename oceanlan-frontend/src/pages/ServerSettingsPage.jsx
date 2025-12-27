// src/pages/ServerSettingsPage.jsx
import React, { useContext, useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ServerContext } from '../context/ServerContext';
import { AuthContext } from '../context/AuthContext';
import { ToastContext } from '../context/ToastContext';
import { checkUserPermission } from '../utils/permissionChecker';
import { useServerSocket } from '../hooks/useServerSocket';
import DeleteServerModal from '../components/modals/DeleteServerModal';
import ConfirmationModal from '../components/modals/ConfirmationModal';
import axios from 'axios';
import axiosInstance from '../utils/axiosInstance';
// 🟢 YENİ EKLENEN İKONLAR
import { GlobeAltIcon, MapIcon } from '@heroicons/react/24/solid';

import '../styles/ServerSettings.css';

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// İzinlerin listesi
const PERMISSIONS_LIST = [
  'ADMINISTRATOR', 'MANAGE_SERVER', 'MANAGE_ROLES', 'MANAGE_CHANNELS',
  'KICK_MEMBERS', 'BAN_MEMBERS', 'CREATE_INVITE', 'SEND_MESSAGES',
  'MANAGE_MESSAGES', 'VOICE_SPEAK', 'MUTE_MEMBERS', 'DEAFEN_MEMBERS'
];

// Üye rol yöneticisi
const MemberRoleManager = ({ member, serverRoles, serverId, onUpdate }) => {
  const [memberRoles, setMemberRoles] = useState(new Set(member.roles.map(r => r._id)));
  const { addToast } = useContext(ToastContext);

  const handleRoleToggle = async (roleId) => {
    const newRolesSet = new Set(memberRoles);
    if (newRolesSet.has(roleId)) {
      newRolesSet.delete(roleId);
    } else {
      newRolesSet.add(roleId);
    }
    setMemberRoles(newRolesSet);
    try {
      await axios.put(
        `${API_URL_BASE}/api/v1/servers/${serverId}/members/${member._id}/roles`,
        { roles: Array.from(newRolesSet) }
      );
      onUpdate();
    } catch (error) {
      addToast(`Hata: ${error.response?.data?.message}`, 'error');
      setMemberRoles(new Set(member.roles.map(r => r._id)));
    }
  };

  return (
    <div className="member-role-manager">
      <h4 className="member-role-manager-title">
        <span className="member-role-manager-username">{member.user.username}</span> için roller
      </h4>
      <div className="permissions-grid">
        {serverRoles
          .filter(role => role.name !== '@everyone')
          .map(role => (
            <label
              key={role._id}
              className="role-checkbox-chip"
            >
              <input
                type="checkbox"
                checked={memberRoles.has(role._id)}
                onChange={() => handleRoleToggle(role._id)}
              />
              <span
                className="role-checkbox-color-dot"
                style={{ backgroundColor: role.color || '#99AAB5' }}
              />
              <span className="role-checkbox-label">{role.name}</span>
            </label>
          ))}
      </div>
    </div>
  );
};

const ServerSettingsPage = () => {
  const { serverId } = useParams();
  const { activeServer, loading, fetchServerDetails, fetchUserServers } = useContext(ServerContext);
  const { user } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('overview');
  const serverMemberCount = activeServer?.members?.length ?? activeServer?.memberCount ?? 0;

  // Rol yönetimi
  const [selectedRole, setSelectedRole] = useState(null);
  const [newRoleName, setNewRoleName] = useState('Yeni Rol');
  const [newRoleColor, setNewRoleColor] = useState('#99AAB5');
  const [newRolePermissions, setNewRolePermissions] = useState([]);
  const [requests, setRequests] = useState([]); // Gelen istekler

  // Kanal yönetimi
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [channelForm, setChannelForm] = useState({
    name: '',
    type: 'text',
    maxUsers: 10,
    allowedRoles: []
  });

  // Üye yönetimi
  const [managingMember, setManagingMember] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Yasaklılar + ikon
  const [bannedUsers, setBannedUsers] = useState([]);
  const [serverIconFile, setServerIconFile] = useState(null);

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    isDanger: false
  });

  useServerSocket(serverId);



  // 2. İSTEKLERİ ÇEKEN EFFECT
  useEffect(() => {
    if (activeTab === 'requests' && serverId) {
      axiosInstance.get(`${API_URL_BASE}/api/v1/servers/${serverId}/requests`)
        .then(res => setRequests(res.data.data))
        .catch(err => console.error(err));
    }
  }, [activeTab, serverId]);

  const handleRequestResponse = async (requestId, status) => { // status: 'accepted' | 'rejected'
    try {
      const res = await axiosInstance.post(`${API_URL_BASE}/api/v1/servers/${serverId}/requests/${requestId}`, { status });
      addToast(res.data.message, 'success');
      // Listeden çıkar
      setRequests(prev => prev.filter(r => r._id !== requestId));
      if (status === 'accepted') {
        fetchServerDetails(serverId); // Üye sayısını güncellemek için
      }
    } catch (error) {
      addToast(error.response?.data?.message || 'İşlem başarısız', 'error');
    }
  };

  const handleVisibilityUpdate = async (isPublic, joinMode) => {
    try {
      await axiosInstance.put(`${API_URL_BASE}/api/v1/servers/${serverId}`, {
        isPublic, joinMode
      });
      addToast('Sunucu görünürlük ayarları güncellendi', 'success');
      fetchServerDetails(serverId);
    } catch (error) {
      addToast(error.response?.data?.message || 'Güncellenemedi', 'error');
    }
  };


  // =======================================================
  // 🛠️ YETKİ KONTROLÜ (DÜZELTİLDİ)
  // =======================================================

  // Sahiplik kontrolünü hem String hem Object ID için güvenli yapıyoruz
  const isOwner = useMemo(() => {
    if (!activeServer || !user) return false;
    const ownerId = activeServer.owner?._id || activeServer.owner;
    const myId = user._id || user.id;
    return String(ownerId) === String(myId);
  }, [activeServer, user]);

  const hasSettingsAccess = useMemo(() => {
    if (!activeServer || !user) return false;

    // 1. Sahip mi?
    if (isOwner) return true;

    // 2. Yönetici mi?
    if (checkUserPermission(activeServer, user.id, 'ADMINISTRATOR')) return true;

    // 3. Sunucu Yönetme Yetkisi Var mı?
    if (checkUserPermission(activeServer, user.id, 'MANAGE_SERVER')) return true;

    return false;
  }, [activeServer, user, isOwner]);

  // Yasaklı kullanıcıları çek
  useEffect(() => {
    if (activeTab === 'bans' && serverId) {
      const fetchBans = async () => {
        try {
          const res = await axiosInstance.get(`${API_URL_BASE}/api/v1/servers/${serverId}/bans`);
          setBannedUsers(res.data.data);
        } catch (err) {
          console.error(err);
        }
      };
      fetchBans();
    }
  }, [activeTab, serverId]);

  // 🟢 YENİ EKLENEN: Özellik (Feature) Güncelleme Fonksiyonu
  const toggleServerFeature = async (featureKey) => {
    // Mevcut özellikleri al
    const currentFeatures = activeServer.features || {};

    // Varsayılan değer true kabul edildiği için:
    // Eğer veritabanında değer yoksa (undefined) -> true kabul et
    // Şimdiki durumu bul:
    const currentValue = currentFeatures[featureKey] !== false;

    // Yeni değer tersi olacak
    const updatedFeatures = {
      ...currentFeatures,
      [featureKey]: !currentValue
    };

    try {
      // Backend isteği
      await axiosInstance.put(`${API_URL_BASE}/api/v1/servers/${serverId}`, {
        features: updatedFeatures
      });

      addToast('Sunucu özellikleri güncellendi.', 'success');
      fetchServerDetails(serverId);
    } catch (err) {
      console.error("Güncelleme Hatası:", err);
      // Hata mesajını daha net gösterelim
      const errMsg = err.response?.status === 404
        ? "Sunucu güncelleme rotası bulunamadı (Backend Hatası)."
        : "Özellik güncellenemedi.";
      addToast(errMsg, 'error');
    }
  };

  const handleUnban = async (bannedUserId) => {
    try {
      await axiosInstance.delete(`${API_URL_BASE}/api/v1/servers/${serverId}/bans/${bannedUserId}`);
      setBannedUsers(prev => prev.filter(b => b.user._id !== bannedUserId));
      addToast('Yasak kaldırıldı.', 'success');
    } catch (err) {
      addToast('İşlem başarısız.', 'error');
    }
  };

  // Sunucu resmi yükle
  const handleIconUpload = async () => {
    if (!serverIconFile) return;
    const formData = new FormData();
    formData.append('icon', serverIconFile);

    try {
      await axiosInstance.put(`${API_URL_BASE}/api/v1/servers/${serverId}/icon`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      addToast('Sunucu resmi güncellendi!', 'success');
      setServerIconFile(null);
      fetchServerDetails(serverId);
      fetchUserServers();
    } catch (err) {
      addToast('Yükleme başarısız.', 'error');
    }
  };

  // Rol işlevleri
  const handleCreateRole = async () => {
    if (!newRoleName) return addToast('Rol adı boş olamaz.', 'warning');
    try {
      await axios.post(
        `${API_URL_BASE}/api/v1/servers/${serverId}/roles`,
        { name: newRoleName, color: newRoleColor, permissions: newRolePermissions }
      );
      addToast('Rol oluşturuldu!', 'success');
      setNewRoleName('Yeni Rol');
      setNewRoleColor('#99AAB5');
      setNewRolePermissions([]);
      fetchServerDetails(serverId);
    } catch (error) {
      addToast(`Hata: ${error.response?.data?.message}`, 'error');
    }
  };

  const handleUpdateRolePermissions = async (roleId, permissions) => {
    try {
      await axios.put(
        `${API_URL_BASE}/api/v1/roles/${roleId}`,
        { permissions }
      );
      fetchServerDetails(serverId);
    } catch (error) {
      addToast(`Hata: ${error.response?.data?.message}`, 'error');
    }
  };

  const handleNewRolePermToggle = (perm) => {
    setNewRolePermissions(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    );
  };

  // Kanal işlevleri
  useEffect(() => {
    if (selectedChannel) {
      setChannelForm({
        name: selectedChannel.name,
        type: selectedChannel.type,
        maxUsers: selectedChannel.maxUsers || 10,
        allowedRoles: selectedChannel.allowedRoles?.map(role => role._id) || []
      });
    } else {
      setChannelForm({ name: '', type: 'text', maxUsers: 10, allowedRoles: [] });
    }
  }, [selectedChannel]);

  const handleChannelFormChange = (e) => {
    const { name, value } = e.target;
    setChannelForm(prev => ({ ...prev, [name]: value }));
  };

  const handleChannelRoleToggle = (roleId) => {
    setChannelForm(prev => ({
      ...prev,
      allowedRoles: prev.allowedRoles.includes(roleId)
        ? prev.allowedRoles.filter(id => id !== roleId)
        : [...prev.allowedRoles, roleId]
    }));
  };

  const handleCreateChannel = async (e) => {
    e.preventDefault();
    try {
      await axios.post(
        `${API_URL_BASE}/api/v1/servers/${serverId}/channels`,
        channelForm
      );
      addToast('Kanal başarıyla oluşturuldu!', 'success');
      fetchServerDetails(serverId);
      setSelectedChannel(null);
    } catch (error) {
      addToast(`Hata: ${error.response?.data?.message || 'Kanal oluşturulamadı'}`, 'error');
    }
  };

  const handleUpdateChannel = async (e) => {
    e.preventDefault();
    if (!selectedChannel) return;
    try {
      await axios.put(
        `${API_URL_BASE}/api/v1/servers/${serverId}/channels/${selectedChannel._id}`,
        channelForm
      );
      addToast('Kanal başarıyla güncellendi!', 'success');
      fetchServerDetails(serverId);
      setSelectedChannel(null);
    } catch (error) {
      addToast(`Hata: ${error.response?.data?.message || 'Kanal güncellenemedi'}`, 'error');
    }
  };

  const handleDeleteChannel = async () => {
    if (!selectedChannel) return;
    if (!window.confirm(`'${selectedChannel.name}' kanalını silmek istediğinizden emin misiniz?`)) return;
    try {
      await axios.delete(
        `${API_URL_BASE}/api/v1/servers/${serverId}/channels/${selectedChannel._id}`
      );
      addToast('Kanal başarıyla silindi!', 'success');
      fetchServerDetails(serverId);
      setSelectedChannel(null);
    } catch (error) {
      addToast(`Hata: ${error.response?.data?.message || 'Kanal silinemedi'}`, 'error');
    }
  };

  // Sunucu sil
  const handleDeleteServer = async () => {
    if (!isOwner) {
      addToast('Sadece sunucu sahibi sunucuyu silebilir.', 'error');
      return;
    }
    try {
      await axios.delete(`${API_URL_BASE}/api/v1/servers/${serverId}`);
      addToast('Sunucu başarıyla silindi.', 'success');
      await fetchUserServers();
      navigate('/dashboard/friends');
    } catch (error) {
      addToast(`Hata: ${error.response?.data?.message || 'Sunucu silinemedi'}`, 'error');
    }
  };

  if (loading || !activeServer || activeServer._id !== serverId) {
    return <div className="server-settings-loading">Sunucu Ayarları Yükleniyor...</div>;
  }

  if (!hasSettingsAccess) {
    // Debug bilgisi
    const ownerId = activeServer.owner?._id || activeServer.owner;
    return (
      <div className="no-permission" style={{ padding: '50px', textAlign: 'center', color: 'white' }}>
        <h2>Erişim Reddedildi</h2>
        <p>Bu sayfayı görme yetkiniz yok.</p>
        <p style={{ fontSize: '12px', color: '#999' }}>
          (Debug: Sahip={String(ownerId)}, Sen={String(user?.id)})
        </p>
      </div>
    );
  }

  // Sahip adını güvenli al
  const ownerName = activeServer.owner?.username || 'Sunucu Sahibi';

  return (
    <div className="server-settings-area fancy">
      <div className="server-settings-hero">
        <div className="server-settings-heading">
          <div className="server-chip">
            {activeServer.name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="server-meta">
            <h1>{activeServer.name} Ayarları</h1>
            <p>Sunucu Sahibi: {ownerName}</p>
          </div>
        </div>
        <div className="server-quick-stats">
          <div className="stat-card">
            <span className="stat-label">Üye</span>
            <strong>{serverMemberCount || 0}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Kanal</span>
            <strong>{activeServer.channels?.length || 0}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Rol</span>
            <strong>{activeServer.roles?.length || 0}</strong>
          </div>
        </div>
      </div>

      <div className="settings-tabs">
        <button
          onClick={() => setActiveTab('overview')}
          className={activeTab === 'overview' ? 'active' : ''}
        >
          Genel Bakış
        </button>
        <button onClick={() => setActiveTab('requests')} className={activeTab === 'requests' ? 'active' : ''}>
          İstekler {requests.length > 0 && `(${requests.length})`}
        </button>
        {/* 🟢 YENİ EKLENEN: ÖZELLİKLER SEKMESİ */}
        <button
          onClick={() => setActiveTab('features')}
          className={activeTab === 'features' ? 'active' : ''}
        >
          Özellikler
        </button>
        <button
          onClick={() => setActiveTab('channels')}
          className={activeTab === 'channels' ? 'active' : ''}
        >
          Kanallar
        </button>
        <button
          onClick={() => setActiveTab('roles')}
          className={activeTab === 'roles' ? 'active' : ''}
        >
          Roller
        </button>
        <button
          onClick={() => setActiveTab('members')}
          className={activeTab === 'members' ? 'active' : ''}
        >
          Üyeler
        </button>
        <button
          onClick={() => setActiveTab('bans')}
          className={activeTab === 'bans' ? 'active' : ''}
        >
          Yasaklamalar
        </button>
        {/* Davetler sekmesini buradan kaldırdık çünkü artık ana sayfada */}
      </div>

      <div className="settings-content">

        {/* 🟢 YENİ EKLENEN: ÖZELLİKLER İÇERİĞİ */}
        {/* 🟢 ÖZELLİKLER (FEATURES) TABI */}
        {activeTab === 'features' && (
          <section className="settings-grid">
            <div className="settings-card highlight">
              <h2>Sunucu Özellikleri</h2>
              <p style={{ color: '#b9bbbe', marginBottom: '20px' }}>Bu sunucuda hangi özel modüllerin aktif olacağını seçin. (Varsayılan olarak hepsi aktiftir)</p>

              {/* KADRO KURUCU */}
              <div className="info-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #2f3136' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <GlobeAltIcon style={{ width: 24, color: '#00aff4' }} />
                  <div>
                    <strong style={{ color: 'white', display: 'block' }}>Kadro Kurucu</strong>
                    <span style={{ fontSize: '12px', color: '#b9bbbe' }}>Spor kanalları için kadro kurma modülü.</span>
                  </div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    // 🟢 DEĞİŞİKLİK: !== false diyerek varsayılanı TRUE yaptık
                    checked={activeServer.features?.squadBuilder !== false}
                    onChange={() => toggleServerFeature('squadBuilder')}
                  />
                  <span className="slider round"></span>
                </label>
              </div>

              {/* TATİLDEKİ ROTAM */}
              <div className="info-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <MapIcon style={{ width: 24, color: '#fcd34d' }} />
                  <div>
                    <strong style={{ color: 'white', display: 'block' }}>Tatildeki Rotam</strong>
                    <span style={{ fontSize: '12px', color: '#b9bbbe' }}>Seyahat planlama ve rota paylaşım modülü.</span>
                  </div>
                </div>
                <label className="switch" >
                  <input
                    type="checkbox"
                    // 🟢 DEĞİŞİKLİK: !== false diyerek varsayılanı TRUE yaptık
                    checked={activeServer.features?.vacationRoute !== false}
                    onChange={() => toggleServerFeature('vacationRoute')}
                  />
                  <span className="slider round"></span>
                </label>
              </div>

            </div>
          </section>
        )}

        {activeTab === 'requests' && (
          <section>
            <h2>Katılım İstekleri</h2>
            <div className="bans-list"> {/* Mevcut CSS classlarını kullanabiliriz */}
              {requests.length === 0 ? (
                <p className="bans-empty">Bekleyen katılım isteği yok.</p>
              ) : (
                requests.map(req => (
                  <div key={req._id} className="ban-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="ban-user">
                      <div className="ban-avatar">
                        <img src={req.user.avatarUrl ? `${API_URL_BASE}/api/v1/${req.user.avatarUrl}` : '/default-avatar.png'} alt="avatar" />
                      </div>
                      <div className="ban-text">
                        <div className="ban-username">{req.user.username}</div>
                        <div className="ban-reason" style={{ fontSize: '11px' }}>Lv.{req.user.level || 0}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => handleRequestResponse(req._id, 'accepted')} className="pill-btn primary small">Onayla</button>
                      <button onClick={() => handleRequestResponse(req._id, 'rejected')} className="pill-btn danger small">Reddet</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* GENEL */}
        {activeTab === 'overview' && (
          <section className="settings-grid">
            <div className="settings-card highlight">
              <h2>Genel Bakış</h2>
              <div className="info-row">
                <span className="label">Sunucu Adı</span>
                <span className="value">{activeServer.name}</span>
              </div>
              <div className="info-row">
                <span className="label">Sunucu Sahibi</span>
                <span className="value">{ownerName}</span>
              </div>

              <div className="settings-card highlight">
                <h2>Görünürlük ve Katılım</h2>

                <div className="info-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
                  <div>
                    <strong style={{ color: 'white' }}>Herkese Açık Sunucu</strong>
                    <p style={{ fontSize: '12px', color: '#b9bbbe' }}>Sunucuyu Keşfet sayfasında listele.</p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={activeServer.isPublic}
                      onChange={(e) => handleVisibilityUpdate(e.target.checked, activeServer.joinMode)}
                    />
                    <span className="slider round"></span>
                  </label>
                </div>

                {activeServer.isPublic && (
                  <div className="info-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
                    <div>
                      <strong style={{ color: 'white' }}>Onaylı Katılım</strong>
                      <p style={{ fontSize: '12px', color: '#b9bbbe' }}>
                        {activeServer.joinMode === 'request' ? 'Kullanıcılar katılmak için istek göndermeli.' : 'Kullanıcılar direkt katılabilir.'}
                      </p>
                    </div>
                    <select
                      value={activeServer.joinMode}
                      onChange={(e) => handleVisibilityUpdate(activeServer.isPublic, e.target.value)}
                      style={{ backgroundColor: '#202225', color: 'white', border: 'none', padding: '5px', borderRadius: '4px' }}
                    >
                      <option value="direct">Direkt</option>
                      <option value="request">İstekli</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="icon-upload-section">
                <h3 className="icon-upload-title">SUNUCU RESMİ</h3>
                <div className="icon-upload-row">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setServerIconFile(e.target.files[0])}
                  />
                  <button
                    onClick={handleIconUpload}
                    className="pill-btn primary"
                    disabled={!serverIconFile}
                  >
                    Yükle
                  </button>
                </div>
              </div>
            </div>

            {isOwner && (
              <div className="settings-card danger-zone">
                <h3>Tehlikeli Bölge</h3>
                <p>Bu sunucuyu kalıcı olarak silmek için aşağıdaki butonu kullanın. Bu işlem geri alınamaz.</p>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="danger"
                >
                  Sunucuyu Sil
                </button>
              </div>
            )}
          </section>
        )}

        {/* YASAKLAMALAR */}
        {activeTab === 'bans' && (
          <section>
            <h2>Yasaklanmış Kullanıcılar</h2>
            <div className="bans-list">
              {bannedUsers.length === 0 ? (
                <p className="bans-empty">Yasaklı kullanıcı yok.</p>
              ) : (
                bannedUsers.map(ban => (
                  <div key={ban._id} className="ban-item">
                    <div className="ban-user">
                      <div className="ban-avatar">
                        <img
                          src={
                            ban.user.avatarUrl?.startsWith('/uploads')
                              ? `${API_URL_BASE}/api/v1/${ban.user.avatarUrl}`
                              : ban.user.avatarUrl
                          }
                          alt="avatar"
                        />
                      </div>
                      <div className="ban-text">
                        <div className="ban-username">{ban.user.username}</div>
                        <div className="ban-reason">Sebep: {ban.reason}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnban(ban.user._id)}
                      className="pill-btn danger small"
                    >
                      Yasağı Kaldır
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* KANALLAR */}
        {activeTab === 'channels' && (
          <section className="manager-section">
            <div className="panel-card">
              <div className="panel-head">
                <h2>Kanalları Yönet</h2>
                <button
                  onClick={() => setSelectedChannel(null)}
                  className="pill-btn"
                >
                  + Yeni Kanal
                </button>
              </div>
              <div className="channel-list">
                {activeServer.channels.map((channel) => (
                  <button
                    key={channel._id}
                    onClick={() => setSelectedChannel(channel)}
                    className={`pill-btn ghost channel-pill ${selectedChannel?._id === channel._id ? 'active' : ''
                      }`}
                  >
                    {channel.type === 'voice' ? '🔊' : '#'} {channel.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="panel-card">
              <div className="panel-head">
                <h3>{selectedChannel ? 'Kanalı Düzenle' : 'Yeni Kanal Oluştur'}</h3>
                {selectedChannel && (
                  <span className="badge">
                    {selectedChannel.type === 'voice' ? 'Ses Kanalı' : 'Metin Kanalı'}
                  </span>
                )}
              </div>
              <form
                onSubmit={selectedChannel ? handleUpdateChannel : handleCreateChannel}
                className="form-grid"
              >
                <label className="input-row">
                  <span>Kanal Adı</span>
                  <input
                    type="text"
                    name="name"
                    value={channelForm.name}
                    onChange={handleChannelFormChange}
                    placeholder="yeni-kanal"
                    required
                  />
                </label>

                <label className="input-row">
                  <span>Kanal Tipi</span>
                  <select
                    name="type"
                    value={channelForm.type}
                    onChange={handleChannelFormChange}
                    disabled={!!selectedChannel}
                  >
                    <option value="text">Metin Kanalı</option>
                    <option value="voice">Ses Kanalı</option>
                  </select>
                </label>

                {channelForm.type === 'voice' && (
                  <label className="input-row">
                    <span>Kullanıcı Limiti (0 = Limitsiz)</span>
                    <input
                      type="number"
                      name="maxUsers"
                      min="0"
                      max="99"
                      value={channelForm.maxUsers}
                      onChange={handleChannelFormChange}
                    />
                  </label>
                )}

                <div className="input-row">
                  <span>Kanala Özel İzinler</span>
                  <div className="permissions-grid">
                    {activeServer.roles
                      .filter((r) => r.name !== '@everyone')
                      .map((role) => (
                        <label key={role._id} className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={channelForm.allowedRoles.includes(role._id)}
                            onChange={() => handleChannelRoleToggle(role._id)}
                          />
                          <span
                            className="role-checkbox-color-dot"
                            style={{ backgroundColor: role.color }}
                          />
                          <span>{role.name}</span>
                        </label>
                      ))}
                  </div>
                </div>

                <div className="form-actions">
                  <button type="submit" className="pill-btn primary">
                    {selectedChannel ? 'Kaydet' : 'Oluştur'}
                  </button>
                  {selectedChannel && (
                    <button
                      type="button"
                      onClick={handleDeleteChannel}
                      className="pill-btn danger"
                    >
                      Kanalı Sil
                    </button>
                  )}
                </div>
              </form>
            </div>
          </section>
        )}

        {/* ROLLER */}
        {activeTab === 'roles' && (
          <section className="roles-section">
            <div className="roles-sidebar">
              <div className="roles-sidebar-head">
                <h2>Roller</h2>
                <span className="badge">{activeServer.roles?.length || 0} rol</span>
              </div>
              <p className="roles-sidebar-desc">
                Sunucudaki roller, yetkileri ve renkleri buradan yönetilir.
              </p>

              <div className="roles-list">
                {activeServer.roles && activeServer.roles.map(role => (
                  <button
                    key={role._id}
                    type="button"
                    onClick={() => setSelectedRole(role)}
                    className={`role-pill ${selectedRole?._id === role._id ? 'role-pill-active' : ''}`}
                  >
                    <span
                      className="role-color-dot"
                      style={{ backgroundColor: role.color || '#99AAB5' }}
                    />
                    <span className="role-pill-name">{role.name}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="pill-btn primary full-width roles-new-role-btn"
                onClick={() => setSelectedRole(null)}
              >
                + Yeni Rol Oluştur
              </button>
            </div>

            <div className="roles-main">
              {selectedRole ? (
                <div className="role-detail-card">
                  <div className="role-detail-header">
                    <div className="role-header-left">
                      <span
                        className="role-detail-color"
                        style={{ backgroundColor: selectedRole.color || '#99AAB5' }}
                      />
                      <div>
                        <h3 className="role-detail-name">{selectedRole.name}</h3>
                        <p className="role-detail-sub">
                          Bu rolün sunucu üzerindeki izinlerini düzenleyin.
                        </p>
                      </div>
                    </div>
                    <span className="role-id-chip">ID: {selectedRole._id}</span>
                  </div>

                  {selectedRole.name === '@everyone' ? (
                    <p className="role-locked-text">
                      <strong>@everyone</strong> rolünün izinleri burada düzenlenemez.
                    </p>
                  ) : (
                    <>
                      <h4 className="role-permissions-title">İzinler</h4>
                      <div className="permissions-grid role-permissions-grid">
                        {PERMISSIONS_LIST.map(perm => (
                          <label
                            key={perm}
                            className="permission-chip"
                          >
                            <input
                              type="checkbox"
                              id={`update-${perm}`}
                              checked={selectedRole.permissions.includes(perm)}
                              onChange={(e) => {
                                const newPerms = e.target.checked
                                  ? [...selectedRole.permissions, perm]
                                  : selectedRole.permissions.filter(p => p !== perm);
                                setSelectedRole(prev => ({ ...prev, permissions: newPerms }));
                                handleUpdateRolePermissions(selectedRole._id, newPerms);
                              }}
                            />
                            <span className="permission-chip-label">{perm}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="role-detail-card">
                  <h3 className="role-detail-name">Yeni Rol Oluştur</h3>
                  <p className="role-detail-sub">
                    Rol adı, rengi ve başlangıç izinlerini seçin. Daha sonra üyeleri bu role atayabilirsiniz.
                  </p>

                  <div className="role-create-form">
                    <label className="input-row">
                      <span>Rol Adı</span>
                      <input
                        type="text"
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        placeholder="Örn: Yönetici, Moderatör..."
                      />
                    </label>

                    <label className="input-row">
                      <span>Rol Rengi</span>
                      <div className="role-color-input-row">
                        <input
                          type="color"
                          value={newRoleColor}
                          onChange={(e) => setNewRoleColor(e.target.value)}
                        />
                        <span className="role-color-preview-label">
                          {newRoleColor}
                        </span>
                      </div>
                    </label>

                    <div className="input-row">
                      <span>Rol İzinleri</span>
                      <div className="permissions-grid role-permissions-grid">
                        {PERMISSIONS_LIST.map(perm => (
                          <label
                            key={perm}
                            className="permission-chip"
                          >
                            <input
                              type="checkbox"
                              id={`new-${perm}`}
                              checked={newRolePermissions.includes(perm)}
                              onChange={() => handleNewRolePermToggle(perm)}
                            />
                            <span className="permission-chip-label">{perm}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="pill-btn primary align-right"
                      onClick={handleCreateRole}
                    >
                      Rol Oluştur
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ÜYELER */}
        {activeTab === 'members' && (
          <section className="manager-section">
            <div className="panel-card">
              <div className="panel-head">
                <h2>Üyeleri Yönet</h2>
                <span className="badge">{activeServer.members.length} üye</span>
              </div>
              <p>Üyelerin rollerini buradan düzenleyebilirsiniz.</p>
              <div className="members-role-list">
                {activeServer.members.map((member) => (
                  <div key={member._id} className="member-role-item">
                    <div className="member-text">
                      <strong>{member.user.username}</strong>
                      <span className="member-roles">
                        Rolleri: {member.roles.map((r) => r.name).join(', ') || 'Yok'}
                      </span>
                    </div>
                    <button
                      onClick={() => setManagingMember(member)}
                      className="pill-btn ghost"
                    >
                      Rolleri Düzenle
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {managingMember && (
              <div className="panel-card">
                <div className="panel-head">
                  <h3>{managingMember.user.username} Rol Yönetimi</h3>
                </div>
                <MemberRoleManager
                  member={managingMember}
                  serverRoles={activeServer.roles}
                  serverId={serverId}
                  onUpdate={() => {
                    fetchServerDetails(serverId);
                    setManagingMember(null);
                  }}
                />
              </div>
            )}
          </section>
        )}
      </div>

      {showDeleteModal && (
        <DeleteServerModal
          serverName={activeServer.name}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={() => {
            setShowDeleteModal(false);
            handleDeleteServer();
          }}
        />
      )}

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(p => ({ ...p, isOpen: false }))}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        isDanger={confirmModal.isDanger}
        confirmText={confirmModal.confirmText}
      />
    </div>
  );
};

export default ServerSettingsPage;