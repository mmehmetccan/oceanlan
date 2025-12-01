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
import ScreenShareDisplay from '../components/chat/ScreenShareDisplay';
import AudioSettingsPage from './AudioSettingsPage';

import { useSocket } from '../hooks/useSocket';
import { VoiceContext } from '../context/VoiceContext';
import ServerMembersPanel from '../components/views/ServerMembersPanel';
import UserProfileViewPage from './UserProfileViewPage';
import { AuthContext } from '../context/AuthContext';

import FriendsView from '../components/views/FriendsView';
import AllDmsPage from './AllDmsPage';

import TitleBar from '../components/layout/TitleBar'; // 👈 YENİ İMPORT
import { isElectron } from '../utils/platformHelper';

const DashboardPage = () => {
  const { socket } = useSocket();
  const { currentVoiceChannelId, joinVoiceChannel } = useContext(VoiceContext);
  const { dispatch, unreadDmConversations } = useContext(AuthContext);
  const location = useLocation();
const isApp = isElectron();
  const onServerRoute = location.pathname.includes('/dashboard/server/');

  useEffect(() => {
    if (!socket) return;

    const handleUnreadDm = (data) => {
      dispatch({ type: 'NEW_UNREAD_DM', payload: { conversationId: data.conversationId } });
    };

    // Ses kanalına zorla taşıma (Move User) dinleyicisi
    const handleForceJoin = ({ serverId, channelId }) => {
        console.log(`[Dashboard] Zorunlu taşıma alındı: ${channelId}`);
        joinVoiceChannel(serverId, channelId);
    };

    socket.on('unreadDm', handleUnreadDm);
    socket.on('force-join-voice-channel', handleForceJoin);

    return () => {
      socket.off('unreadDm', handleUnreadDm);
      socket.off('force-join-voice-channel', handleForceJoin);
    };
  }, [socket, dispatch, joinVoiceChannel]);

  return (
    <div className="dashboard-layout"
style={{
        position: 'relative',
        overflow: 'hidden',
        // Eğer App ise üstten boşluk bırak (TitleBar yüksekliği kadar)
        paddingTop: isApp ? '32px' : '0'
      }}
    >
      {/* 📢 BAŞLIK ÇUBUĞU EN ÜSTE */}
      <TitleBar />
      <Sidebar unreadCount={unreadDmConversations?.length || 0} />

      <div className={`dashboard-main-row ${onServerRoute ? '' : 'single-column'}`}>

        {onServerRoute && (
          <div className="secondary-sidebar">
            <Routes>
              <Route path="server/:serverId/*" element={<ServerView />} />
            </Routes>
          </div>
        )}

        <div className="main-content-area">
          <ScreenShareDisplay />

          <Routes>
            <Route path="feed" element={<FeedPage />} />
            <Route path="friends" element={<FriendsView />} />
            <Route path="all-dms" element={<AllDmsPage />} />
            <Route path="server/:serverId/channel/:channelId" element={<ChatArea />} />
            <Route path="dm/:friendId/:conversationId" element={<DMView />} />
            <Route path="settings/stream" element={<StreamSettingsPage />} />
            <Route path="settings/profile" element={<UserProfilePage />} />
            <Route path="server/:serverId/settings" element={<ServerSettingsPage />} />
            <Route path="profile/:userId" element={<UserProfileViewPage />} />
            <Route path="settings/audio" element={<AudioSettingsPage />} />
            <Route path="*" element={<FeedPage />} />
          </Routes>
        </div>

        {onServerRoute && <ServerMembersPanel />}
      </div>

      {/* 📢 SES PANELİ (VoiceRoom) İÇİN GÖRÜNÜRLÜK GARANTİSİ
         z-index: 9999 ve position: absolute ile en üste sabitliyoruz.
      */}
      {currentVoiceChannelId && (
        <div style={{
            position: 'absolute',
            bottom: 0,
            left: 72, // Sidebar genişliği kadar (CSS'e göre değişebilir, genelde 72px)
            width: 240, // Discord sol panel genişliği standartı
            zIndex: 9999, // En üstte görünsün
            backgroundColor: '#292b2f', // Arka plan rengi (tema rengine göre)
            borderTop: '1px solid #3f4147'
        }}>
            <VoiceRoom />
        </div>
      )}
    </div>
  );
};

export default DashboardPage;