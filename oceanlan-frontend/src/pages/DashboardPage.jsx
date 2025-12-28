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
import { UsersIcon, XMarkIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/solid';

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
  const [showMobileMembers, setShowMobileMembers] = useState(false);

  // Kanal değişirse mobil menüyü otomatik kapat
  useEffect(() => {
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
    <div
      className="dashboard-layout"
      style={{
        position: 'relative',
        overflow: 'hidden',
        paddingTop: isApp ? '32px' : '0'
      }}
    >
      <TitleBar onContactClick={() => navigate('/dashboard/contact')} />

      <Sidebar unreadCount={unreadDmConversations?.length || 0} />

      <div className={`dashboard-main-row ${onServerRoute ? '' : 'single-column'}`}>

        {onServerRoute && (
          <div className="secondary-sidebar">
            <Routes>
              <Route path="server/:serverId/*" element={<ServerView />} />
            </Routes>
          </div>
        )}

        {isScreenPickerOpen && (
          <ScreenSharePickerModal
            onClose={() => setScreenPickerOpen(false)}
            onSelect={(sourceId) => {
              setScreenPickerOpen(false);
              if (screenShareCallback) screenShareCallback(sourceId);
            }}
          />
        )}

        <div className="main-content-area" style={{ position: 'relative' }}>

          {/* Mobilde Üyeler Butonu */}
          {onServerRoute && (
            <button
              className="mobile-members-toggle-btn"
              onClick={() => setShowMobileMembers(!showMobileMembers)}
            >
              {showMobileMembers ? <XMarkIcon width={24} /> : <UsersIcon width={24} />}
            </button>
          )}

          <Routes>
            <Route path="discover" element={<ServerDiscoveryPage />} />
            <Route path="feed" element={<FeedPage />} />
            <Route path="friends" element={<FriendsView />} />
            <Route path="all-dms" element={<AllDmsPage />} />
            <Route path="contact" element={<ContactPage />} />

            <Route path="server/:serverId/channels/squad-builder" element={<IlkonbirKurFrame />} />
            <Route path="server/:serverId/channels/tatildeki-rotam" element={<TatildekiRotamFrame />} />
            <Route path="server/:serverId/channel/:channelId" element={<ChatArea />} />

            {/* 🟢 DÜZELTME: Bu iki satır FeedPage'in yanlışlıkla açılmasını engeller */}
            <Route path="server/:serverId" element={<ServerWelcome />} />
            <Route path="server/:serverId/*" element={<ServerWelcome />} />

            <Route path="dm/:friendId/:conversationId" element={<DMView />} />
            <Route path="settings/stream" element={<StreamSettingsPage />} />
            <Route path="settings/profile" element={<UserProfilePage />} />
            <Route path="server/:serverId/settings" element={<ServerSettingsPage />} />
            <Route path="profile/:userId" element={<UserProfileViewPage />} />
            <Route path="settings/audio" element={<AudioSettingsPage />} />

            {/* Catch-all route */}
            <Route path="*" element={<FeedPage />} />
          </Routes>
        </div>

        {/* Server Üyeler Paneli */}
        {onServerRoute && (
          <div className={`server-members-wrapper ${showMobileMembers ? 'mobile-open' : ''}`}>
            {showMobileMembers && (
              <div
                className="mobile-backdrop"
                onClick={() => setShowMobileMembers(false)}
              />
            )}
            <div className="members-panel-content">
              <ServerMembersPanel />
            </div>
          </div>
        )}

      </div>

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