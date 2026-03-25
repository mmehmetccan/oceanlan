// src/components/chat/ChatArea.jsx
import React, { useState, useEffect, useContext, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ServerContext } from '../../context/ServerContext';
import { AuthContext } from '../../context/AuthContext';
import { useSocket } from '../../hooks/useSocket';
import { ToastContext } from '../../context/ToastContext';
import axiosInstance from '../../utils/axiosInstance';
import ScreenShareDisplay from './ScreenShareDisplay';
import { getFullImageUrl } from '../../utils/urlHelper';
import UserProfileModal from '../profile/UserProfileModal';
import { TrashIcon, PaperAirplaneIcon, PlusCircleIcon, UserPlusIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import ConfirmationModal from '../modals/ConfirmationModal';
import UserLevelTag from '../gamification/UserLevelTag';
import '../../styles/ChatArea.css';

const DEFAULT_AVATAR = '/default-avatar.png';

const ChatArea = () => {
  const { serverId, channelId } = useParams();
  // 🟢 joinPublicServer fonksiyonunu Context'ten çekiyoruz
  const { activeServer, loading, joinPublicServer } = useContext(ServerContext);
  const { user } = useContext(AuthContext);
  const { socket } = useSocket();
  const { addToast } = useContext(ToastContext);

  const [messages, setMessages] = useState([]);
  const [inputContent, setInputContent] = useState('');
  const [previewImage, setPreviewImage] = useState(null);
  const [showProfileId, setShowProfileId] = useState(null);

  const [deleteConfirmation, setDeleteConfirmation] = useState({
    isOpen: false,
    messageId: null
  });

  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const currentChannel = activeServer?.channels.find(c => c._id === channelId);
  const currentUserId = user?._id || user?.id;

  // 🟢 ÜYELİK KONTROLÜ (Preview Modu)
  // Backend'den gelen isMember bayrağına bakıyoruz. Eğer undefined ise (eski versiyon vb.) true varsayılabilir ama false daha güvenli.
  const isMember = activeServer?.isMember !== false;

  const formatMessageDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const today = new Date();
    const isToday = date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
    if (isToday) return `Bugün ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    return date.toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const handleError = (error) => {
    const message = error?.response?.data?.message || error?.message || 'Bir hata oluştu';
    addToast(message, 'error');
  };

  // 🟢 Mesajları Çekme (Sadece Üyeyse)
  useEffect(() => {
    if (!socket || !channelId || !serverId || !isMember) return;

    const joinRoom = () => socket.emit('joinChannel', channelId);
    joinRoom();
    socket.on('connect', joinRoom);
    socket.on('reconnect', joinRoom);

    const fetchMessages = async () => {
      try {
        const res = await axiosInstance.get(`/servers/${serverId}/channels/${channelId}/messages`);
        setMessages(res.data.data);
      } catch (error) {
        // 403 alırsak (üye değilse) sessizce geçebiliriz
        if (error.response?.status !== 403) console.error('Mesajlar alınamadı', error);
      }
    };
    fetchMessages();

    return () => {
      socket.emit('leaveChannel', channelId);
      socket.off('connect', joinRoom);
      socket.off('reconnect', joinRoom);
    };
  }, [socket, channelId, serverId, isMember]);

  // Socket Dinleyicileri (Sadece Üyeyse)
  useEffect(() => {
    if (!socket || !isMember) return;
    const handleNewMessage = (message) => {
      const msgChannelId = typeof message.channel === 'object' ? message.channel._id : message.channel;
      if (String(msgChannelId) === String(channelId)) setMessages(prev => [...prev, message]);
    };
    const handleMessageDeleted = ({ messageId }) => setMessages(prev => prev.filter(m => m._id !== messageId));

    socket.on('newMessage', handleNewMessage);
    socket.on('messageDeleted', handleMessageDeleted);
    return () => { socket.off('newMessage', handleNewMessage); socket.off('messageDeleted', handleMessageDeleted); };
  }, [socket, channelId, isMember]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (inputContent.trim() === '' && !file) return;

    if (file) {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      if (inputContent.trim() !== '') formData.append('content', inputContent);
      else formData.append('content', '');

      try {
        await axiosInstance.post(`/servers/${serverId}/channels/${channelId}/file`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setInputContent(''); setFile(null); setPreviewImage(null); if (fileInputRef.current) fileInputRef.current.value = null;
      } catch (error) { handleError(error); } finally { setIsUploading(false); }
    } else if (inputContent.trim() !== '') {
      if (!currentUserId) { addToast("Oturum hatası", "error"); return; }
      socket.emit('sendMessage', { content: inputContent, channelId: channelId, authorId: currentUserId });
      setInputContent('');
    }
  };

  const handleDeleteClick = (msgId) => {
    setDeleteConfirmation({ isOpen: true, messageId: msgId });
  };

  const confirmDeleteMessage = async () => {
    const msgId = deleteConfirmation.messageId;
    if (!msgId) return;

    try {
      await axiosInstance.delete(`/servers/${serverId}/channels/${channelId}/messages/${msgId}`);
      setMessages(prev => prev.filter(m => m._id !== msgId));
      addToast('Mesaj başarıyla silindi.', 'success');
    } catch (error) {
      handleError(error);
    } finally {
      setDeleteConfirmation({ isOpen: false, messageId: null });
    }
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  const handleFileChange = (e) => { if (e.target.files && e.target.files[0]) setFile(e.target.files[0]); };

  // 🟢 İstekli katılım için fonksiyon
  const handleJoinRequest = async () => {
    try {
      await axiosInstance.post(`/servers/${serverId}/join-public`);
      addToast('Katılım isteği gönderildi.', 'success');
    } catch (error) {
      handleError(error);
    }
  };

  if (loading || !activeServer || !currentChannel) return <div className="chat-area">Yükleniyor...</div>;

  const renderMessageContent = (msg) => {
  const fullFileUrl = getFullImageUrl(msg.fileUrl);
  
  // Bot mesajı mı kontrolü
  const isBot = msg.author?.isBot || msg.author?.username === "Ocean AI";
    return (
      <>
        {msg.fileUrl && (
          <div className="message-file-container">
            {msg.fileType === 'image' && <img src={fullFileUrl} alt="Medya" className="chat-image" onClick={() => setPreviewImage(fullFileUrl)} onError={(e) => e.target.style.display = 'none'} />}
            {msg.fileType === 'video' && <video controls className="chat-video"><source src={fullFileUrl} type={msg.fileType || 'video/mp4'} /></video>}
            {msg.fileType === 'other' && <a href={fullFileUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#00aff4' }}>Dosyayı İndir</a>}
          </div>
        )}
        {msg.content && (
        <p className={`message-content ${isBot ? 'ai-content' : ''}`}>
          {msg.content}
        </p>
      )}
    </>
    );
  };

  return (
    <div className="chat-area">
      <header className="chat-header">
        # {currentChannel.name}
        {!isMember && <span style={{ fontSize: '12px', marginLeft: '10px', color: '#b9bbbe' }}>(Önizleme Modu)</span>}
      </header>

      {/* Sadece Üyeyse Ekran Paylaşımını Göster */}
      {isMember && <div className="chat-screen-share-section"><ScreenShareDisplay /></div>}

      <div className="messages-container">
        {/* 🟢 ÜYE DEĞİLSE: ÖNİZLEME EKRANI */}
        {!isMember ? (
          <div className="preview-mode-overlay" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: '#dcddde', textAlign: 'center', padding: '20px'
          }}>
            <LockClosedIcon style={{ width: 64, height: 64, color: '#00aff4', marginBottom: '20px' }} />
            <h2>Bu sunucuya henüz üye değilsiniz</h2>
            <p style={{ maxWidth: '400px', marginBottom: '30px', color: '#b9bbbe' }}>
              Kanalları ve üyeleri görebilirsiniz ancak sohbet geçmişini görmek ve mesaj göndermek için sunucuya katılmanız gerekmektedir.
            </p>

            {activeServer.joinMode === 'request' ? (
              <button className="join-btn-large" onClick={handleJoinRequest} style={{
                padding: '12px 24px', fontSize: '16px', fontWeight: 'bold',
                backgroundColor: '#5865F2', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px'
              }}>
                <LockClosedIcon width={20} /> Katılım İsteği Gönder
              </button>
            ) : (
              <button className="join-btn-large" onClick={() => joinPublicServer(activeServer._id)} style={{
                padding: '12px 24px', fontSize: '16px', fontWeight: 'bold',
                backgroundColor: '#3ba55c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px'
              }}>
                <UserPlusIcon width={20} /> Sunucuya Katıl
              </button>
            )}
          </div>
        ) : (
          /* 🟢 ÜYEYSE: NORMAL MESAJLAR */
          <>
            {messages.map((msg, index) => {
              // --- DÜZELTME BAŞLANGICI ---
              // Eğer mesaj boşsa veya mesajın yazarı (author) yoksa, ekrana hiçbir şey basma.
              if (!msg || !msg.author) return null;
              // --- DÜZELTME BİTİŞİ ---

              const avatarSrc = getFullImageUrl(msg.author?.avatarUrl || msg.author?.avatar);

              // Artık author'un var olduğundan eminiz, ama yine de güvenli olması için soru işareti (?) ekleyelim
              const authorId = msg.author?._id || msg.author?.id;

              const isMyMessage = String(authorId) === String(currentUserId);

              return (
  <div key={index} className={`message-item ${msg.author?.isBot ? 'ai-message-row' : ''}`}>
    <div className="message-avatar-wrapper" onClick={() => setShowProfileId(authorId)}>
      <img 
        src={msg.author?.isBot ? '/assets/ai-avatar.png' : avatarSrc} 
        alt={msg.author.username} 
        className={`message-avatar ${msg.author?.isBot ? 'ai-avatar' : ''}`} 
        onError={(e) => { e.target.src = DEFAULT_AVATAR; }} 
      />
    </div>
                  <div className="message-body">
                    <div className="message-header">
                      <span className={`message-author ${msg.author?.isBot ? 'ai-author-name' : ''}`}>
            {msg.author.username} {msg.author?.isBot && <span className="bot-tag">BOT</span>}
        </span>
        {!msg.author?.isBot && <UserLevelTag level={msg.author?.level} activeBadge={msg.author?.activeBadge} />}
        <span className="message-time">{formatMessageDate(msg.createdAt)}</span>
      </div>
      <div className="message-content-wrapper">{renderMessageContent(msg)}</div>
    </div>
                  {isMyMessage && (
                    <div className="message-actions-group">
                      <button className="message-delete-btn" title="Sil" onClick={() => handleDeleteClick(msg._id)}><TrashIcon /></button>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Profil Modalı */}
      {showProfileId && (
        <UserProfileModal userId={showProfileId} onClose={() => setShowProfileId(null)} />
      )}

      {previewImage && <div className="image-modal-overlay" onClick={() => setPreviewImage(null)}><div className="image-modal"><img src={previewImage} alt="Önizleme" /></div></div>}

      <ConfirmationModal
        isOpen={deleteConfirmation.isOpen}
        title="Mesajı Sil"
        message="Bu mesajı silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
        onConfirm={confirmDeleteMessage}
        onClose={() => setDeleteConfirmation({ isOpen: false, messageId: null })}
        isDanger={true}
        confirmText="Sil"
      />

      {/* 🟢 INPUT ALANI: SADECE ÜYEYSE GÖSTER */}
      {isMember && (
        <footer className="message-input-area">
          <form onSubmit={handleSendMessage}>
            <button type="button" className="attach-file-btn" onClick={() => fileInputRef.current.click()}>
              <PlusCircleIcon style={{ width: 24, height: 24 }} />
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept="image/*,video/*" />

            <input
              type="text"
              placeholder={file ? `Dosya: ${file.name}` : `#${currentChannel.name} kanalına mesaj gönder...`}
              value={inputContent}
              onChange={(e) => setInputContent(e.target.value)}
              disabled={isUploading}
            />

            <button type="submit" className="send-message-btn" disabled={(!inputContent.trim() && !file) || isUploading}>
              <PaperAirplaneIcon />
            </button>
          </form>
        </footer>
      )}
    </div>
  );
};

export default ChatArea;