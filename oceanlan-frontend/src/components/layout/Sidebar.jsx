// src/components/layout/Sidebar.jsx
import React, { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ServerContext } from '../../context/ServerContext';
import JoinServerModal from '../modals/JoinServerModal';
import CreateServerModal from '../modals/CreateServerModal';
import { isElectron } from '../../utils/platformHelper.js'; // 👈 YARDIMCIYI IMPORT ET
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'; // İkon (Yüklü değilse npm install @heroicons/react)

// Backend adresi
const API_URL_BASE = import.meta.env.VITE_API_URL;

const Sidebar = ({ unreadCount }) => {
  const { servers, activeServer, fetchServerDetails, createNewServer } = useContext(ServerContext);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const navigate = useNavigate();

  const handleCreateServer = async () => {
    setIsCreateOpen(true);
  };

  const handleJoinServer = () => {
    setIsModalOpen(true);
  };

  const handleServerClick = (serverId) => {
    // Tıklayınca detayları çek (Gerekirse)
    // fetchServerDetails(serverId);
    navigate(`/dashboard/server/${serverId}`);
  };
const isApp = isElectron();
  return (
    <div className="server-topbar">
      <div className="server-topbar-scroll">
        {/* DM İkonu */}
        <Link
          to="/dashboard/friends"
          className="sidebar-icon dm-icon"
          title="Direkt Mesajlar"
        >
          Home
          {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
        </Link>

        {/* Sunucu Listesi */}
        {servers.map((server) => {
            const isActive = activeServer?._id === server._id;
            const hasIcon = !!server.iconUrl;

            // 📢 Resim URL'sini oluştur
            const fullIconUrl = hasIcon ? `${API_URL_BASE}${server.iconUrl}` : null;

            return (
              <button
                key={server._id}
                type="button"
                className={`sidebar-icon server-story ${isActive ? 'active' : ''}`}
                title={server.name}
                onClick={() => handleServerClick(server._id)}
                style={{
                    // Resim varsa arka plan şeffaf
                    backgroundColor: hasIcon ? 'transparent' : '#36393f',
                    padding: 0,
                    overflow: 'hidden'
                }}
              >
                <span className="server-story-ring">
                  {hasIcon ? (
                      <img
                        src={fullIconUrl}
                        alt={server.name}
                        style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            display: 'block'
                        }}
                        onError={(e) => {
                            // Resim hata verirse (404 vs) gizle ve harfleri göster
                            e.target.style.display = 'none';
                            if (e.target.nextSibling) {
                                e.target.nextSibling.style.display = 'flex';
                            }
                        }}
                      />
                  ) : null}

                  {/* Resim yoksa veya yüklenemezse görünecek Baş Harfler */}
                  <span
                    className="server-story-initials"
                    style={{ display: hasIcon ? 'none' : 'flex' }}
                  >
                    {server.name ? server.name.substring(0, 2).toUpperCase() : '??'}
                  </span>
                </span>
              </button>
            );
        })}

        {/* Aksiyon Butonları */}
        <button type="button" onClick={handleCreateServer} className="sidebar-icon add-icon" title="Sunucu Oluştur">+</button>
        <button type="button" onClick={handleJoinServer} className="sidebar-icon add-icon" title="Davetle Katıl">✉️</button>

        <div className="server-topbar-spacer" />
        {!isApp && (
            <a
              href="https://oceanlan.com/download/setup.exe" // 👈 İndirme Linki (Bunu aşağıda anlatacağım)
              className="sidebar-icon settings-icon"
              title="Masaüstü Uygulamasını İndir"
              style={{backgroundColor: '#23a559', color: 'white'}}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ArrowDownTrayIcon style={{width: '24px', height: '24px'}} />
            </a>
        )}
        {/* Ayarlar */}
        {/*<Link to="/dashboard/settings/stream" className="sidebar-icon settings-icon" title="Yayın Ayarları">📺</Link>*/}
        <Link to="/dashboard/settings/audio" className="sidebar-icon settings-icon" title="Ses Ayarları">🔊</Link>
        <Link to="/dashboard/settings/profile" className="sidebar-icon settings-icon" title="Profil Ayarları">👤</Link>
      </div>

      {isModalOpen && <JoinServerModal onClose={() => setIsModalOpen(false)} />}

      {isCreateOpen && (
        <CreateServerModal
          onClose={() => setIsCreateOpen(false)}
          createServer={createNewServer}
          // 📢 BUG ÇÖZÜMÜ: Sunucu oluşturulduğunda detayları çek
          onCreated={async (newServer) => {
            if (newServer && newServer._id) {
              // Detayları (rolleri, izinleri) çekiyoruz ki ayarlar butonu görünsün
              await fetchServerDetails(newServer._id);
              navigate(`/dashboard/server/${newServer._id}`);
            }
          }}
        />
      )}
    </div>
  );
};

export default Sidebar;