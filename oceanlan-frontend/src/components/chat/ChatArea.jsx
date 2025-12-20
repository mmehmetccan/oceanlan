// src/components/chat/ChatArea.jsx
import React, { useState, useEffect, useContext, useRef } from 'react';
import { ServerContext } from '../../context/ServerContext';
import { AuthContext } from '../../context/AuthContext';
import { useSocket } from '../../hooks/useSocket';
import { useParams } from 'react-router-dom';
import axiosInstance from '../../utils/axiosInstance';
import ScreenShareDisplay from './ScreenShareDisplay';
import { getFullImageUrl } from '../../utils/urlHelper';
import { ToastContext } from '../../context/ToastContext';

import '../../styles/ChatArea.css'

const ChatArea = () => {
  const { serverId, channelId } = useParams();
  const { activeServer, loading } = useContext(ServerContext);
  const { user } = useContext(AuthContext);
  const { socket } = useSocket();
  const { addToast } = useContext(ToastContext);

  const [messages, setMessages] = useState([]);
  const [inputContent, setInputContent] = useState('');
  const [previewImage, setPreviewImage] = useState(null);

  // --- STATE'LER ---
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const messagesEndRef = useRef(null);
  const currentChannel = activeServer?.channels.find(c => c._id === channelId);

  // 🛠️ GÜVENLİ KULLANICI ID'Sİ (Profil güncellemelerinden etkilenmemesi için)
  const currentUserId = user?._id || user?.id;

  const formatMessageDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('tr-TR', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
  };

  const handleError = (error) => {
    const message = error?.response?.data?.message || error?.message || 'Bir hata oluştu';
    addToast(message, 'error');
  };

  // 🟢 DÜZELTME 1: Socket Bağlantı ve Oda Yönetimi (Kopmaları engeller)
  useEffect(() => {
    if (!socket || !channelId || !serverId) return;

    const joinRoom = () => {
        // Kanala katılma isteği gönder
        socket.emit('joinChannel', channelId);
    };

    // İlk açılışta katıl
    joinRoom();

    // 🌟 Bağlantı kopup geri gelirse (reconnect) tekrar katıl!
    // Bu sayede mesajların gelmemesi sorunu çözülür.
    socket.on('connect', joinRoom);
    socket.on('reconnect', joinRoom);

    // Mesaj geçmişini çek
    const fetchMessages = async () => {
      try {
        const res = await axiosInstance.get(`/servers/${serverId}/channels/${channelId}/messages`);
        setMessages(res.data.data);
      } catch (error) {
        console.error('Mesaj geçmişi çekilemedi:', error);
        setMessages([]);
      }
    };
    fetchMessages();

    // Temizlik
    return () => {
      socket.emit('leaveChannel', channelId);
      socket.off('connect', joinRoom);
      socket.off('reconnect', joinRoom);
    };
  }, [socket, channelId, serverId]);

  // Yeni Mesajları Dinle
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message) => {
      // Sadece şu anki kanala ait mesajları ekle
      if (message.channel === channelId || message.channel._id === channelId) {
          setMessages(prev => [...prev, message]);
      }
    };

    const handleMessageDeleted = ({ messageId }) => {
      setMessages(prev => prev.filter(m => m._id !== messageId));
    };

    socket.on('newMessage', handleNewMessage);
    socket.on('messageDeleted', handleMessageDeleted);

    return () => {
      socket.off('newMessage', handleNewMessage);
      socket.off('messageDeleted', handleMessageDeleted);
    };
  }, [socket, channelId]);

  // MESAJ GÖNDERME
  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (inputContent.trim() === '' && !file) return;

    // Dosya Yükleme
    if (file) {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      if (inputContent.trim() !== '') formData.append('content', inputContent);
      else formData.append('content', '');

      try {
        await axiosInstance.post(
          `/servers/${serverId}/channels/${channelId}/file`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        setInputContent('');
        setFile(null);
        setPreviewImage(null);
        if(fileInputRef.current) fileInputRef.current.value = null;
      } catch (error) {
        handleError(error);
      } finally {
        setIsUploading(false);
      }
    }
    // Sadece Yazı
    else if (inputContent.trim() !== '') {
      if (!currentUserId) {
          addToast("Oturum hatası: Lütfen sayfayı yenileyin.", "error");
          return;
      }

      socket.emit('sendMessage', {
        content: inputContent,
        channelId: channelId,
        authorId: currentUserId, // 🛠️ Düzeltilmiş ID kullanılıyor
      });
      setInputContent('');
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleFileChange = (e) => {
      if (e.target.files && e.target.files[0]) {
          setFile(e.target.files[0]);
      }
  };

  if (loading || !activeServer || !currentChannel) {
    return <div className="chat-area">Sunucu veya kanal yükleniyor...</div>;
  }

  const renderMessageContent = (msg) => {
    const fullFileUrl = getFullImageUrl(msg.fileUrl);

    // 🛠️ Yazar ID kontrolü (String'e çevirerek karşılaştır)
    const isMyMessage = String(msg.author._id) === String(currentUserId);

    return (
      <>
        {msg.fileUrl && (
          <div className="message-file-container">
            {msg.fileType === 'image' && (
              <img
                src={fullFileUrl}
                alt="Medya"
                className="chat-image"
                onClick={() => setPreviewImage(fullFileUrl)}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            {msg.fileType === 'video' && (
              <video controls className="chat-video">
                <source src={fullFileUrl} type={msg.fileType || 'video/mp4'} />
              </video>
            )}
            {msg.fileType === 'other' && (
              <a href={fullFileUrl} target="_blank" rel="noopener noreferrer">Dosyayı İndir</a>
            )}
          </div>
        )}

        {/* 🟢 SİLME BUTONU: ID kontrolü sağlama alındı */}
        {isMyMessage && (
            <button
                className="message-delete-btn"
                onClick={async () => {
                  if(!window.confirm("Mesajı silmek istiyor musunuz?")) return;
                  try {
                    await axiosInstance.delete(`/servers/${serverId}/channels/${channelId}/messages/${msg._id}`);
                    // Socket'ten 'messageDeleted' gelince listeden silinecek,
                    // ama anlık tepki için burada da silebiliriz:
                    setMessages(prev => prev.filter(m => m._id !== msg._id));
                    addToast('Mesaj silindi', 'success');
                  } catch (error) { handleError(error); }
                }}
            >
              🗑️
            </button>
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
          {messages.map((msg, index) => (
              <div key={index} className="message-item">
                <span className="message-author">{msg.author.username}</span>
                <span className="message-time" style={{fontSize: '11px', color: '#72767d', marginLeft: '6px'}}>
                    {formatMessageDate(msg.createdAt)}
                </span>
                {renderMessageContent(msg)}
              </div>
          ))}
          <div ref={messagesEndRef}/>
        </div>
        {previewImage && (
            <div className="image-modal-overlay" onClick={() => setPreviewImage(null)}>
              <div className="image-modal"><img src={previewImage} alt="Önizleme"/></div>
            </div>
        )}
        <footer className="message-input-area">
          <form onSubmit={handleSendMessage}>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{display: 'none'}} accept="image/*,video/*"/>
            <button type="button" className="attach-file-btn" onClick={() => fileInputRef.current.click()}>📎</button>
            <input
                type="text"
                placeholder={file ? `Dosya: ${file.name}` : `#${currentChannel.name} kanalına mesaj gönder...`}
                value={inputContent}
                onChange={(e) => setInputContent(e.target.value)}
                disabled={isUploading}
            />
            <button type="submit" disabled={!socket || isUploading}>{isUploading ? '...' : 'Gönder'}</button>
          </form>
        </footer>
      </div>
  );
};

export default ChatArea;