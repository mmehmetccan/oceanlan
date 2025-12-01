// src/pages/ServerSettingsPage.jsx
import React, { useContext, useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ServerContext } from '../context/ServerContext';
import { AuthContext } from '../context/AuthContext';
import { ToastContext } from '../context/ToastContext'; // 🔔 Toast Eklendi
import { checkUserPermission } from '../utils/permissionChecker';
import { useServerSocket } from '../hooks/useServerSocket';
import DeleteServerModal from '../components/modals/DeleteServerModal';
import ConfirmationModal from '../components/modals/ConfirmationModal'; // 🔔 Modal Eklendi
import axios from 'axios';
import axiosInstance from '../utils/axiosInstance'; // axiosInstance kullan

import '../styles/ServerSettings.css';


const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// İzinlerin listesi
const PERMISSIONS_LIST = [
  'ADMINISTRATOR', 'MANAGE_SERVER', 'MANAGE_ROLES', 'MANAGE_CHANNELS',
  'KICK_MEMBERS', 'BAN_MEMBERS', 'CREATE_INVITE', 'SEND_MESSAGES',
  'MANAGE_MESSAGES', 'VOICE_SPEAK', 'MUTE_MEMBERS', 'DEAFEN_MEMBERS'
];

// ... (MemberRoleManager bileşeni aynı, GİZLENDİ)
const MemberRoleManager = ({ member, serverRoles, serverId, onUpdate }) => {
  const [memberRoles, setMemberRoles] = useState(new Set(member.roles.map(r => r._id)));
  const { addToast } = useContext(ToastContext); // 🔔


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
      alert(`Hata: ${error.response?.data?.message}`);
      setMemberRoles(new Set(member.roles.map(r => r._id)));
    }
  };
  return (
    <div className="member-role-manager">
      <h4>{member.user.username} Rolleri</h4>
      <div className="permissions-grid">
        {serverRoles.map(role => {
          if (role.name === '@everyone') return null;
          return (
            <div key={role._id}>
              <input
                type="checkbox"
                id={`role-${member._id}-${role._id}`}
                checked={memberRoles.has(role._id)}
                onChange={() => handleRoleToggle(role._id)}
              />
              <label htmlFor={`role-${member._id}-${role._id}`} style={{ color: role.color }}>
                {role.name}
              </label>
            </div>
          )
        })}
      </div>
    </div>
  );
};
// MemberRoleManager GİZLENDİ


