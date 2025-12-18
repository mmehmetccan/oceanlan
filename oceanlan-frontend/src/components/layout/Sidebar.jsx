// src/components/layout/Sidebar.jsx
import React, { useContext, useState ,useEffect} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ServerContext } from '../../context/ServerContext';
import JoinServerModal from '../modals/JoinServerModal';
import CreateServerModal from '../modals/CreateServerModal';
import { isElectron } from '../../utils/platformHelper.js';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import axiosInstance from '../../utils/axiosInstance';

// Backend Adresi
const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

const Sidebar = ({ unreadCount }) => {
  const { servers, activeServer, fetchServerDetails, createNewServer } = useContext(ServerContext);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const navigate = useNavigate();
const [serverContextMenu, setServerContextMenu] = useState(null);

  const handleCreateServer = async () => { setIsCreateOpen(true); };
  const handleJoinServer = () => { setIsModalOpen(true); };
  const handleServerClick = (serverId) => { navigate(`/dashboard/server/${serverId}`); };

  const [downloadUrl, setDownloadUrl] = useState('https://oceanlan.com/uploads/installer/OceanLan-Setup-1.1.3.exe');
  const isApp = isElectron();

  useEffect(() => {
    if (!isApp) {
      fetch('https://oceanlan.com/version.json')
        .then(response => response.json())
        .then(data => {
          // package.json build ayarına uygun link yapısı:
          const newLink = `https://oceanlan.com/uploads/installer/OceanLan-Setup-${data.version}.exe`;
          setDownloadUrl(newLink);
        })
        .catch(err => {
          console.error("Sidebar versiyon kontrolü başarısız:", err);
        });
    }
  }, [isApp]);

  return (
    <div className="server-topbar">
      {/* DÜZELTME: paddingTop kaldırıldı. CSS'teki align-items: center sayesinde tam ortalanacak. */}
      <div className="server-topbar-scroll" style={{ display: 'flex', alignItems: 'center', height: '100%' }}>

        {/* Ana Sayfa (Home) */}
        <Link to="/dashboard/feed" className="sidebar-icon dm-icon" title="Ana Sayfa">
          Home
          {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
        </Link>

        {/* Sunucular hemen sağdan başlar (Boşluk/Divider yok) */}

        {/* SUNUCU LİSTESİ */}
        {servers.map((server) => {
            const isActive = activeServer?._id === server._id;

            // Resim URL Hazırlığı
            let serverIcon = null;
            if (server.iconUrl) {
                const cleanPath = server.iconUrl.replace(/\\/g, '/');
                serverIcon = cleanPath.startsWith('http') ? cleanPath : `${API_BASE}${cleanPath}`;
            }

            return (
              <button
                key={server._id}
                type="button"
                className={`sidebar-icon server-story ${isActive ? 'active' : ''}`}
                title={server.name}
                onClick={() => handleServerClick(server._id)}
                 onContextMenu={(e) => {
    e.preventDefault();
    setServerContextMenu({
      x: e.pageX,
      y: e.pageY,
      server
    });
  }}
  style={{
    backgroundColor: serverIcon ? 'transparent' : '#36393f',
    padding: 0,
    overflow: 'hidden',
    position: 'relative'
  }}
>
                <span className="server-story-ring">
                  {serverIcon ? (
                      <img
                        src={serverIcon}
                        alt={server.name}
                        style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            display: 'block'
                        }}
                        onError={(e) => {
                            e.target.style.display = 'none';
                            const initials = e.target.parentNode.querySelector('.server-story-initials');
                            if (initials) initials.style.display = 'flex';
                        }}
                      />

                  ) : null}

                  <span
                    className="server-story-initials"
                    style={{
                        display: serverIcon ? 'none' : 'flex',
                        width: '100%', height: '100%',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: '14px', fontWeight: 'bold', color: '#dcddde'
                    }}
                  >
                    {server.name ? server.name.substring(0, 2).toUpperCase() : '??'}
                  </span>
                </span>

              </button>

            );
        })}

        {/* İşlem Butonları */}
        <button type="button" onClick={handleCreateServer} className="sidebar-icon add-icon" title="Sunucu Oluştur" style={{color:'#3ba55c'}}>+</button>
        <button type="button" onClick={handleJoinServer} className="sidebar-icon add-icon" title="Davetle Katıl" style={{color:'#b9bbbe'}}>✉️</button>

        {/* Sağ tarafa yaslanan ikonlar */}
        <div className="server-topbar-spacer" />

        {!isApp && (
            <a href={downloadUrl}
               className="sidebar-icon settings-icon"
               title={`Masaüstü Uygulamasını İndir`}
               style={{backgroundColor: '#23a559', color: 'white'}}
               target="_blank"
               rel="noopener noreferrer">
              <ArrowDownTrayIcon style={{width: '24px', height: '24px'}} />
            </a>
        )}

        <Link to="/dashboard/settings/audio" className="sidebar-icon settings-icon" title="Ses">🔊</Link>
        <Link to="/dashboard/settings/profile" className="sidebar-icon settings-icon" title="Profil">👤</Link>
      </div>

      {isModalOpen && <JoinServerModal onClose={() => setIsModalOpen(false)} />}

      {isCreateOpen && (
        <CreateServerModal
          onClose={() => setIsCreateOpen(false)}
          createServer={createNewServer}
          onCreated={async (newServer) => {
            if (newServer && newServer._id) {
              await fetchServerDetails(newServer._id);
              navigate(`/dashboard/server/${newServer._id}`);
            }
          }}
        />
      )}
      {serverContextMenu && (
  <div
    className="server-context-menu"
    style={{
      position: 'fixed',
      top: serverContextMenu.y,
      left: serverContextMenu.x,
      background: '#18191c',
      border: '1px solid #2f3136',
      borderRadius: '6px',
      padding: '6px 0',
      zIndex: 9999,
      minWidth: '180px'
    }}
    onClick={() => setServerContextMenu(null)}
  >
    <div
      className="context-item context-danger"
      style={{
        padding: '8px 12px',
        cursor: 'pointer',
        color: '#ed4245'
      }}
      onClick={async () => {
        const ok = window.confirm(
          `"${serverContextMenu.server.name}" sunucusundan ayrılmak istiyor musun?`
        );
        if (!ok) return;

        await axiosInstance.post(
          `/servers/${serverContextMenu.server._id}/leave`
        );

        setServerContextMenu(null);
        navigate('/dashboard'); // server listesinin olduğu yer
      }}
    >
      🚪 Sunucudan Ayrıl
    </div>
  </div>
)}
      
    </div>
  );
};

export default Sidebar;