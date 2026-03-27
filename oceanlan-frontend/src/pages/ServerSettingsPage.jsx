// src/pages/ServerSettingsPage.jsx
import React, { useContext, useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ServerContext } from '../context/ServerContext';
import { AuthContext } from '../context/AuthContext';
import { ToastContext } from '../context/ToastContext';
import { useServerSocket } from '../hooks/useServerSocket';
import DeleteServerModal from '../components/modals/DeleteServerModal';
import axiosInstance from '../utils/axiosInstance';
import { getImageUrl } from '../utils/urlHelper';
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
  PencilSquareIcon,
  CheckIcon // Kaydet ikonu eklendi
} from '@heroicons/react/24/solid';

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// 🟢 TÜRKÇE İZİN LİSTESİ VE AÇIKLAMALARI
const PERMISSION_DESCRIPTIONS = {
  'ADMINISTRATOR': { label: 'Yönetici', desc: 'Sunucudaki her yetkiye sahip olur (Tehlikeli!).' },
  'MANAGE_SERVER': { label: 'Sunucuyu Yönet', desc: 'Sunucu adını ve ayarlarını değiştirebilir.' },
  'MANAGE_ROLES': { label: 'Rolleri Yönet', desc: 'Rol oluşturabilir, düzenleyebilir ve silebilir.' },
  'MANAGE_CHANNELS': { label: 'Kanalları Yönet', desc: 'Kanal oluşturabilir, düzenleyebilir ve silebilir.' },
  'KICK_MEMBERS': { label: 'Üyeleri At', desc: 'Kullanıcıları sunucudan atabilir.' },
  'BAN_MEMBERS': { label: 'Üyeleri Yasakla', desc: 'Kullanıcıları sunucudan banlayabilir.' },
  'CREATE_INVITE': { label: 'Davet Oluştur', desc: 'Sunucuya davet linki oluşturabilir.' },
  'SEND_MESSAGES': { label: 'Mesaj Gönder', desc: 'Metin kanallarına mesaj yazabilir.' },
  'MANAGE_MESSAGES': { label: 'Mesajları Yönet', desc: 'Başkalarının mesajlarını silebilir.' },
  'VOICE_SPEAK': { label: 'Konuşma', desc: 'Sesli kanallarda konuşabilir.' },
  'MUTE_MEMBERS': { label: 'Üyeleri Sustur', desc: 'Sesli kanalda başkalarını susturabilir.' },
  'DEAFEN_MEMBERS': { label: 'Üyeleri Sağırlaştır', desc: 'Sesli kanalda başkalarını sağırlaştırabilir.' }
};

const PERMISSIONS_LIST = Object.keys(PERMISSION_DESCRIPTIONS);

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

