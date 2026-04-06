// src/pages/DashboardPage.jsx
import React, { useContext, useEffect, useState } from 'react';
import { Routes, Route, useLocation, useNavigate, useParams } from 'react-router-dom';

import Sidebar from '../components/layout/Sidebar';
import ServerView from '../components/views/ServerView';
import DMView from '../components/views/DMView';
import ChatArea from '../components/chat/ChatArea';
import VoiceRoom from '../components/chat/VoiceRoom.jsx';
import StreamSettingsPage from './StreamSettingsPage';
import ServerSettingsPage from './ServerSettingsPage';
import UserProfilePage from './UserProfilePage';
import FeedPage from './FeedPage';
import AudioSettingsPage from './AudioSettingsPage';
import ContactPage from './ContactPage';
import FriendsView from '../components/views/FriendsView';
import AllDmsPage from './AllDmsPage';
import UserProfileViewPage from './UserProfileViewPage';
import TitleBar from '../components/layout/TitleBar';
import ServerMembersPanel from '../components/views/ServerMembersPanel';
import ScreenSharePickerModal from '../components/modals/ScreenSharePickerModal';
import ServerDiscoveryPage from './ServerDiscoveryPage';
// Entegrasyonlar
import IlkonbirKurFrame from '../components/integrations/IlkonbirKurFrame';
import TatildekiRotamFrame from '../components/integrations/TatildekiRotamFrame';

import { useSocket } from '../hooks/useSocket';
import { VoiceContext } from '../context/VoiceContext';
import { AuthContext } from '../context/AuthContext';
import { ToastContext } from '../context/ToastContext';
import { isElectron } from '../utils/platformHelper';

// İkonlar
import { UsersIcon, XMarkIcon, ChatBubbleLeftRightIcon, Bars3CenterLeftIcon } from '@heroicons/react/24/solid';
import '../styles/DashboardPage.css';


// 🟢 YENİ: Sunucuya girince kanal seçilmediyse çıkacak boş ekran
const ServerWelcome = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#b9bbbe',
    textAlign: 'center',
    padding: '20px'
  }}>
    <div style={{ fontSize: '4rem', marginBottom: '20px', filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.5))' }}>👋</div>
    <h2 style={{ color: 'white', marginBottom: '10px' }}>Sunucuya Hoş Geldin!</h2>
    <p style={{ maxWidth: '400px' }}>
      <ChatBubbleLeftRightIcon width={20} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '5px' }} />
      Sohbete başlamak veya sesli odalara katılmak için soldaki menüden bir <strong>kanal seçebilirsin.</strong>
    </p>
  </div>
);