const ServerSettingsPage = () => {
  const { serverId } = useParams();
  const { activeServer, loading, fetchServerDetails, fetchUserServers } = useContext(ServerContext); // fetchUserServers eklendi
  const { user } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext); // 🔔
  const navigate = useNavigate(); // Yönlendirme için eklendi

  const [activeTab, setActiveTab] = useState('overview');
  const serverMemberCount = activeServer?.members?.length ?? activeServer?.memberCount ?? 0;

  // Rol yönetimi
  const [selectedRole, setSelectedRole] = useState(null);
  const [newRoleName, setNewRoleName] = useState('Yeni Rol');
  const [newRoleColor, setNewRoleColor] = useState('#99AAB5');
  const [newRolePermissions, setNewRolePermissions] = useState([]);

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
// 📢 YENİ: Ban ve Resim State'leri
  const [bannedUsers, setBannedUsers] = useState([]);
  const [serverIconFile, setServerIconFile] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, isDanger: false });
  useServerSocket(serverId);

  // --- İZİN KONTROLLERİ GÜNCELLENDİ ---
  const canManageServer = useMemo(() => {
    return checkUserPermission(activeServer, user?.id, 'ADMINISTRATOR');
  }, [activeServer, user?.id]);

  const isOwner = useMemo(() => {
    if (!activeServer || !user) return false;
    return activeServer.owner._id === user.id;
  }, [activeServer, user]);
  // ------------------------------------

  useEffect(() => {
      if (activeTab === 'bans' && serverId) {
          const fetchBans = async () => {
              try {
                  const res = await axiosInstance.get(`${API_URL_BASE}/api/v1/servers/${serverId}/bans`);
                  setBannedUsers(res.data.data);
              } catch (err) { console.error(err); }
          };
          fetchBans();
      }
  }, [activeTab, serverId]);

  // --- YENİ: Ban Kaldır ---
  const handleUnban = async (bannedUserId) => {
      try {
          await axiosInstance.delete(`${API_URL_BASE}/api/v1/servers/${serverId}/bans/${bannedUserId}`);
          setBannedUsers(prev => prev.filter(b => b.user._id !== bannedUserId));
            addToast('Yasak kaldırıldı.', 'success'); // 🔔
           } catch (err) {
        addToast('İşlem başarısız.', 'error');      }
  };

  // --- YENİ: Sunucu Resmi Yükle ---
  const handleIconUpload = async () => {
      if(!serverIconFile) return;
      const formData = new FormData();
      formData.append('icon', serverIconFile);

      try {
          await axiosInstance.put(`${API_URL_BASE}/api/v1/servers/${serverId}/icon`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
          });
          addToast('Sunucu resmi güncellendi!', 'success'); // 🔔
          setServerIconFile(null);
          fetchServerDetails(serverId);
          fetchUserServers(); // Sidebar'ı güncelle
      } catch (err) {
        addToast('Yükleme başarısız.', 'error');      }
  };

  // --- ROL İŞLEVLERİ (Aynı, GİZLENDİ) ---
  const handleCreateRole = async () => {
if (!newRoleName) return addToast('Rol adı boş olamaz.', 'warning'); // 🔔
    try {
      await axios.post(
        `${API_URL_BASE}/api/v1/servers/${serverId}/roles`,
        { name: newRoleName, color: newRoleColor, permissions: newRolePermissions }
      );
      alert('Rol oluşturuldu!');
      setNewRoleName('Yeni Rol');
      setNewRoleColor('#99AAB5');
      setNewRolePermissions([]);
      fetchServerDetails(serverId);
    } catch (error) {
addToast(`Hata: ${error.response?.data?.message}`, 'error');    }
  };
  const handleUpdateRolePermissions = async (roleId, permissions) => {
    try {
      await axios.put(
        `${API_URL_BASE}/api/v1/roles/${roleId}`,
        { permissions }
      );
      fetchServerDetails(serverId);
    } catch (error) {
addToast(`Hata: ${error.response?.data?.message}`, 'error');    }
  };
  const handleNewRolePermToggle = (perm) => {
    setNewRolePermissions(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    );
  };
  // Rol İşlevleri GİZLENDİ

  // --- KANAL İŞLEVLERİ (Aynı, GİZLENDİ) ---
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
      alert(`Hata: ${error.response?.data?.message || 'Kanal oluşturulamadı'}`);
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
  // Kanal İşlevleri GİZLENDİ

  // --- DAVET İŞLEVİ (Aynı, GİZLENDİ) ---
  const handleGenerateInvite = async () => {
    try {
      const res = await axios.post(`${API_URL_BASE}/api/v1/servers/${serverId}/invite`);
      fetchServerDetails(serverId);
      addToast(res.data.message || 'Yeni davet kodu oluşturuldu!', 'success');
    } catch (error) {
      addToast(`Hata: ${error.response?.data?.message || 'Kod oluşturulamadı'}`, 'error');
    }
  };
  // Davet İşlevi GİZLENDİ

  // --- YENİ SUNUCU SİLME İŞLEVİ ---
  const handleDeleteServer = async () => {
      if (!isOwner) {
          addToast("Sadece sunucu sahibi sunucuyu silebilir.", 'error');
          return;
      }

      try {
          await axios.delete(`${API_URL_BASE}/api/v1/servers/${serverId}`);
addToast("Sunucu başarıyla silindi.", 'success'); // 🔔
          await fetchUserServers();
          navigate('/dashboard/friends');
      } catch (error) {
addToast(`Hata: ${error.response?.data?.message || 'Sunucu silinemedi'}`, 'error');      }
  };
  // ------------------------------------


  if (loading || !activeServer || activeServer._id !== serverId) {
    return <div>Sunucu Ayarları Yükleniyor...</div>;
  }
  // YETKİ KONTROLÜ (Sadece Adminler girebilir)
  if (!canManageServer) {
    return (<div className="no-permission">Bu sayfayı görme yetkiniz yok.</div>);
  }

  return (
    <div className="server-settings-area fancy">
      <div className="server-settings-hero">
        <div className="server-settings-heading">
          <div className="server-chip">{activeServer.name?.charAt(0)?.toUpperCase()}</div>
          <div className="server-meta">
            <h1>{activeServer.name} Ayarları</h1>
            <p>Sunucu Sahibi: {activeServer.owner.username}</p>
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
        <button onClick={() => setActiveTab('overview')} className={activeTab === 'overview' ? 'active' : ''}>Genel
          Bakış
        </button>
        <button onClick={() => setActiveTab('channels')} className={activeTab === 'channels' ? 'active' : ''}>Kanallar
        </button>
        <button onClick={() => setActiveTab('roles')} className={activeTab === 'roles' ? 'active' : ''}>Roller</button>
        <button onClick={() => setActiveTab('members')} className={activeTab === 'members' ? 'active' : ''}>Üyeler
        </button>
        <button onClick={() => setActiveTab('bans')} className={activeTab === 'bans' ? 'active' : ''}>Yasaklamalar
        </button>

        <button onClick={() => setActiveTab('invites')} className={activeTab === 'invites' ? 'active' : ''}>Davetler
        </button>
      </div>

      <div className="settings-content">

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
                  <span className="value">{activeServer.owner.username}</span>
                </div>
                <div className="icon-upload-section"
                     style={{marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)'}}>
                  <h3 style={{fontSize: '14px', color: '#b9bbbe'}}>SUNUCU RESMİ</h3>
                  <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setServerIconFile(e.target.files[0])}
                        style={{color: '#fff'}}
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
                    <button onClick={() => setShowDeleteModal(true)} className="danger">
                      Sunucuyu Sil
                    </button>
                  </div>
              )}
            </section>
        )}

         {activeTab === 'bans' && (
            <section>
                <h2>Yasaklanmış Kullanıcılar</h2>
                <div className="bans-list">
                    {bannedUsers.length === 0 ? <p style={{color:'#b9bbbe'}}>Yasaklı kullanıcı yok.</p> : (
                        bannedUsers.map(ban => (
                            <div key={ban._id} className="ban-item" style={{
                                display:'flex', justifyContent:'space-between', alignItems:'center',
                                padding:'10px', background:'rgba(0,0,0,0.2)', marginBottom:'8px', borderRadius:'8px'
                            }}>
                                <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                    <div className="ban-avatar" style={{width:'32px', height:'32px', borderRadius:'50%', overflow:'hidden'}}>
                                        <img
                                            src={ban.user.avatarUrl.startsWith('/uploads') ? `${API_URL_BASE}/api/v1/${ban.user.avatarUrl}` : ban.user.avatarUrl}
                                            alt="avatar" style={{width:'100%', height:'100%', objectFit:'cover'}}
                                        />
                                    </div>
                                    <div>
                                        <div style={{fontWeight:'bold', color:'#fff'}}>{ban.user.username}</div>
                                        <div style={{fontSize:'12px', color:'#b9bbbe'}}>Sebep: {ban.reason}</div>
                                    </div>
                                </div>
                                <button onClick={() => handleUnban(ban.user._id)} className="pill-btn danger" style={{padding:'4px 10px', fontSize:'12px'}}>
                                    Yasağı Kaldır
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </section>
        )}

        {activeTab === 'channels' && (
            <section className="manager-section">
              <div className="panel-card">
                <div className="panel-head">
                  <h2>Kanalları Yönet</h2>
                  <button onClick={() => setSelectedChannel(null)} className="pill-btn">
                    + Yeni Kanal
                  </button>
                </div>
                <div className="channel-list">
                {activeServer.channels.map((channel) => (
                  <button
                    key={channel._id}
                    onClick={() => setSelectedChannel(channel)}
                    className={`pill-btn ghost ${selectedChannel?._id === channel._id ? 'active' : ''}`}
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
                  <span className="badge">{selectedChannel.type === 'voice' ? 'Ses' : 'Metin'}</span>
                )}
              </div>
              <form onSubmit={selectedChannel ? handleUpdateChannel : handleCreateChannel} className="form-grid">
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
                            id={`channel-role-${role._id}`}
                            checked={channelForm.allowedRoles.includes(role._id)}
                            onChange={() => handleChannelRoleToggle(role._id)}
                          />
                          <span style={{ color: role.color }}>{role.name}</span>
                        </label>
                      ))}
                  </div>
                </div>

                <div className="form-actions">
                  <button type="submit" className="pill-btn primary">
                    {selectedChannel ? 'Kaydet' : 'Oluştur'}
                  </button>
                  {selectedChannel && (
                    <button type="button" onClick={handleDeleteChannel} className="pill-btn danger">
                      Kanalı Sil
                    </button>
                  )}
                </div>
              </form>
            </div>
          </section>
        )}

        {activeTab === 'roles' && (
          <section>
            <h2>Rolleri Yönet</h2>
            <div className="role-manager-layout">
              <div className="role-list">
                <h4>Mevcut Roller</h4>
                {activeServer.roles && activeServer.roles.map(role => (
                  <button
                    key={role._id}
                    onClick={() => setSelectedRole(role)}
                    style={{ color: role.color, borderColor: role.color }}
                    className={selectedRole?._id === role._id ? 'active' : ''}
                  >
                    {role.name}
                  </button>
                ))}
                <hr />
                <button onClick={() => setSelectedRole(null)}>+ Yeni Rol Oluştur</button>
              </div>

              {selectedRole && (
                <div className="role-permissions">
                  <h3>{selectedRole.name} İzinleri</h3>
                  {selectedRole.name === '@everyone' ? (
                    <p>@everyone rolünün izinleri değiştirilemez.</p>
                  ) : (
                    <div className="permissions-grid">
                      {PERMISSIONS_LIST.map(perm => (
                        <div key={perm}>
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
                          <label htmlFor={`update-${perm}`}>{perm}</label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!selectedRole && (
                <div className="role-create-form">
                  <h3>Yeni Rol Oluştur</h3>
                  <label>Rol Adı</label>
                  <input type="text" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} />

                  <label>Rol Rengi</label>
                  <input type="color" value={newRoleColor} onChange={(e) => setNewRoleColor(e.target.value)} />

                  <label>Rol İzinleri</label>
                  <div className="permissions-grid">
                    {PERMISSIONS_LIST.map(perm => (
                      <div key={perm}>
                        <input
                          type="checkbox"
                          id={`new-${perm}`}
                          checked={newRolePermissions.includes(perm)}
                          onChange={() => handleNewRolePermToggle(perm)}
                        />
                        <label htmlFor={`new-${perm}`}>{perm}</label>
                      </div>
                    ))}
                  </div>
                  <button onClick={handleCreateRole}>Oluştur</button>
                </div>
              )}
            </div>
          </section>
        )}

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
                              <span className="member-roles">Rolleri: {member.roles.map((r) => r.name).join(', ')}</span>
                            </div>
                            <button onClick={() => setManagingMember(member)} className="pill-btn ghost">
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

        {activeTab === 'invites' && (
          <section>
            <h2>Davet Kodu</h2>
            {activeServer.inviteCode ? (
              <p>Mevcut Kod: <strong>{activeServer.inviteCode}</strong></p>
            ) : (
              <p>Henüz davet kodu oluşturulmadı.</p>
            )}
            <button onClick={handleGenerateInvite}>
              {activeServer.inviteCode ? 'Kodu Değiştir/Yönet' : 'Yeni Davet Kodu Oluştur'}
            </button>
          </section>
        )}

      </div>

      {showDeleteModal && <DeleteServerModal serverName={activeServer.name} onClose={() => setShowDeleteModal(false)} onConfirm={() => { setShowDeleteModal(false); handleDeleteServer(); }} />}

      {/* 🔔 ONAY PENCERESİ BİLEŞENİ */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(p => ({...p, isOpen: false}))}
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