// --- ÜYE ROL YÖNETİCİSİ (GÜNCELLENDİ: BUTONLU KAYDETME) ---
const MemberRoleManager = ({ member, serverRoles, serverId, onUpdate, onClose }) => {
  const [memberRoles, setMemberRoles] = useState(new Set((member.roles || []).filter(r => r).map(r => r._id)));
  const [hasChanges, setHasChanges] = useState(false);
  const { addToast } = useContext(ToastContext);

  const handleRoleToggle = (roleId) => {
    const newRolesSet = new Set(memberRoles);
    if (newRolesSet.has(roleId)) newRolesSet.delete(roleId);
    else newRolesSet.add(roleId);
    setMemberRoles(newRolesSet);
    setHasChanges(true);
  };

  const handleSaveRoles = async () => {
    try {
      await axiosInstance.put(`${API_URL_BASE}/api/v1/servers/${serverId}/members/${member._id}/roles`, { roles: Array.from(memberRoles) });
      addToast('Roller güncellendi.', 'success');
      onUpdate();
      setHasChanges(false);
    } catch (error) {
      addToast(`Hata: ${error.response?.data?.message}`, 'error');
    }
  };

  // 🟢 YENİ: BANLAMA FONKSİYONU
  const handleBan = async () => {
    const reason = prompt(`${member.user?.username} kullanıcısını yasaklamak için bir sebep girin:`);
    if (reason === null) return;
    try {
      await axiosInstance.post(`${API_URL_BASE}/api/v1/servers/${serverId}/members/${member._id}/ban`, { reason });
      addToast('Kullanıcı sunucudan yasaklandı.', 'success');
      onUpdate();
      onClose();
    } catch (error) {
      addToast('Yasaklama işlemi başarısız.', 'error');
    }
  };

  // 🟢 YENİ: SUNUCU GENELİ SUSTURMA/SAĞIRLAŞTIRMA
  const handleUpdateStatus = async (type, value) => {
  try {
    // URL'nin doğruluğundan emin olun: /api/v1/servers/:serverId/members/:memberId/status
    await axiosInstance.put(`/servers/${serverId}/members/${member._id}/status`, { 
      [type]: value 
    });
    
    addToast('İşlem başarılı.', 'success');
    onUpdate(); // Listeyi yenile
  } catch (error) {
    console.error("İstek Hatası:", error.response?.data);
    addToast(error.response?.data?.message || 'Yetkiniz yetersiz veya sunucu hatası.', 'error');
  }
};

  const validRoles = (serverRoles || []).filter(r => r && r.name !== '@everyone');

  return (
    <div className="settings-card" style={{ marginTop: '20px', border: '1px solid var(--accent-color)', paddingBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h4 style={{ color: 'white', margin: 0 }}>
          <span style={{ color: 'var(--accent-color)' }}>{member.user?.username}</span> Rollerini Düzenle
        </h4>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#b9bbbe', cursor: 'pointer' }}>
          <XMarkIcon width={20} />
        </button>
      </div>

      <div style={{ backgroundColor: 'rgba(255, 166, 0, 0.1)', border: '1px solid orange', borderRadius: '6px', padding: '10px', marginBottom: '20px' }}>
        <p style={{ color: 'orange', fontSize: '13px', margin: 0 }}>
          <strong>⚠️ Yetkili Notu:</strong> Buradan yapacağınız susturma veya sağırlaştırma işlemleri <strong>sunucu genelidir</strong>. 
          Kullanıcı hangi ses kanalına girerse girsin bu kısıtlamalar devam edecektir. Banlanan kullanıcılar "Yasaklılar" sekmesinden tekrar açılabilir.
        </p>
      </div>

      <div style={{ marginBottom: '25px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button 
          className={`modern-btn ${member.isMuted ? 'btn-primary' : 'btn-secondary'}`} 
          onClick={() => handleUpdateStatus('isMuted', !member.isMuted)}
        >
          {member.isMuted ? 'Susturmayı Kaldır' : 'Sunucuda Sustur'}
        </button>
        <button 
          className={`modern-btn ${member.isDeafened ? 'btn-primary' : 'btn-secondary'}`} 
          onClick={() => handleUpdateStatus('isDeafened', !member.isDeafened)}
        >
          {member.isDeafened ? 'Sağırlaştırmayı Kaldır' : 'Sunucuda Sağırlaştır'}
        </button>
        <button className="modern-btn btn-danger" onClick={handleBan}>
          Sunucudan Banla
        </button>
      </div>

      <div style={{ borderTop: '1px solid #444', paddingTop: '15px' }}>
        <h5 style={{ color: '#b9bbbe', marginBottom: '10px' }}>Rolleri Düzenle</h5>
        <div className="permission-grid">
          {validRoles.map(role => (
            <label key={role._id} className={`permission-card ${memberRoles.has(role._id) ? 'active' : ''}`} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: role.color || '#999' }}></span>
                <span style={{ color: memberRoles.has(role._id) ? '#fff' : '#b9bbbe' }}>{role.name}</span>
              </div>
              <input
                type="checkbox"
                checked={memberRoles.has(role._id)}
                onChange={() => handleRoleToggle(role._id)}
                style={{ width: 16, height: 16 }}
              />
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button className="modern-btn btn-secondary" onClick={onClose}>Kapat</button>
        <button
          className="modern-btn btn-primary"
          onClick={handleSaveRoles}
          disabled={!hasChanges}
          style={{ opacity: !hasChanges ? 0.5 : 1 }}
        >
          <CheckIcon width={16} /> Rol Değişikliklerini Kaydet
        </button>
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

  const [activeTab, setActiveTab] = useState('overview');

  // Kanal Yönetimi State
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [channelForm, setChannelForm] = useState({ name: '', type: 'text', maxUsers: 0, allowedRoles: [] });

  // Üye Yönetimi State
  const [managingMember, setManagingMember] = useState(null);

  // Diğer Stateler
  const [requests, setRequests] = useState([]);
  const [bannedUsers, setBannedUsers] = useState([]);
  const [serverIconFile, setServerIconFile] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [generalSettings, setGeneralSettings] = useState({
    name: '',
    isPublic: false,
    joinMode: 'direct'
  });

  // Rol Yönetimi State
  const [selectedRole, setSelectedRole] = useState(null);
  const [roleHasChanges, setRoleHasChanges] = useState(false); // Rol değişiklik kontrolü
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#99AAB5');
  const [newRolePermissions, setNewRolePermissions] = useState([]);

  useServerSocket(serverId);

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

  // Kanal Seçildiğinde Formu Doldur
  useEffect(() => {
    if (selectedChannel) {
      let safeRoles = [];
      if (selectedChannel.allowedRoles && Array.isArray(selectedChannel.allowedRoles)) {
        safeRoles = selectedChannel.allowedRoles
          .filter(r => r)
          .map(r => (typeof r === 'object' ? r._id : r));
      }

      setChannelForm({
        name: selectedChannel.name,
        type: selectedChannel.type,
        maxUsers: selectedChannel.maxUsers || 0,
        allowedRoles: safeRoles
      });
    } else {
      setChannelForm({ name: '', type: 'text', maxUsers: 0, allowedRoles: [] });
    }
  }, [selectedChannel]);

  // Rol değiştiğinde değişiklik sayacını sıfırla
  useEffect(() => {
    setRoleHasChanges(false);
  }, [selectedRole?._id]); // Sadece farklı bir role geçildiğinde sıfırla

  // --- FONKSİYONLAR ---
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

  const handleDeleteServer = async () => {
    try {
      await axiosInstance.delete(`${API_URL_BASE}/api/v1/servers/${serverId}`);
      addToast('Sunucu başarıyla silindi.', 'success');
      setShowDeleteModal(false);
      navigate('/dashboard/discover');
      fetchUserServers();
    } catch (error) {
      addToast(error.response?.data?.message || 'Sunucu silinemedi.', 'error');
    }
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
      fetchUserServers();
    } catch (e) { addToast('Yükleme hatası', 'error'); }
  };

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

  const handleCreateRole = async () => {
    if (!newRoleName) return;
    try {
      await axiosInstance.post(`${API_URL_BASE}/api/v1/servers/${serverId}/roles`, { name: newRoleName, color: newRoleColor, permissions: newRolePermissions });
      addToast('Rol oluşturuldu', 'success');
      fetchServerDetails(serverId);
      setNewRoleName('');
    } catch (e) { addToast('Hata', 'error'); }
  };

  // 🟢 YENİ: Rol Kaydetme Fonksiyonu (Butonla çalışır)
  const handleSaveRoleChanges = async () => {
    if (!selectedRole) return;
    try {
      await axiosInstance.put(`${API_URL_BASE}/api/v1/roles/${selectedRole._id}`, { permissions: selectedRole.permissions });
      addToast('Rol izinleri kaydedildi.', 'success');
      setRoleHasChanges(false);
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

  const safeChannels = (activeServer?.channels || []).filter(c => c);
  const safeRoles = (activeServer?.roles || []).filter(r => r);
  const safeMembers = (activeServer?.members || []).filter(m => m && m.user);

  if (loading || !activeServer) return <div style={{ padding: 40, color: 'white' }}>Yükleniyor...</div>;

  return (
    <div className="server-settings-container">

      <div className="settings-top-bar">
        <div className="settings-title-row">
          <div className="settings-server-name">
            {activeServer.name.toUpperCase()} AYARLARI
          </div>
          <div className="esc-button" onClick={() => navigate(`/dashboard/server/${serverId}`)} title="Çıkış (ESC)">
            <XMarkIcon width={24} />
          </div>
        </div>

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
          {showDeleteModal && (
            <DeleteServerModal
              serverName={activeServer.name}
              onClose={() => setShowDeleteModal(false)}
              onConfirm={handleDeleteServer}
            />
          )}
        </div>
      </div>

      <div className="settings-content-area">
        <div className="settings-inner">

          {/* --- TAB: GENEL BAKIŞ --- */}
          {activeTab === 'overview' && (
            <div className="settings-card">
              <h3 style={{ marginBottom: '20px', color: 'white' }}>Sunucu Görünümü</h3>
              <div style={{ display: 'flex', gap: '30px', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '100px', height: '100px', borderRadius: '50%',
                    background: '#202225', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', border: '2px solid var(--accent-color)'
                  }}>
                    {serverIconFile ? (
                      <img src={URL.createObjectURL(serverIconFile)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      // 🟢 DÜZELTME: getImageUrl kullanımı
                      activeServer.iconUrl ?
                        <img src={getImageUrl(activeServer.iconUrl)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> :
                        <span style={{ fontSize: '30px', color: 'white' }}>{activeServer.name.charAt(0)}</span>
                    )}
                  </div>
                  <label className="modern-btn btn-secondary" style={{ fontSize: '12px', padding: '5px 10px' }}>
                    Resim Seç
                    <input type="file" hidden onChange={e => setServerIconFile(e.target.files[0])} accept="image/*" />
                  </label>
                  {serverIconFile && <button className="modern-btn btn-primary" onClick={handleIconUpload}>Kaydet</button>}
                </div>

                <div style={{ flex: 1 }}>
                  <div className="form-section">
                    <label className="form-label">Sunucu Adı</label>
                    <input
                      type="text"
                      className="modern-input"
                      value={generalSettings.name}
                      onChange={(e) => setGeneralSettings({ ...generalSettings, name: e.target.value })}
                    />
                  </div>

                  <Switch
                    label="Herkese Açık Sunucu"
                    description="Bu sunucuyu Keşfet sayfasında listele."
                    checked={generalSettings.isPublic}
                    onChange={(e) => setGeneralSettings({ ...generalSettings, isPublic: e.target.checked })}
                  />

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

                  <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="modern-btn btn-primary"
                      onClick={handleSaveGeneralSettings}
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
              <div className="channel-list-sidebar">
                <button
                  className="modern-btn btn-primary"
                  style={{ width: '100%', marginBottom: '10px' }}
                  onClick={() => setSelectedChannel(null)}
                >
                  <PlusIcon width={16} /> Yeni Kanal Oluştur
                </button>

                <div className="channel-category-label">METİN KANALLARI</div>
                {safeChannels.filter(c => c.type === 'text').map(channel => (
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
                {safeChannels.filter(c => c.type === 'voice').map(channel => (
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
                      {safeRoles.filter(r => r.name !== '@everyone').map(role => (
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

          {/* --- TAB: ROLLER (DÜZENLENDİ: TÜRKÇE & KAYDET BUTONU) --- */}
          {activeTab === 'roles' && (
            <div className="channel-manager-layout">
              <div className="channel-list-sidebar">
                <button className="modern-btn btn-primary" style={{ width: '100%', marginBottom: '10px' }} onClick={() => setSelectedRole(null)}>
                  <PlusIcon width={16} /> Yeni Rol
                </button>
                {safeRoles.map(role => (
                  <div key={role._id} className={`channel-item-row ${selectedRole?._id === role._id ? 'active' : ''}`} onClick={() => setSelectedRole(role)}>
                    <div className="channel-icon-name">
                      <span style={{ width: 12, height: 12, borderRadius: '50%', background: role.color }}></span>
                      {role.name}
                    </div>
                  </div>
                ))}
              </div>

              <div className="channel-edit-panel">
                {selectedRole ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <h3 style={{ color: 'white', margin: 0 }}>{selectedRole.name} İzinleri</h3>
                      {/* 🟢 KAYDET BUTONU */}
                      <button
                        className="modern-btn btn-primary"
                        onClick={handleSaveRoleChanges}
                        disabled={!roleHasChanges}
                        style={{ opacity: !roleHasChanges ? 0.5 : 1, padding: '5px 15px', fontSize: '13px' }}
                      >
                        <CheckIcon width={16} /> Kaydet
                      </button>
                    </div>

                    <div className="permission-grid">
                      {PERMISSIONS_LIST.map(perm => {
                        const info = PERMISSION_DESCRIPTIONS[perm] || { label: perm, desc: '' };
                        const isActive = selectedRole.permissions.includes(perm);

                        return (
                          <div key={perm}
                            className={`permission-card ${isActive ? 'active' : ''}`}
                            onClick={() => {
                              if (selectedRole.name === '@everyone') return;
                              const newPerms = isActive
                                ? selectedRole.permissions.filter(p => p !== perm)
                                : [...selectedRole.permissions, perm];

                              setSelectedRole({ ...selectedRole, permissions: newPerms });
                              setRoleHasChanges(true); // Değişiklik oldu
                            }}
                            style={{
                              cursor: selectedRole.name === '@everyone' ? 'not-allowed' : 'pointer',
                              opacity: selectedRole.name === '@everyone' ? 0.5 : 1,
                              height: 'auto', // Yükseklik içeriğe göre
                              padding: '10px'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <strong style={{ color: isActive ? 'white' : '#b9bbbe', display: 'block', fontSize: '13px' }}>
                                  {info.label}
                                </strong>
                                <span style={{ fontSize: '11px', color: '#72767d', display: 'block', marginTop: '3px' }}>
                                  {info.desc}
                                </span>
                              </div>
                              {isActive && <ShieldCheckIcon width={20} color="#3ba55c" style={{ flexShrink: 0 }} />}
                            </div>
                          </div>
                        );
                      })}
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

          {/* --- TAB: ÜYELER --- */}
{activeTab === 'members' && (
  <>
    <div className="settings-card">
      {safeMembers.map(m => (
        <div key={m._id} className="info-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img
              src={getImageUrl(m.user?.avatarUrl)}
              onError={(e) => {
                e.target.onerror = null; // Sonsuz döngüyü engelle
                e.target.src = '/default-avatar.png'; // Buraya kesin var olan bir resim yolu koy
              }}
              style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
              alt={m.user?.username}
            />
            <div>
              <strong style={{ color: 'white', display: 'block' }}>{m.user?.username || 'Bilinmeyen Kullanıcı'}</strong>
              <span style={{ fontSize: '12px', color: '#b9bbbe' }}>
                {(m.roles || []).filter(r => r).map(r => r.name).join(', ') || 'Rol Yok'}
              </span>
            </div>
          </div>

          <button
            className="modern-btn btn-secondary"
            style={{ padding: '6px 12px' }}
            onClick={() => setManagingMember(m)}
          >
            <PencilSquareIcon width={16} /> Yönet
          </button>
        </div>
      ))}
      {safeMembers.length === 0 && <p style={{color: '#72767d', textAlign: 'center'}}>Sunucuda üye bulunamadı.</p>}
    </div>

    {managingMember && (
      <MemberRoleManager
        member={managingMember}
        serverRoles={safeRoles}
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
                      {/* 🟢 DÜZELTME: getImageUrl kullanımı */}
                      <img
                        src={getImageUrl(ban.user?.avatarUrl)}
                        onError={(e) => e.target.src = '/default-avatar.png'}
                        style={{ width: 32, height: 32, borderRadius: '50%' }}
                      />
                      <div>
                        <strong style={{ color: 'white', display: 'block' }}>{ban.user?.username || 'Bilinmeyen'}</strong>
                        <span style={{ fontSize: '12px', color: '#b9bbbe' }}>Sebep: {ban.reason || 'Belirtilmedi'}</span>
                      </div>
                    </div>
                    <button className="modern-btn btn-secondary" onClick={() => handleUnban(ban.user?._id)}>Yasağı Kaldır</button>
                  </div>
                ))
              }
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default ServerSettingsPage;