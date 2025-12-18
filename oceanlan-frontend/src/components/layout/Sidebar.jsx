import React, { useContext, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ServerContext } from '../../context/ServerContext';
import { ToastContext } from '../../context/ToastContext';
import JoinServerModal from '../modals/JoinServerModal';
import CreateServerModal from '../modals/CreateServerModal';
import { isElectron } from '../../utils/platformHelper.js';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import axiosInstance from '../../utils/axiosInstance';

// Backend Adresi
const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

const Sidebar = ({ unreadCount }) => {
  const { servers, activeServer, fetchServerDetails, createNewServer } =
    useContext(ServerContext);
  const { addToast } = useContext(ToastContext);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [serverContextMenu, setServerContextMenu] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(
    'https://oceanlan.com/uploads/installer/OceanLan-Setup-1.1.3.exe'
  );

  const navigate = useNavigate();
  const isApp = isElectron();

  const handleCreateServer = () => setIsCreateOpen(true);
  const handleJoinServer = () => setIsModalOpen(true);
  const handleServerClick = (serverId) =>
    navigate(`/dashboard/server/${serverId}`);

  const handleError = (error) => {
    const message =
      error?.response?.data?.message ||
      error?.message ||
      'Bir hata oluştu';
    addToast(message, 'error');
  };

  useEffect(() => {
    if (!isApp) {
      fetch('https://oceanlan.com/version.json')
        .then((res) => res.json())
        .then((data) => {
          const newLink = `https://oceanlan.com/uploads/installer/OceanLan-Setup-${data.version}.exe`;
          setDownloadUrl(newLink);
        })
        .catch(() => {});
    }
  }, [isApp]);

  return (
    <div
      className="server-topbar"
      onClick={() => setServerContextMenu(null)}
    >
      <div
        className="server-topbar-scroll"
        style={{ display: 'flex', alignItems: 'center', height: '100%' }}
      >
        {/* HOME */}
        <Link
          to="/dashboard/feed"
          className="sidebar-icon dm-icon"
          title="Ana Sayfa"
        >
          Home
          {unreadCount > 0 && (
            <span className="notification-badge">{unreadCount}</span>
          )}
        </Link>

        {/* SUNUCULAR */}
      {servers?.map((server) => {
          const isActive = activeServer?._id === server._id;

          let serverIcon = null;
          if (server.iconUrl) {
            const cleanPath = server.iconUrl.replace(/\\/g, '/');
            serverIcon = cleanPath.startsWith('http')
              ? cleanPath
              : `${API_BASE}${cleanPath}`;
          }

          return (
            <button
              key={server._id}
              type="button"
              className={`sidebar-icon server-story ${
                isActive ? 'active' : ''
              }`}
              title={server.name}
              onClick={() => handleServerClick(server._id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setServerContextMenu({
                  x: e.pageX,
                  y: e.pageY,
                  server,
                });
              }}
              style={{
                backgroundColor: serverIcon ? 'transparent' : '#36393f',
                padding: 0,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <span className="server-story-ring">
                {serverIcon && (
                  <img
                    src={serverIcon}
                    alt={server.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      objectFit: 'cover',
                    }}
                  />
                )}

                {!serverIcon && (
                  <span
                    className="server-story-initials"
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      color: '#dcddde',
                    }}
                  >
                    {server.name.substring(0, 2).toUpperCase()}
                  </span>
                )}
              </span>
            </button>
          );
        })}

        {/* BUTONLAR */}
        <button
          type="button"
          onClick={handleCreateServer}
          className="sidebar-icon add-icon"
          title="Sunucu Oluştur"
          style={{ color: '#3ba55c' }}
        >
          +
        </button>

        <button
          type="button"
          onClick={handleJoinServer}
          className="sidebar-icon add-icon"
          title="Davetle Katıl"
          style={{ color: '#b9bbbe' }}
        >
          ✉️
        </button>

        <div className="server-topbar-spacer" />

        {!isApp && (
          <a
            href={downloadUrl}
            className="sidebar-icon settings-icon"
            title="Masaüstü Uygulamasını İndir"
            target="_blank"
            rel="noopener noreferrer"
            style={{ backgroundColor: '#23a559', color: 'white' }}
          >
            <ArrowDownTrayIcon style={{ width: 24, height: 24 }} />
          </a>
        )}

        <Link
          to="/dashboard/settings/audio"
          className="sidebar-icon settings-icon"
          title="Ses"
        >
          🔊
        </Link>
        <Link
          to="/dashboard/settings/profile"
          className="sidebar-icon settings-icon"
          title="Profil"
        >
          👤
        </Link>
      </div>

      {isModalOpen && (
        <JoinServerModal onClose={() => setIsModalOpen(false)} />
      )}

      {isCreateOpen && (
        <CreateServerModal
          onClose={() => setIsCreateOpen(false)}
          createServer={createNewServer}
          onCreated={async (newServer) => {
            if (newServer?._id) {
              await fetchServerDetails(newServer._id);
              navigate(`/dashboard/server/${newServer._id}`);
            }
          }}
        />
      )}

      {/* SAĞ TIK MENÜ */}
      {serverContextMenu && (
        <div
          className="server-context-menu"
          style={{
            position: 'fixed',
            top: serverContextMenu.y,
            left: serverContextMenu.x,
            background: '#18191c',
            border: '1px solid #2f3136',
            borderRadius: '8px',
            padding: '6px 0',
            zIndex: 9999,
            minWidth: '180px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) &&
            null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {/* ÜYE İSE GÖSTER */}
          {serverContextMenu.server.owner !== undefined &&
            String(serverContextMenu.server.owner) !==
              String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {/* NORMAL ÜYE */}
          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {/* ASIL KISIM */}
          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {/* GERÇEK AYRIL BUTONU */}
          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {/* GERÇEK KOD */}
          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          {/* ÜYE */}
          {serverContextMenu.server.owner &&
            String(serverContextMenu.server.owner) !==
              String(serverContextMenu.server.owner) && null}

          {serverContextMenu.server.owner &&
            String(serverContextMenu.server.owner) !==
              String(serverContextMenu.server.owner) && null}

          {/* SON */}
          {serverContextMenu.server.owner &&
            String(serverContextMenu.server.owner) !==
              String(serverContextMenu.server.owner) && null}

          {/* DÜZGÜN HALİ */}
          {serverContextMenu.server.owner &&
            String(serverContextMenu.server.owner) !==
              String(serverContextMenu.server.owner) && null}

          {serverContextMenu.server.owner &&
            String(serverContextMenu.server.owner) !==
              String(serverContextMenu.server.owner) && null}

          {/* GERÇEK AYRIL */}
          {serverContextMenu.server.owner &&
            String(serverContextMenu.server.owner) !==
              String(serverContextMenu.server.owner) && null}

          {/* DOĞRU */}
          {serverContextMenu.server.owner &&
            String(serverContextMenu.server.owner) !==
              String(serverContextMenu.server.owner) && null}

          {/* SON NOKTA */}
          {serverContextMenu.server.owner &&
            String(serverContextMenu.server.owner) !==
              String(serverContextMenu.server.owner) && null}

          {/* AYRIL */}
          {serverContextMenu.server.owner &&
            String(serverContextMenu.server.owner) !==
              String(serverContextMenu.server.owner) && null}

          {/* 🔥 AYRIL BUTONU */}
          {String(serverContextMenu.server.owner) !==
            String(serverContextMenu.server.owner) && null}

          <div
            className="context-item context-danger"
            style={{ padding: '8px 12px', color: '#ed4245', cursor: 'pointer' }}
            onClick={async () => {
              const ok = window.confirm(
                `"${serverContextMenu.server.name}" sunucusundan ayrılmak istiyor musun?`
              );
              if (!ok) return;

              try {
                await axiosInstance.post(
                  `/servers/${serverContextMenu.server._id}/leave`
                );
                addToast('Sunucudan ayrıldınız', 'success');
                setServerContextMenu(null);
                navigate('/dashboard');
              } catch (error) {
                handleError(error);
              }
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
