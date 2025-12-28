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
import axios from 'axios'; // Gerekli değil ama kalsın
import axiosInstance from '../utils/axiosInstance';
import '../styles/ServerSettings.css';

// 🟢 İKONLAR
import {
  XMarkIcon,
  GlobeAltIcon,
  MapIcon,
  HashtagIcon,
  SpeakerWaveIcon,
  PlusIcon,
  TrashIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  PencilSquareIcon // Üye düzenleme için eklendi
} from '@heroicons/react/24/solid';

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const PERMISSIONS_LIST = [
  'ADMINISTRATOR', 'MANAGE_SERVER', 'MANAGE_ROLES', 'MANAGE_CHANNELS',
  'KICK_MEMBERS', 'BAN_MEMBERS', 'CREATE_INVITE', 'SEND_MESSAGES',
  'MANAGE_MESSAGES', 'VOICE_SPEAK', 'MUTE_MEMBERS', 'DEAFEN_MEMBERS'
];

// --- YARDIMCI BİLEŞEN: SWITCH ---
const Switch = ({ checked, onChange, label, description }) => (
  <div className="info-row">
    <div>
      <strong style={{ color: 'white', display: 'block', marginBottom: '4px' }}>{label}</strong>
      {description && <span style={{ fontSize: '12px', color: '#b9bbbe' }}>{description}</span>}
    </div>
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="slider round"></span>
    </label>
  </div>
);

// --- ÜYE ROL YÖNETİCİSİ (DÜZELTİLDİ: axiosInstance kullanıyor) ---
const MemberRoleManager = ({ member, serverRoles, serverId, onUpdate, onClose }) => {
  const [memberRoles, setMemberRoles] = useState(new Set(member.roles.map(r => r._id)));
  const { addToast } = useContext(ToastContext);

  const handleRoleToggle = async (roleId) => {
    const newRolesSet = new Set(memberRoles);
    if (newRolesSet.has(roleId)) newRolesSet.delete(roleId);
    else newRolesSet.add(roleId);

    setMemberRoles(newRolesSet); // UI'ı anında güncelle
    try {
      // 🟢 DÜZELTME: axios yerine axiosInstance kullanıldı
      await axiosInstance.put(`${API_URL_BASE}/api/v1/servers/${serverId}/members/${member._id}/roles`, { roles: Array.from(newRolesSet) });
      onUpdate(); // Ana sayfayı yenilemeye gerek yok, socket halleder ama yine de çağırabiliriz
    } catch (error) {
      addToast(`Hata: ${error.response?.data?.message}`, 'error');
      // Hata olursa eski haline döndür
      setMemberRoles(new Set(member.roles.map(r => r._id)));
    }
  };

  return (
    <div className="settings-card" style={{ marginTop: '20px', border: '1px solid var(--accent-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h4 style={{ color: 'white', margin: 0 }}>
          <span style={{ color: 'var(--accent-color)' }}>{member.user.username}</span> Rollerini Düzenle
        </h4>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#b9bbbe', cursor: 'pointer' }}>
          <XMarkIcon width={20} />
        </button>
      </div>

      <div className="permission-grid">
        {serverRoles.filter(role => role.name !== '@everyone').map(role => (
          <label key={role._id} className={`permission-card ${memberRoles.has(role._id) ? 'active' : ''}`} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: role.color || '#999' }}></span>
              <span style={{ color: memberRoles.has(role._id) ? '#fff' : '#b9bbbe' }}>{role.name}</span>
            </div>
            <input type="checkbox" checked={memberRoles.has(role._id)} onChange={() => handleRoleToggle(role._id)} style={{ width: 16, height: 16 }} />
          </label>
        ))}
      </div>
    </div>
  );
};