const DashboardPage = () => {
  const { socket } = useSocket();
  const {
    currentVoiceChannelId,
    joinVoiceChannel,
    isScreenPickerOpen,
    setScreenPickerOpen,
    screenShareCallback
  } = useContext(VoiceContext);

  const { serverId } = useParams();
  const { dispatch, unreadDmConversations } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);
  const location = useLocation();
  const navigate = useNavigate();
  const isApp = isElectron();

  const onServerRoute = location.pathname.includes('/dashboard/server/');

  // Mobilde üyeler panelini açıp kapatmak için state
  const [showMobileChannels, setShowMobileChannels] = useState(false); // Sol Çekmece
  const [showMobileMembers, setShowMobileMembers] = useState(false);   // Sağ Çekmece

  // Sayfa değişince her şeyi kapat
  useEffect(() => {
    setShowMobileChannels(false);
    setShowMobileMembers(false);
  }, [location.pathname]);

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onUpdateMessage) {
      window.electronAPI.onUpdateMessage(({ type, text }) => {
        if (type === 'success') addToast(text, 'success');
        else if (type === 'error') addToast(text, 'error');
        else addToast(text, 'info');
      });
    }
  }, [addToast]);

  useEffect(() => {
    if (!socket) return;
    const handleUnreadDm = (data) => {
      dispatch({ type: 'NEW_UNREAD_DM', payload: { conversationId: data.conversationId } });
      addToast("Yeni bir mesajın var!", "info");
    };
    const handleForceJoin = ({ serverId, channelId }) => {
      joinVoiceChannel(serverId, channelId);
    };
    socket.on('unreadDm', handleUnreadDm);
    socket.on('force-join-voice-channel', handleForceJoin);
    return () => {
      socket.off('unreadDm', handleUnreadDm);
      socket.off('force-join-voice-channel', handleForceJoin);
    };
  }, [socket, dispatch, joinVoiceChannel, addToast]);

  // Sunucudan atılma kontrolü
  useEffect(() => {
    if (!socket) return;

    const handleRemoved = (data) => {
      if (serverId && data.serverId === serverId) {
        console.log("Sunucudan ayrıldınız/atıldınız.");
        navigate('/dashboard/feed');
        addToast('Sunucudan ayrıldınız veya atıldınız.', 'info');
      }
    };

    socket.on('removed-from-server', handleRemoved);
    return () => socket.off('removed-from-server', handleRemoved);
  }, [socket, serverId, navigate, addToast]);

  return (
    <div className="dashboard-layout" style={{ paddingTop: isApp ? '32px' : '0' }}>
     <Sidebar unreadCount={unreadDmConversations?.length || 0} />
    
    <TitleBar onContactClick={() => navigate('/dashboard/contact')} />
      {/* 📱 MOBİL BUTONLAR */}
      {onServerRoute && (
        <>
          <button className="db-trigger db-left-btn" onClick={() => setShowMobileChannels(true)}>
            <Bars3CenterLeftIcon width={24} />
          </button>
          <button className="db-trigger db-right-btn" onClick={() => setShowMobileMembers(true)}>
            <UsersIcon width={24} />
          </button>
        </>
      )}

      <div className={`dashboard-main-row ${onServerRoute ? '' : 'single-column'}`}>
        
        {/* 🟢 SOL ÇEKMECE (Kanallar) */}
        {onServerRoute && (
          <>
            <div className={`db-overlay ${showMobileChannels ? 'active' : ''}`} onClick={() => setShowMobileChannels(false)} />
            <aside className={`secondary-sidebar ${showMobileChannels ? 'db-open' : ''}`}>
               <div className="db-drawer-header">
                 <span>SUNUCU MENÜSÜ</span>
                 <button onClick={() => setShowMobileChannels(false)}><XMarkIcon width={20}/></button>
               </div>
              <Routes>
                <Route path="server/:serverId/*" element={<ServerView />} />
              </Routes>
            </aside>
          </>
        )}

        {/* ORTA PANEL (Ana İçerik Alanı) */}
        <main className="main-content-area" style={{ position: 'relative' }}>
          <Routes>
            <Route path="discover" element={<ServerDiscoveryPage />} />
            <Route path="feed" element={<FeedPage />} />
            <Route path="friends" element={<FriendsView />} />
            <Route path="all-dms" element={<AllDmsPage />} />
            <Route path="contact" element={<ContactPage />} />

            <Route path="server/:serverId/channels/squad-builder" element={<IlkonbirKurFrame />} />
            <Route path="server/:serverId/channels/tatildeki-rotam" element={<TatildekiRotamFrame />} />
            <Route path="server/:serverId/channel/:channelId" element={<ChatArea />} />

            {/* Sunucu Karşılama Sayfaları */}
            <Route path="server/:serverId" element={<ServerWelcome />} />
            <Route path="server/:serverId/*" element={<ServerWelcome />} />

            <Route path="dm/:friendId/:conversationId" element={<DMView />} />
            <Route path="settings/stream" element={<StreamSettingsPage />} />
            <Route path="settings/profile" element={<UserProfilePage />} />
            <Route path="server/:serverId/settings" element={<ServerSettingsPage />} />
            <Route path="profile/:userId" element={<UserProfileViewPage />} />
            <Route path="settings/audio" element={<AudioSettingsPage />} />

            <Route path="*" element={<FeedPage />} />
          </Routes>
        </main>

        {/* 🟢 SAĞ PANEL (Üyeler - Drawer) */}
        {/* 🟢 SAĞ ÇEKMECE (Üyeler) */}
        {onServerRoute && (
          <>
            <div className={`db-overlay ${showMobileMembers ? 'active' : ''}`} onClick={() => setShowMobileMembers(false)} />
            <aside className={`server-members-wrapper ${showMobileMembers ? 'db-open' : ''}`}>
               <div className="db-drawer-header">
                 <span>ÜYELER</span>
                 <button onClick={() => setShowMobileMembers(false)}><XMarkIcon width={20}/></button>
               </div>
              <div className="members-panel-content">
                <ServerMembersPanel />
              </div>
            </aside>
          </>
        )}
      </div>

      

      {/* Sesli Kanal Kontrol Paneli */}
      {currentVoiceChannelId && (
        <div style={{ 
          position: 'absolute', 
          bottom: 0, 
          left: 72, 
          width: 240, 
          zIndex: 9999, 
          backgroundColor: '#292b2f', 
          borderTop: '1px solid #3f4147' 
        }}>
          <VoiceRoom />
        </div>
      )}
    </div>
  );
};

export default DashboardPage;