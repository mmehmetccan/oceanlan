// src/pages/DashboardPage.jsx
import React, { useContext, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import ServerView from '../components/views/ServerView';
import DMView from '../components/views/DMView';
import ChatArea from '../components/chat/ChatArea';
import VoiceRoom from '../components/chat/VoiceRoom.jsx';
import StreamSettingsPage from './StreamSettingsPage';
import ServerSettingsPage from './ServerSettingsPage';
import UserProfilePage from './UserProfilePage';
import FeedPage from './FeedPage';
import ScreenShareDisplay from '../components/chat/ScreenShareDisplay'; // 📢 YENİ: Buraya import et

import { useSocket } from '../hooks/useSocket';
import { VoiceContext } from '../context/VoiceContext';
import ServerMembersPanel from '../components/views/ServerMembersPanel';
import UserProfileViewPage from './UserProfileViewPage';
import { AuthContext } from '../context/AuthContext';

const DashboardPage = () => {
  const { socket } = useSocket();
  const { currentVoiceChannelId } = useContext(VoiceContext);
  const { dispatch, unreadDmConversations } = useContext(AuthContext);
  const location = useLocation();

  const onServerRoute = location.pathname.includes('/dashboard/server/');

  useEffect(() => {
    if (!socket) return;
    const handleUnreadDm = (data) => {
      dispatch({ type: 'NEW_UNREAD_DM', payload: { conversationId: data.conversationId } });
    };
    socket.on('unreadDm', handleUnreadDm);
    return () => {
      socket.off('unreadDm', handleUnreadDm);
    };
  }, [socket, dispatch]);

  return (
    <div className="dashboard-layout">
      <Sidebar unreadCount={unreadDmConversations?.length || 0} />

      <div className={`dashboard-main-row ${onServerRoute ? '' : 'single-column'}`}>
        
        {/* Sol Menü (ServerView) */}
        {onServerRoute && (
          <div className="secondary-sidebar">
            <Routes>
              <Route path="server/:serverId/*" element={<ServerView />} />
            </Routes>
          </div>
        )}

        {/* 📢 ANA İÇERİK ALANI */}
        <div className="main-content-area">
          
          {/* 📢 YENİ: EKRAN PAYLAŞIMINI BURAYA KOYUYORUZ */}
          {/* Sadece bir sunucu içindeysek veya sesli kanaldaysak göster */}
          <ScreenShareDisplay /> 

          <Routes>
            <Route path="feed" element={<FeedPage />} />
            <Route path="server/:serverId/channel/:channelId" element={<ChatArea />} />
            <Route path="dm/:friendId/:conversationId" element={<DMView />} />
            <Route path="settings/stream" element={<StreamSettingsPage />} />
            <Route path="settings/profile" element={<UserProfilePage />} />
            <Route path="server/:serverId/settings" element={<ServerSettingsPage />} />
            <Route path="profile/:userId" element={<UserProfileViewPage />} />
            {/* ServerView burada sidebar'da render olduğu için buraya tekrar koymaya gerek yok ama
                Route yapısı gereği 'fallback' olarak server route'u ana içeriğe bir şey basmıyor, 
                zaten kanala tıklayınca ChatArea doluyor. */}
            <Route path="*" element={<FeedPage />} />
          </Routes>
        </div>

        {onServerRoute && <ServerMembersPanel />}
      </div>

      {currentVoiceChannelId && <VoiceRoom />}
    </div>
  );
};

export default DashboardPage;