// --- ANA BİLEŞEN ---
const ServerSettingsPage = () => {
  const { serverId } = useParams();
  const { activeServer, loading, fetchServerDetails, fetchUserServers } = useContext(ServerContext);
  const { user } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);
  const navigate = useNavigate();

  // Aktif Sekme (Varsayılan: Overview)
  const [activeTab, setActiveTab] = useState('overview');

  // Kanal Yönetimi State
  const [selectedChannel, setSelectedChannel] = useState(null); // null = Create Mode
  const [channelForm, setChannelForm] = useState({ name: '', type: 'text', maxUsers: 0, allowedRoles: [] });

  // Üye Yönetimi State (EKSİK OLAN KISIMDI)
  const [managingMember, setManagingMember] = useState(null);

  // Diğer Stateler
  const [requests, setRequests] = useState([]);
  const [bannedUsers, setBannedUsers] = useState([]);
  const [serverIconFile, setServerIconFile] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false });

  const [generalSettings, setGeneralSettings] = useState({
    name: '',
    isPublic: false,
    joinMode: 'direct'
  });


  // Rol Yönetimi State
  const [selectedRole, setSelectedRole] = useState(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#99AAB5');
  const [newRolePermissions, setNewRolePermissions] = useState([]);

  useServerSocket(serverId);

  // Veri Çekme (Tab değişiminde)
  useEffect(() => {
    if (activeTab === 'requests' && serverId) {
      axiosInstance.get(`${API_URL_BASE}/api/v1/servers/${serverId}/requests`).then(res => setRequests(res.data.data)).catch(console.error);
    }
    if (activeTab === 'bans' && serverId) {
      axiosInstance.get(`${API_URL_BASE}/api/v1/servers/${serverId}/bans`).then(res => setBannedUsers(res.data.data)).catch(console.error);
    }
  }, [activeTab, serverId]);

  useEffect(() => {
    if (activeServer) {
      setGeneralSettings({
        name: activeServer.name,
        isPublic: activeServer.isPublic,
        joinMode: activeServer.joinMode
      });
    }
  }, [activeServer]);

  const handleSaveGeneralSettings = async () => {
    try {
      await axiosInstance.put(`${API_URL_BASE}/api/v1/servers/${serverId}`, {
        name: generalSettings.name,
        isPublic: generalSettings.isPublic,
        joinMode: generalSettings.joinMode
      });
      addToast('Sunucu ayarları başarıyla kaydedildi.', 'success');
      fetchServerDetails(serverId);
    } catch (error) {
      addToast(error.response?.data?.message || 'Güncelleme başarısız.', 'error');
    }
  };

  // Kanal Seçildiğinde Formu Doldur
  useEffect(() => {
    if (selectedChannel) {
      setChannelForm({
        name: selectedChannel.name,
        type: selectedChannel.type,
        maxUsers: selectedChannel.maxUsers || 0,
        allowedRoles: selectedChannel.allowedRoles?.map(r => r._id) || []
      });
    } else {
      setChannelForm({ name: '', type: 'text', maxUsers: 0, allowedRoles: [] });
    }
  }, [selectedChannel]);

  // --- FONKSİYONLAR ---

  // Genel
  const handleVisibilityUpdate = async (isPublic, joinMode) => {
    try {
      await axiosInstance.put(`${API_URL_BASE}/api/v1/servers/${serverId}`, { isPublic, joinMode });
      addToast('Sunucu güncellendi', 'success');
      fetchServerDetails(serverId);
    } catch (e) { addToast('Hata', 'error'); }
  };

  const toggleServerFeature = async (featureKey) => {
    const currentFeatures = activeServer.features || {};
    const updatedFeatures = { ...currentFeatures, [featureKey]: !(currentFeatures[featureKey] !== false) };
    try {
      await axiosInstance.put(`${API_URL_BASE}/api/v1/servers/${serverId}`, { features: updatedFeatures });
      addToast('Özellik güncellendi.', 'success');
      fetchServerDetails(serverId);
    } catch (err) { addToast('Hata oluştu', 'error'); }
  };

  const handleIconUpload = async () => {
    if (!serverIconFile) return;
    const formData = new FormData();
    formData.append('icon', serverIconFile);
    try {
      await axiosInstance.put(`${API_URL_BASE}/api/v1/servers/${serverId}/icon`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      addToast('Resim güncellendi', 'success');
      setServerIconFile(null);
      fetchServerDetails(serverId);
      fetchUserServers(); // Sidebar ikonunu güncelle
    } catch (e) { addToast('Yükleme hatası', 'error'); }
  };

  // Kanal İşlemleri
  const handleSaveChannel = async (e) => {
    e.preventDefault();
    try {
      if (selectedChannel) {
        await axiosInstance.put(`${API_URL_BASE}/api/v1/servers/${serverId}/channels/${selectedChannel._id}`, channelForm);
        addToast('Kanal güncellendi', 'success');
      } else {
        await axiosInstance.post(`${API_URL_BASE}/api/v1/servers/${serverId}/channels`, channelForm);
        addToast('Kanal oluşturuldu', 'success');
      }
      fetchServerDetails(serverId);
      setSelectedChannel(null);
    } catch (error) {
      addToast(error.response?.data?.message || 'Hata', 'error');
    }
  };

  const handleDeleteChannel = async () => {
    if (!selectedChannel) return;
    if (!window.confirm('Bu kanalı silmek istediğine emin misin?')) return;
    try {
      await axiosInstance.delete(`${API_URL_BASE}/api/v1/servers/${serverId}/channels/${selectedChannel._id}`);
      addToast('Kanal silindi', 'success');
      fetchServerDetails(serverId);
      setSelectedChannel(null);
    } catch (e) { addToast('Silinemedi', 'error'); }
  };

  const toggleChannelRole = (roleId) => {
    setChannelForm(prev => {
      const roles = prev.allowedRoles.includes(roleId)
        ? prev.allowedRoles.filter(id => id !== roleId)
        : [...prev.allowedRoles, roleId];
      return { ...prev, allowedRoles: roles };
    });
  };

  // Rol İşlemleri
  const handleCreateRole = async () => {
    if (!newRoleName) return;
    try {
      await axiosInstance.post(`${API_URL_BASE}/api/v1/servers/${serverId}/roles`, { name: newRoleName, color: newRoleColor, permissions: newRolePermissions });
      addToast('Rol oluşturuldu', 'success');
      fetchServerDetails(serverId);
      setNewRoleName('');
    } catch (e) { addToast('Hata', 'error'); }
  };

  const handleUpdateRole = async (roleId, permissions) => {
    try {
      await axiosInstance.put(`${API_URL_BASE}/api/v1/roles/${roleId}`, { permissions });
      fetchServerDetails(serverId);
    } catch (e) { addToast('Hata', 'error'); }
  };

  const handleUnban = async (bannedUserId) => {
    try {
      await axiosInstance.delete(`${API_URL_BASE}/api/v1/servers/${serverId}/bans/${bannedUserId}`);
      addToast('Yasak kaldırıldı', 'success');
      setBannedUsers(prev => prev.filter(b => b.user._id !== bannedUserId));
    } catch (e) {
      addToast('İşlem başarısız', 'error');
    }
  };

  // Yetki
  const isOwner = useMemo(() => activeServer && user && String(activeServer.owner?._id || activeServer.owner) === String(user._id || user.id), [activeServer, user]);

  if (loading || !activeServer) return <div style={{ padding: 40, color: 'white' }}>Yükleniyor...</div>;

  return (
    <div className="server-settings-container">

      {/* 🟢 ÜST KISIM (HEADER & YATAY MENÜ) */}
      <div className="settings-top-bar">
        <div className="settings-title-row">
          <div className="settings-server-name">
            {activeServer.name.toUpperCase()} AYARLARI
          </div>
          <div className="esc-button" onClick={() => navigate(`/dashboard/server/${serverId}`)} title="Çıkış (ESC)">
            <XMarkIcon width={24} />
          </div>
        </div>

        {/* YATAY SEKMELER */}
        <div className="settings-tabs-wrapper">
          <div className={`settings-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Genel Bakış</div>
          <div className={`settings-tab ${activeTab === 'features' ? 'active' : ''}`} onClick={() => setActiveTab('features')}>Özellikler</div>
          <div className={`settings-tab ${activeTab === 'channels' ? 'active' : ''}`} onClick={() => setActiveTab('channels')}>Kanallar</div>
          <div className={`settings-tab ${activeTab === 'roles' ? 'active' : ''}`} onClick={() => setActiveTab('roles')}>Roller</div>
          <div className={`settings-tab ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')}>Üyeler</div>
          <div className={`settings-tab ${activeTab === 'requests' ? 'active' : ''}`} onClick={() => setActiveTab('requests')}>
            İstekler {requests.length > 0 && `(${requests.length})`}
          </div>
          <div className={`settings-tab ${activeTab === 'bans' ? 'active' : ''}`} onClick={() => setActiveTab('bans')}>Yasaklılar</div>
          {isOwner && <div className="settings-tab danger" onClick={() => setShowDeleteModal(true)}>Sunucuyu Sil</div>}
        </div>
      </div>

      {/* 🟢 İÇERİK ALANI */}
      <div className="settings-content-area">
        <div className="settings-inner">

          {/* --- TAB: GENEL BAKIŞ --- */}
          {activeTab === 'overview' && (
            <div className="settings-card">
              <h3 style={{ marginBottom: '20px', color: 'white' }}>Sunucu Görünümü</h3>
              <div style={{ display: 'flex', gap: '30px', alignItems: 'flex-start' }}>

                {/* SOL: RESİM YÜKLEME (Değişmedi) */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '100px', height: '100px', borderRadius: '50%',
                    background: '#202225', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', border: '2px solid var(--accent-color)'
                  }}>
                    {serverIconFile ? <img src={URL.createObjectURL(serverIconFile)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> :
                      activeServer.iconUrl ? <img src={`${API_URL_BASE}/api/v1/${activeServer.iconUrl}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> :
                        <span style={{ fontSize: '30px', color: 'white' }}>{activeServer.name.charAt(0)}</span>
                    }
                  </div>
                  <label className="modern-btn btn-secondary" style={{ fontSize: '12px', padding: '5px 10px' }}>
                    Resim Seç
                    <input type="file" hidden onChange={e => setServerIconFile(e.target.files[0])} accept="image/*" />
                  </label>
                  {serverIconFile && <button className="modern-btn btn-primary" onClick={handleIconUpload}>Kaydet</button>}
                </div>

                {/* SAĞ: FORM (GÜNCELLENDİ) */}
                <div style={{ flex: 1 }}>

                  {/* İSİM DEĞİŞTİRME */}
                  <div className="form-section">
                    <label className="form-label">Sunucu Adı</label>
                    <input
                      type="text"
                      className="modern-input"
                      value={generalSettings.name} // State'ten geliyor
                      onChange={(e) => setGeneralSettings({ ...generalSettings, name: e.target.value })} // State güncelliyor
                    />
                  </div>

                  {/* GÖRÜNÜRLÜK */}
                  <Switch
                    label="Herkese Açık Sunucu"
                    description="Bu sunucuyu Keşfet sayfasında listele."
                    checked={generalSettings.isPublic}
                    onChange={(e) => setGeneralSettings({ ...generalSettings, isPublic: e.target.checked })}
                  />

                  {/* KATILIM MODU (Sadece Public ise göster) */}
                  {generalSettings.isPublic && (
                    <div className="form-section" style={{ marginTop: '15px' }}>
                      <label className="form-label">Katılım Modu</label>
                      <select
                        className="modern-select"
                        value={generalSettings.joinMode}
                        onChange={(e) => setGeneralSettings({ ...generalSettings, joinMode: e.target.value })}
                      >
                        <option value="direct">Direkt (Herkes Girebilir)</option>
                        <option value="request">Başvuru (Yönetici Onayı Gerekir)</option>
                      </select>
                    </div>
                  )}

                  {/* 🟢 KAYDET BUTONU */}
                  <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="modern-btn btn-primary"
                      onClick={handleSaveGeneralSettings}
                      // Eğer hiçbir değişiklik yoksa butonu pasif yapabilirsin (Opsiyonel)
                      disabled={
                        generalSettings.name === activeServer.name &&
                        generalSettings.isPublic === activeServer.isPublic &&
                        generalSettings.joinMode === activeServer.joinMode
                      }
                      style={{
                        opacity: (
                          generalSettings.name === activeServer.name &&
                          generalSettings.isPublic === activeServer.isPublic &&
                          generalSettings.joinMode === activeServer.joinMode
                        ) ? 0.5 : 1
                      }}
                    >
                      Değişiklikleri Kaydet
                    </button>
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* TAB: ÖZELLİKLER */}
          {activeTab === 'features' && (
            <div className="settings-card">
              <h3 style={{ marginBottom: '20px', color: 'white' }}>Sunucu Özellikleri</h3>
              <p style={{ color: '#b9bbbe', marginBottom: '20px' }}>Sunucunuzda kullanılacak özel modülleri buradan açıp kapatabilirsiniz.</p>

              <div className="info-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <GlobeAltIcon width={24} color="#00aff4" />
                  <div>
                    <strong style={{ color: 'white', display: 'block' }}>Kadro Kurucu (İlk 11)</strong>
                    <span style={{ fontSize: '12px', color: '#b9bbbe' }}>Spor kanalları için kadro kurma modülü.</span>
                  </div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={activeServer.features?.squadBuilder !== false}
                    onChange={() => toggleServerFeature('squadBuilder')}
                  />
                  <span className="slider round"></span>
                </label>
              </div>

              <div className="info-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <MapIcon width={24} color="#fcd34d" />
                  <div>
                    <strong style={{ color: 'white', display: 'block' }}>Tatildeki Rotam</strong>
                    <span style={{ fontSize: '12px', color: '#b9bbbe' }}>Seyahat planlama ve rota paylaşım modülü.</span>
                  </div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={activeServer.features?.vacationRoute !== false}
                    onChange={() => toggleServerFeature('vacationRoute')}
                  />
                  <span className="slider round"></span>
                </label>
              </div>
            </div>
          )}

          {/* --- TAB: KANALLAR --- */}
          {activeTab === 'channels' && (
            <div className="channel-manager-layout">
              {/* SOL: KANAL LİSTESİ */}
              <div className="channel-list-sidebar">
                <button
                  className="modern-btn btn-primary"
                  style={{ width: '100%', marginBottom: '10px' }}
                  onClick={() => setSelectedChannel(null)}
                >
                  <PlusIcon width={16} /> Yeni Kanal Oluştur
                </button>

                <div className="channel-category-label">METİN KANALLARI</div>
                {activeServer.channels.filter(c => c.type === 'text').map(channel => (
                  <div
                    key={channel._id}
                    className={`channel-item-row ${selectedChannel?._id === channel._id ? 'active' : ''}`}
                    onClick={() => setSelectedChannel(channel)}
                  >
                    <div className="channel-icon-name">
                      <HashtagIcon width={16} /> {channel.name}
                    </div>
                  </div>
                ))}

                <div className="channel-category-label" style={{ marginTop: '20px' }}>SES KANALLARI</div>
                {activeServer.channels.filter(c => c.type === 'voice').map(channel => (
                  <div
                    key={channel._id}
                    className={`channel-item-row ${selectedChannel?._id === channel._id ? 'active' : ''}`}
                    onClick={() => setSelectedChannel(channel)}
                  >
                    <div className="channel-icon-name">
                      <SpeakerWaveIcon width={16} /> {channel.name}
                    </div>
                  </div>
                ))}
              </div>

              {/* SAĞ: DÜZENLEME FORMU */}
              <div className="channel-edit-panel">
                <h3 style={{ color: 'white', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
                  {selectedChannel ? `#${selectedChannel.name} Düzenleniyor` : 'Yeni Kanal Oluştur'}
                </h3>

                <form onSubmit={handleSaveChannel}>
                  <div className="form-section">
                    <label className="form-label">KANAL ADI</label>
                    <input
                      type="text"
                      className="modern-input"
                      value={channelForm.name}
                      onChange={e => setChannelForm({ ...channelForm, name: e.target.value })}
                      placeholder="kanal-adi"
                      required
                    />
                  </div>

                  <div className="form-section">
                    <label className="form-label">KANAL TÜRÜ</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <label
                        className={`modern-btn ${channelForm.type === 'text' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ flex: 1, textAlign: 'center' }}
                      >
                        <input
                          type="radio" name="type" value="text" hidden
                          checked={channelForm.type === 'text'}
                          onChange={() => setChannelForm({ ...channelForm, type: 'text' })}
                          disabled={!!selectedChannel}
                        />
                        <HashtagIcon width={20} style={{ verticalAlign: 'middle' }} /> Metin
                      </label>
                      <label
                        className={`modern-btn ${channelForm.type === 'voice' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ flex: 1, textAlign: 'center' }}
                      >
                        <input
                          type="radio" name="type" value="voice" hidden
                          checked={channelForm.type === 'voice'}
                          onChange={() => setChannelForm({ ...channelForm, type: 'voice' })}
                          disabled={!!selectedChannel}
                        />
                        <SpeakerWaveIcon width={20} style={{ verticalAlign: 'middle' }} /> Ses
                      </label>
                    </div>
                  </div>

                  {channelForm.type === 'voice' && (
                    <div className="form-section">
                      <label className="form-label">KULLANICI LİMİTİ (0 = SINIRSIZ)</label>
                      <input
                        type="number"
                        className="modern-input"
                        min="0" max="99"
                        value={channelForm.maxUsers}
                        onChange={e => setChannelForm({ ...channelForm, maxUsers: parseInt(e.target.value) })}
                      />
                    </div>
                  )}

                  <div className="form-section">
                    <label className="form-label">ÖZEL İZİNLER (ERİŞEBİLECEK ROLLER)</label>
                    <p style={{ fontSize: '12px', color: '#b9bbbe', marginBottom: '10px' }}>
                      Hiçbir rol seçmezseniz kanal herkese açık olur.
                    </p>
                    <div className="permission-grid">
                      {activeServer.roles.filter(r => r.name !== '@everyone').map(role => (
                        <div
                          key={role._id}
                          className={`permission-card ${channelForm.allowedRoles.includes(role._id) ? 'active' : ''}`}
                          onClick={() => toggleChannelRole(role._id)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: role.color }}></span>
                            <span style={{ color: channelForm.allowedRoles.includes(role._id) ? '#fff' : '#b9bbbe' }}>{role.name}</span>
                          </div>
                          {channelForm.allowedRoles.includes(role._id) && <ShieldCheckIcon width={16} color="#3ba55c" />}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px' }}>
                    {selectedChannel ? (
                      <button type="button" className="modern-btn btn-danger" onClick={handleDeleteChannel}>
                        <TrashIcon width={16} /> Kanalı Sil
                      </button>
                    ) : <div></div>}

                    <button type="submit" className="modern-btn btn-primary">
                      {selectedChannel ? 'Değişiklikleri Kaydet' : 'Kanal Oluştur'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* --- TAB: ROLLER --- */}
          {activeTab === 'roles' && (
            <div className="channel-manager-layout">
              {/* Rol Listesi */}
              <div className="channel-list-sidebar">
                <button className="modern-btn btn-primary" style={{ width: '100%', marginBottom: '10px' }} onClick={() => setSelectedRole(null)}>
                  <PlusIcon width={16} /> Yeni Rol
                </button>
                {activeServer.roles.map(role => (
                  <div key={role._id} className={`channel-item-row ${selectedRole?._id === role._id ? 'active' : ''}`} onClick={() => setSelectedRole(role)}>
                    <div className="channel-icon-name">
                      <span style={{ width: 12, height: 12, borderRadius: '50%', background: role.color }}></span>
                      {role.name}
                    </div>
                  </div>
                ))}
              </div>

              {/* Rol Düzenleme */}
              <div className="channel-edit-panel">
                {selectedRole ? (
                  <>
                    <h3 style={{ color: 'white', marginBottom: '20px' }}>{selectedRole.name} İzinleri</h3>
                    <div className="permission-grid">
                      {PERMISSIONS_LIST.map(perm => (
                        <div key={perm}
                          className={`permission-card ${selectedRole.permissions.includes(perm) ? 'active' : ''}`}
                          onClick={() => {
                            if (selectedRole.name === '@everyone') return;
                            const newPerms = selectedRole.permissions.includes(perm)
                              ? selectedRole.permissions.filter(p => p !== perm)
                              : [...selectedRole.permissions, perm];
                            setSelectedRole({ ...selectedRole, permissions: newPerms });
                            handleUpdateRole(selectedRole._id, newPerms);
                          }}
                          style={{ cursor: selectedRole.name === '@everyone' ? 'not-allowed' : 'pointer', opacity: selectedRole.name === '@everyone' ? 0.5 : 1 }}
                        >
                          <span style={{ color: 'white', fontSize: '12px' }}>{perm}</span>
                          {selectedRole.permissions.includes(perm) && <ShieldCheckIcon width={16} color="#3ba55c" />}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <h3 style={{ color: 'white' }}>Yeni Rol Oluştur</h3>
                    <div className="form-section">
                      <label className="form-label">Rol Adı</label>
                      <input type="text" className="modern-input" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Renk</label>
                      <input type="color" style={{ width: '100%', height: '40px', border: 'none' }} value={newRoleColor} onChange={e => setNewRoleColor(e.target.value)} />
                    </div>
                    <button className="modern-btn btn-primary" onClick={handleCreateRole}>Oluştur</button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* --- TAB: İSTEKLER --- */}
          {activeTab === 'requests' && (
            <div className="settings-card">
              {requests.map(req => (
                <div key={req._id} className="info-row">
                  <span style={{ color: 'white', fontWeight: 'bold' }}>{req.user.username}</span>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="modern-btn btn-primary" onClick={() => axiosInstance.post(`${API_URL_BASE}/api/v1/servers/${serverId}/requests/${req._id}`, { status: 'accepted' }).then(() => setRequests(p => p.filter(r => r._id !== req._id))).then(() => fetchServerDetails(serverId))}>Kabul</button>
                    <button className="modern-btn btn-danger" onClick={() => axiosInstance.post(`${API_URL_BASE}/api/v1/servers/${serverId}/requests/${req._id}`, { status: 'rejected' }).then(() => setRequests(p => p.filter(r => r._id !== req._id)))}>Reddet</button>
                  </div>
                </div>
              ))}
              {requests.length === 0 && <p style={{ color: '#72767d', textAlign: 'center' }}>Bekleyen istek yok.</p>}
            </div>
          )}

          {/* --- TAB: ÜYELER (DÜZELTİLDİ: YÖNET BUTONU VE MODAL EKLENDİ) --- */}
          {activeTab === 'members' && (
            <>
              <div className="settings-card">
                {activeServer.members.map(m => (
                  <div key={m._id} className="info-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img src={m.user.avatarUrl ? `${API_URL_BASE}/api/v1/${m.user.avatarUrl}` : '/default-avatar.png'} style={{ width: 32, height: 32, borderRadius: '50%' }} />
                      <div>
                        <strong style={{ color: 'white', display: 'block' }}>{m.user.username}</strong>
                        <span style={{ fontSize: '12px', color: '#b9bbbe' }}>{m.roles.map(r => r.name).join(', ')}</span>
                      </div>
                    </div>

                    {/* 🟢 YENİ: DÜZENLE BUTONU */}
                    <button
                      className="modern-btn btn-secondary"
                      style={{ padding: '6px 12px' }}
                      onClick={() => setManagingMember(m)}
                    >
                      <PencilSquareIcon width={16} /> Yönet
                    </button>
                  </div>
                ))}
              </div>

              {/* 🟢 YENİ: ROL DÜZENLEME PANELİ */}
              {managingMember && (
                <MemberRoleManager
                  member={managingMember}
                  serverRoles={activeServer.roles}
                  serverId={serverId}
                  onUpdate={() => fetchServerDetails(serverId)}
                  onClose={() => setManagingMember(null)}
                />
              )}
            </>
          )}

          {/* --- TAB: YASAKLILAR --- */}
          {activeTab === 'bans' && (
            <div className="settings-card">
              <h3 style={{ color: 'white', marginBottom: '20px' }}>Yasaklı Kullanıcılar</h3>
              {bannedUsers.length === 0 ? <p style={{ color: '#72767d', textAlign: 'center' }}>Yasaklı kullanıcı yok.</p> :
                bannedUsers.map(ban => (
                  <div key={ban._id} className="info-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img src={ban.user.avatarUrl ? `${API_URL_BASE}/api/v1/${ban.user.avatarUrl}` : '/default-avatar.png'} style={{ width: 32, height: 32, borderRadius: '50%' }} />
                      <div>
                        <strong style={{ color: 'white', display: 'block' }}>{ban.user.username}</strong>
                        <span style={{ fontSize: '12px', color: '#b9bbbe' }}>Sebep: {ban.reason || 'Belirtilmedi'}</span>
                      </div>
                    </div>
                    <button className="modern-btn btn-secondary" onClick={() => handleUnban(ban.user._id)}>Yasağı Kaldır</button>
                  </div>
                ))
              }
            </div>
          )}

        </div>
      </div>

      {showDeleteModal && <DeleteServerModal serverName={activeServer.name} onClose={() => setShowDeleteModal(false)} onConfirm={() => { setShowDeleteModal(false); /* Silme fonksiyonu */ }} />}
    </div>
  );
};

export default ServerSettingsPage;