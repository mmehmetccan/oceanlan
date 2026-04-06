// src/components/layout/Sidebar.jsx
import React, { useContext, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ServerContext } from '../../context/ServerContext';
import { AuthContext } from '../../context/AuthContext';
import { ToastContext } from '../../context/ToastContext';
import axiosInstance from '../../utils/axiosInstance';
import JoinServerModal from '../modals/JoinServerModal';
import CreateServerModal from '../modals/CreateServerModal';
import DeleteServerModal from '../../components/modals/DeleteServerModal';
import { isElectron } from '../../utils/platformHelper.js';
import msIcon from "../../assets/ms-icon-310x310.png"; // yolu kendi yapına göre düzelt

// 🟢 DÜZELTME: 'CompassIcon' olmadığı için 'GlobeAltIcon' kullanıyoruz.
import {
    FolderIcon,
    UserIcon,
    PlusIcon,
    TicketIcon,      // CompassIcon yerine bu eklendi (Keşfet)
    SpeakerWaveIcon,   // Ses Ayarları
    ComputerDesktopIcon // Masaüstü İndir
} from '@heroicons/react/24/outline';

import ServerContextMenu from '../modals/ServerContextMenu';
import '../../styles/Sidebar.css';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

const Sidebar = ({ unreadCount }) => {
  const { servers, activeServer, fetchServerDetails, createNewServer, fetchUserServers, setServers } = useContext(ServerContext);
  const { user } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const navigate = useNavigate();
  const [contextMenu, setContextMenu] = useState(null);
  const [serverToDelete, setServerToDelete] = useState(null);

  // Drag & Drop State
  const [orderedItems, setOrderedItems] = useState([]);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [dropAction, setDropAction] = useState(null);
  const [dragSource, setDragSource] = useState(null);

const [downloadUrl, setDownloadUrl] = useState('https://oceanlan.com/uploads/installer/OceanLan-Setup-1.5.4.exe');
  const isApp = isElectron();

  useEffect(() => {
  if (!isApp) {
    fetch('https://oceanlan.com/version.json')
      .then(res => res.json())
      .then(data => {
        const newLink = `https://oceanlan.com/uploads/installer/OceanLan-Setup-${data.version}.exe`;
        setDownloadUrl(newLink);
        console.log("Güncel sürüm linki ayarlandı:", newLink);
      })
      .catch(err => {
        console.error("Versiyon bilgisi alınamadı.", err);
      });
  }
}, [isApp]);

  // 1. Verileri Yükle ve Sıralamayı Ayarla
  useEffect(() => {
    if (servers && servers.length > 0 && user) {
        const savedOrderKey = `sidebar_order_v5_${user._id}`;
        const savedOrder = localStorage.getItem(savedOrderKey);
        const currentItems = servers.map(s => ({ type: 'server', id: s._id, data: s }));

        if (savedOrder) {
            try {
                const parsed = JSON.parse(savedOrder);
                const serverCountInStorage = parsed.reduce((acc, item) => {
                    return acc + (item.type === 'server' ? 1 : (item.children ? item.children.length : 0));
                }, 0);

                if (serverCountInStorage !== servers.length) {
                    setOrderedItems(currentItems);
                } else {
                    const updatedOrder = parsed.map(item => {
                        if(item.type === 'server') {
                            const found = servers.find(s => s._id === item.id);
                            return found ? { ...item, data: found } : null;
                        }
                        if(item.type === 'folder') {
                             const foundChildren = item.children.map(cId => {
                                 const sId = typeof cId === 'object' ? cId._id : cId;
                                 return servers.find(sv => sv._id === sId);
                             }).filter(Boolean);
                             return foundChildren.length > 0 ? { ...item, children: foundChildren } : null;
                        }
                        return null;
                    }).filter(Boolean);
                    setOrderedItems(updatedOrder.length > 0 ? updatedOrder : currentItems);
                }
            } catch (e) {
                setOrderedItems(currentItems);
            }
        } else {
            setOrderedItems(currentItems);
        }
    } else if (servers && servers.length === 0) {
        setOrderedItems([]);
    }
  }, [servers, user]);

  const saveOrder = (newItems) => {
      setOrderedItems(newItems);
      if(user) {
          const simplified = newItems.map(item => {
              if(item.type === 'server') return { type: 'server', id: item.id };
              if(item.type === 'folder') {
                  const validChildIds = item.children.filter(c => c && c._id).map(c => c._id);
                  return { type: 'folder', id: item.id, isOpen: item.isOpen, children: validChildIds };
              }
              return null;
          }).filter(Boolean);
          localStorage.setItem(`sidebar_order_v5_${user._id}`, JSON.stringify(simplified));
      }
  }

  // --- DRAG EVENTS ---
  const handleDragStart = (e, index, parentIndex = null) => {
      const type = parentIndex !== null ? 'folder_child' : 'root';
      setDragSource({ type, index, parentIndex });
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", JSON.stringify({ index, parentIndex }));
  };

  const handleDragOver = (e, index) => {
    e.preventDefault(); e.stopPropagation();
    if (dragSource && dragSource.parentIndex === null && dragSource.index === index) return;
    setDragOverIndex(index);
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const width = rect.width;
    if (offsetX > width * 0.25 && offsetX < width * 0.75) setDropAction('combine');
    else setDropAction('reorder');
  };

  const handleDragLeave = () => {};

  const handleDrop = (e, targetIndex) => {
    e.preventDefault(); e.stopPropagation();
    setDragOverIndex(null); setDropAction(null);
    if (!dragSource) return;
    const newItems = [...orderedItems];
    let draggedItemData = null;

    if (dragSource.type === 'root') {
        draggedItemData = newItems[dragSource.index];
        newItems.splice(dragSource.index, 1);
        if (targetIndex > dragSource.index) targetIndex--;
    }
    else if (dragSource.type === 'folder_child') {
        const parentFolder = newItems[dragSource.parentIndex];
        draggedItemData = { type: 'server', id: parentFolder.children[dragSource.index]._id, data: parentFolder.children[dragSource.index] };
        parentFolder.children.splice(dragSource.index, 1);
        if (parentFolder.children.length === 0) {
            newItems.splice(dragSource.parentIndex, 1);
            if (targetIndex > dragSource.parentIndex) targetIndex--;
        }
    }

    if (!draggedItemData) return;

    if (dropAction === 'combine' && newItems[targetIndex]) {
        const targetItem = newItems[targetIndex];
        if (draggedItemData.type === 'folder') {
            newItems.splice(targetIndex, 0, draggedItemData);
        } else {
            if (targetItem.type === 'folder') {
                targetItem.children.push(draggedItemData.data);
                targetItem.isOpen = true;
            } else {
                const newFolder = { type: 'folder', id: `folder_${Date.now()}`, isOpen: true, children: [targetItem.data, draggedItemData.data] };
                newItems[targetIndex] = newFolder;
            }
        }
    } else {
        if (typeof targetIndex !== 'number') newItems.push(draggedItemData);
        else newItems.splice(targetIndex, 0, draggedItemData);
    }
    saveOrder(newItems);
    setDragSource(null);
  };

  const toggleFolder = (index) => {
      const newItems = [...orderedItems];
      newItems[index].isOpen = !newItems[index].isOpen;
      saveOrder(newItems);
  };

  const getIcon = (server) => {
    if (!server || !server.iconUrl) return null;
    const clean = server.iconUrl.replace(/\\/g, '/');
    return clean.startsWith('http') ? clean : `${API_BASE}${clean}`;
  };

  const handleCreateServer = () => setIsCreateOpen(true);
  const handleJoinServer = () => setIsModalOpen(true);
  const handleServerClick = (id) => navigate(`/dashboard/server/${id}`);

  const handleContextMenu = (e, server) => {
      e.preventDefault(); e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, server });
  };

  const handleLeaveServer = async (serverId) => {
      if(!window.confirm("Bu sunucudan ayrılmak istediğine emin misin?")) return;
      try {
          await axiosInstance.post(`/servers/${serverId}/leave`);
          addToast('Sunucudan başarıyla ayrıldınız.', 'info');
          if (fetchUserServers) await fetchUserServers();
          else if (setServers) setServers(prev => prev.filter(s => s._id !== serverId));
          const newItems = orderedItems.filter(item => {
             if(item.type === 'server') return item.id !== serverId;
             if(item.type === 'folder') {
                 item.children = item.children.filter(c => c._id !== serverId);
                 return item.children.length > 0;
             }
             return true;
          });
          saveOrder(newItems);
          navigate('/dashboard/feed');
      } catch (err) {
          addToast(err.response?.data?.message || 'Ayrılırken bir hata oluştu.', 'error');
      }
  };

  const handleOpenDeleteModal = (server) => {
    if (!server || !server._id) { addToast("Hata: Sunucu bilgisi alınamadı.", "error"); return; }
    setServerToDelete(server);
  };

  const handleConfirmDelete = async () => {
    if (!serverToDelete || !serverToDelete._id) { addToast("Silinecek sunucu seçili değil.", "error"); return; }
    try {
        await axiosInstance.delete(`/servers/${serverToDelete._id}`);
        addToast(`"${serverToDelete.name}" sunucusu silindi.`, 'success');
        if (fetchUserServers) await fetchUserServers();
        else if (setServers) setServers(prev => prev.filter(s => s._id !== serverToDelete._id));
        const newItems = orderedItems.filter(item => {
            if (item.type === 'server') return item.id !== serverToDelete._id;
            if (item.type === 'folder') {
                item.children = item.children.filter(c => c._id !== serverToDelete._id);
                return item.children.length > 0;
            }
            return true;
        });
        saveOrder(newItems);
        navigate('/dashboard/feed');
        setServerToDelete(null);
    } catch(e) {
        addToast(e.response?.data?.message || 'Sunucu silinemedi.', 'error');
    }
  };

  return (
    <div className="server-topbar">

      <div className="server-topbar-scroll"
           onDragOver={(e) => e.preventDefault()}
           onDrop={(e) => handleDrop(e, orderedItems.length)}
      >
        <Link to="/dashboard/feed" className="sidebar-icon" title="Ana Sayfa" style={{borderRadius: '12px'}}>
<img
  src={msIcon}
  alt="Home"
  style={{width: 24}}
  onError={(e) => (e.currentTarget.style.display = "none")}
/> {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
        </Link>

        {orderedItems.map((item, index) => {
            if (item.type === 'folder') {
                return (
                    <div
                        key={item.id}
                        className={`sidebar-folder-wrapper ${dragOverIndex === index && dropAction === 'combine' ? 'drag-over-combine' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, index)}
                    >
                        <div className="sidebar-icon folder-icon" onClick={(e) => { e.stopPropagation(); toggleFolder(index); }}>
                            {item.isOpen ? <FolderIcon width={20}/> : (
                                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2px'}}>
                                    {item.children.slice(0,4).map(c => <div key={c._id} style={{width:'8px', height:'8px', background:'#202225', borderRadius:'50%'}}/>)}
                                </div>
                            )}
                        </div>
                        {item.isOpen && item.children.map((child, childIdx) => (
                             <div
                                key={child._id}
                                className={`sidebar-icon ${activeServer?._id === child._id ? 'active' : ''}`}
                                draggable
                                onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, childIdx, index); }}
                                onClick={(e) => { e.stopPropagation(); handleServerClick(child._id); }}
                                onContextMenu={(e) => handleContextMenu(e, child)}
                                style={{width:'32px', height:'32px', minWidth:'32px', fontSize:'10px', marginLeft:'4px'}}
                             >
                                {getIcon(child) ? <img src={getIcon(child)} style={{width:'100%', borderRadius:'inherit'}}/> : child.name.substring(0,2)}
                             </div>
                        ))}
                    </div>
                );
            }

            const srv = item.data;
            if (!srv || !srv._id) return null;
            const icon = getIcon(srv);
            const isActive = activeServer?._id === srv._id;
            const isDragOver = dragOverIndex === index;

            return (
                <div
                    key={srv._id}
                    className={`sidebar-icon ${isActive ? 'active' : ''}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onClick={() => handleServerClick(srv._id)}
                    onContextMenu={(e) => handleContextMenu(e, srv)}
                    style={{
                        transform: isDragOver && dropAction === 'combine' ? 'scale(1.1)' : 'none',
                        border: isDragOver && dropAction === 'combine' ? '2px dashed #5865f2' : 'none'
                    }}
                >
                    <span className="server-story-ring" style={{width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center'}}>
                        {icon ? (
                            <img src={icon} alt={srv.name} style={{width:'100%', height:'100%', objectFit:'cover'}} />
                        ) : srv.name.substring(0, 2).toUpperCase()}
                    </span>
                </div>
            );
        })}

        {/* Sunucu Ekleme Butonları */}
        <button className="sidebar-icon" onClick={handleCreateServer} style={{color:'#3ba55c'}} title="Sunucu Oluştur">
            <PlusIcon width={24}/>
        </button>

        {/* 🟢 YENİ İKON: Arrow yerine GlobeAltIcon (Keşfet/Katıl) */}
          <button className="sidebar-icon green-hover" onClick={handleJoinServer} title="Sunucuya Katıl">
              <TicketIcon width={24}/>
          </button>
      </div>

        <div className="server-topbar-spacer"/>

        {/* MASAÜSTÜ UYGULAMASI İNDİR BUTONU (METİN OLARAK) */}
        {!isApp && (
        <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#23a559',
                color: 'white',
                padding: '6px 10px',
                borderRadius: '8px',
                textDecoration: 'none',

                // 🟢 KONUM AYARLARI:
                marginBottom: '15px', // Ayarların üzerine binmesin
                marginTop: '10px',    // Yukarıdan biraz aşağı insin
                marginRight: '12px',  // Biraz sola kaysın (Sağdan iterek)

                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                transition: 'all 0.2s',
                gap: '8px' // İkon ile yazı arası
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1e8e4c'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#23a559'}
        >
            <ComputerDesktopIcon width={20} />

            {/* 🟢 METİN DÜZENİ: ALT ALTA */}
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.1', textAlign: 'left' }}>
                <span style={{ fontSize: '9px', opacity: 0.9 }}>Masaüstü Uygulamasını</span>
                <span style={{ fontSize: '13px', fontWeight: '800', letterSpacing: '0.5px' }}>İNDİR</span>
            </div>
        </a>
      )}

      {/* ALT BUTONLAR (SES ve PROFİL) */}
      <div style={{display:'flex', gap:'8px', justifyContent: 'center'}}>

        {/* 🟢 YENİ İKON: Ses Ayarları için SpeakerWaveIcon */}
        <div className="sidebar-icon" onClick={() => navigate('/dashboard/settings/audio')} title="Ses Ayarları" style={{color: '#b9bbbe'}}>
            <SpeakerWaveIcon width={20}/>
        </div>

        <div className="sidebar-icon" onClick={() => navigate('/dashboard/settings/profile')} title="Profil" style={{color: '#b9bbbe'}}>
            <UserIcon width={20}/>
        </div>
      </div>

      {isModalOpen && <JoinServerModal onClose={() => setIsModalOpen(false)} />}
      {isCreateOpen && (
        <CreateServerModal
            onClose={() => setIsCreateOpen(false)}
            createServer={createNewServer}
            onCreated={async (s) => { await fetchServerDetails(s._id); if(fetchUserServers) await fetchUserServers(); navigate(`/dashboard/server/${s._id}`); }}
        />
      )}

      {serverToDelete && (
        <DeleteServerModal
          serverName={serverToDelete.name}
          onClose={() => setServerToDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      )}

      {contextMenu && (
        <ServerContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          server={contextMenu.server}
          user={user}
          onClose={() => setContextMenu(null)}
          onLeave={handleLeaveServer}
          onDelete={() => handleOpenDeleteModal(contextMenu.server)}
          onSettings={(srv) => navigate(`/dashboard/server/${srv._id}/settings`)}
        />
      )}
    </div>
  );
};

export default Sidebar;