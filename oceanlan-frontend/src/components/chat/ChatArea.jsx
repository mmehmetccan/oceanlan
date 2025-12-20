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
import { TrashIcon, PaperAirplaneIcon, PlusCircleIcon } from '@heroicons/react/24/outline'; // İkonları import et
import ConfirmationModal from '../modals/ConfirmationModal'; // 🟢 Modal Import Edildi
import '../../styles/ChatArea.css';

const DEFAULT_AVATAR = '/default-avatar.png';

const ChatArea = () => {
  const { serverId, channelId } = useParams();
  const { activeServer, loading } = useContext(ServerContext);
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

  useEffect(() => {
    if (!socket || !channelId || !serverId) return;
    const joinRoom = () => socket.emit('joinChannel', channelId);
    joinRoom();
    socket.on('connect', joinRoom);
    socket.on('reconnect', joinRoom);

    const fetchMessages = async () => {
      try {
        const res = await axiosInstance.get(`/servers/${serverId}/channels/${channelId}/messages`);
        setMessages(res.data.data);
      } catch (error) { console.error('Mesajlar alınamadı', error); }
    };
    fetchMessages();

    return () => {
      socket.emit('leaveChannel', channelId);
      socket.off('connect', joinRoom);
      socket.off('reconnect', joinRoom);
    };
  }, [socket, channelId, serverId]);

  useEffect(() => {
    if (!socket) return;
    const handleNewMessage = (message) => {
      const msgChannelId = typeof message.channel === 'object' ? message.channel._id : message.channel;
      if (String(msgChannelId) === String(channelId)) setMessages(prev => [...prev, message]);
    };
    const handleMessageDeleted = ({ messageId }) => setMessages(prev => prev.filter(m => m._id !== messageId));

    socket.on('newMessage', handleNewMessage);
    socket.on('messageDeleted', handleMessageDeleted);
    return () => { socket.off('newMessage', handleNewMessage); socket.off('messageDeleted', handleMessageDeleted); };
  }, [socket, channelId]);

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
        setInputContent(''); setFile(null); setPreviewImage(null); if(fileInputRef.current) fileInputRef.current.value = null;
      } catch (error) { handleError(error); } finally { setIsUploading(false); }
    } else if (inputContent.trim() !== '') {
      if (!currentUserId) { addToast("Oturum hatası", "error"); return; }
      socket.emit('sendMessage', { content: inputContent, channelId: channelId, authorId: currentUserId });
      setInputContent('');
    }
  };

  const handleDeleteClick = (msgId) => {
      setDeleteConfirmation({
          isOpen: true,
          messageId: msgId
      });
  };

  // 🟢 2. Modalda "Evet" denilince Silme İşlemini Yap
  const confirmDeleteMessage = async () => {
    const msgId = deleteConfirmation.messageId;
    if (!msgId) return;

    try {
      await axiosInstance.delete(`/servers/${serverId}/channels/${channelId}/messages/${msgId}`);
      setMessages(prev => prev.filter(m => m._id !== msgId));
      addToast('Mesaj başarıyla silindi.', 'success'); // İşlem sonrası bildirim
    } catch (error) {
      handleError(error);
    } finally {
        // Modalı Kapat
        setDeleteConfirmation({ isOpen: false, messageId: null });
    }
  };

  const handleDeleteMessage = async (msgId) => {
    if(!window.confirm("Mesajı silmek istiyor musunuz?")) return;
    try {
      await axiosInstance.delete(`/servers/${serverId}/channels/${channelId}/messages/${msgId}`);
      setMessages(prev => prev.filter(m => m._id !== msgId));
      addToast('Mesaj silindi', 'success');
    } catch (error) { handleError(error); }
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  const handleFileChange = (e) => { if (e.target.files && e.target.files[0]) setFile(e.target.files[0]); };

  if (loading || !activeServer || !currentChannel) return <div className="chat-area">Yükleniyor...</div>;

  const renderMessageContent = (msg) => {
    const fullFileUrl = getFullImageUrl(msg.fileUrl);
    return (
      <>
        {msg.fileUrl && (
          <div className="message-file-container">
            {msg.fileType === 'image' && <img src={fullFileUrl} alt="Medya" className="chat-image" onClick={() => setPreviewImage(fullFileUrl)} onError={(e) => e.target.style.display = 'none'} />}
            {msg.fileType === 'video' && <video controls className="chat-video"><source src={fullFileUrl} type={msg.fileType || 'video/mp4'} /></video>}
            {msg.fileType === 'other' && <a href={fullFileUrl} target="_blank" rel="noopener noreferrer" style={{color:'#00aff4'}}>Dosyayı İndir</a>}
          </div>
        )}
        {msg.content && <p className="message-content">{msg.content}</p>}
      </>
    );
  };

  return (
      <div className="chat-area">
        <header className="chat-header"># {currentChannel.name}</header>
        <div className="chat-screen-share-section"><ScreenShareDisplay/></div>

        <div className="messages-container">
          {messages.map((msg, index) => {
              const avatarSrc = getFullImageUrl(msg.author?.avatarUrl || msg.author?.avatar);
              const authorId = msg.author._id || msg.author.id;
              const isMyMessage = String(authorId) === String(currentUserId);

              return (
                <div key={index} className="message-item">
                    {/* SOL: Avatar */}
                    <div className="message-avatar-wrapper" onClick={() => setShowProfileId(authorId)}>
                        <img
                            src={avatarSrc}
                            alt={msg.author.username}
                            className="message-avatar"
                            onError={(e) => { e.target.src = DEFAULT_AVATAR; }}
                        />
                    </div>

                    {/* SAĞ: İçerik */}
                    <div className="message-body">
                        <div className="message-header">
                            <span className="message-author" onClick={() => setShowProfileId(authorId)}>
                                {msg.author.username}
                            </span>
                            <span className="message-time">{formatMessageDate(msg.createdAt)}</span>
                        </div>

                        <div className="message-content-wrapper">
                            {renderMessageContent(msg)}
                        </div>
                    </div>

                    {/* 🟢 SİLME BUTONU (Floating Action Bar) */}
                    {isMyMessage && (
                        <div className="message-actions-group">
                            <button
                                className="message-delete-btn"
                                title="Sil"
                                onClick={() => handleDeleteClick(msg._id)}
                            >
                                <TrashIcon />
                            </button>
                        </div>
                    )}
                </div>
              );
          })}
          <div ref={messagesEndRef}/>
        </div>

        {/* Profil Modalı */}
        {showProfileId && (
            <UserProfileModal
                userId={showProfileId}
                onClose={() => setShowProfileId(null)}
            />
        )}

        {previewImage && <div className="image-modal-overlay" onClick={() => setPreviewImage(null)}><div className="image-modal"><img src={previewImage} alt="Önizleme"/></div></div>}

        {/* 🟢 ONAY MODALI */}
        <ConfirmationModal
            isOpen={deleteConfirmation.isOpen}
            title="Mesajı Sil"
            message="Bu mesajı silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
            onConfirm={confirmDeleteMessage}
            onClose={() => setDeleteConfirmation({ isOpen: false, messageId: null })}
            isDanger={true}
            confirmText="Sil"
        />

        {/* INPUT ALANI */}
        <footer className="message-input-area">
          <form onSubmit={handleSendMessage}>
            <button type="button" className="attach-file-btn" onClick={() => fileInputRef.current.click()}>
                <PlusCircleIcon style={{ width: 24, height: 24 }} />
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{display: 'none'}} accept="image/*,video/*"/>

            <input
                type="text"
                placeholder={file ? `Dosya: ${file.name}` : `#${currentChannel.name} kanalına mesaj gönder...`}
                value={inputContent}
                onChange={(e) => setInputContent(e.target.value)}
                disabled={isUploading}
            />

            {/* 🟢 GÖNDER BUTONU */}
            <button type="submit" className="send-message-btn" disabled={(!inputContent.trim() && !file) || isUploading}>
                <PaperAirplaneIcon />
            </button>
          </form>
        </footer>
      </div>
  );
};

export default ChatArea;