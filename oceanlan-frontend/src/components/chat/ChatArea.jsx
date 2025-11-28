// src/components/chat/ChatArea.jsx
import React, { useState, useEffect, useContext, useRef } from 'react';
import { ServerContext } from '../../context/ServerContext';
import { AuthContext } from '../../context/AuthContext';
import { useSocket } from '../../hooks/useSocket';
import { useParams } from 'react-router-dom';
import axiosInstance from '../../utils/axiosInstance';
// 👇 YENİ: Helper'ı import et
import { getFullImageUrl } from '../../utils/urlHelper';

const ChatArea = () => {
  const { serverId, channelId } = useParams();
  const { activeServer, loading } = useContext(ServerContext);
  const { user } = useContext(AuthContext);
  const { socket } = useSocket();

  const [messages, setMessages] = useState([]);
  const [inputContent, setInputContent] = useState('');
  const [previewImage, setPreviewImage] = useState(null);

  // --- STATE'LER ---
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  // ------------------------------

  const messagesEndRef = useRef(null);
  const currentChannel = activeServer?.channels.find(c => c._id === channelId);

  // --- Tarih Formatlama ---
  const formatMessageDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('tr-TR', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
  };

  // 1. KANALA KATILMA VE GEÇMİŞİ ÇEKME
  useEffect(() => {
    if (socket && channelId && serverId) {
      socket.emit('joinChannel', channelId);

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
    }

    return () => {
      if (socket) {
        socket.emit('leaveChannel', channelId);
      }
    };
  }, [socket, channelId, serverId]);

  // 2. Yeni Gelen Mesajları Dinleme
  useEffect(() => {
    if (socket) {
      const handleNewMessage = (message) => {
        if (message.channel.toString() === channelId) {
            setMessages(prevMessages => [...prevMessages, message]);
        }
      };

      socket.on('newMessage', handleNewMessage);

      return () => {
        if (socket) {
          socket.off('newMessage', handleNewMessage);
        }
      };
    }
  }, [socket, channelId]);

  // 3. MESAJ GÖNDERME
  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (inputContent.trim() === '' && !file) return;

    if (file) {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('content', inputContent);

      try {
        await axiosInstance.post(
          `/servers/${serverId}/channels/${channelId}/file`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );

        setInputContent('');
        setFile(null);
        fileInputRef.current.value = null;

      } catch (error) {
        alert(error.response?.data?.message || 'Dosya yüklenemedi');
      } finally {
        setIsUploading(false);
      }
    }
    else if (inputContent.trim() !== '') {
      socket.emit('sendMessage', {
        content: inputContent,
        channelId: channelId,
        authorId: user.id,
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

  // 👇 GÜNCELLENEN RENDER FONKSİYONU
  const renderMessageContent = (msg) => {
    // URL Helper kullanılarak doğru adresi al
    const fullFileUrl = getFullImageUrl(msg.fileUrl);

    return (
      <>
        {msg.fileUrl && (
          <div className="message-file-container">
            {msg.fileType === 'image' && (
              <img
                src={fullFileUrl} // 👈 DÜZELTİLDİ
                alt="Yüklenen resim"
                className="chat-image"
                onClick={() => setPreviewImage(fullFileUrl)} // 👈 DÜZELTİLDİ
              />
            )}
            {msg.fileType === 'video' && (
              <video controls className="chat-video">
                <source src={fullFileUrl} type={msg.fileType || 'video/mp4'} /> // 👈 DÜZELTİLDİ
                Tarayıcınız video oynatmayı desteklemiyor.
              </video>
            )}
            {msg.fileType === 'other' && (
              <a href={fullFileUrl} target="_blank" rel="noopener noreferrer"> {/* 👈 DÜZELTİLDİ */}
                Dosyayı İndir
              </a>
            )}
          </div>
        )}

        {msg.content && (
          <p className="message-content">{msg.content}</p>
        )}
      </>
    );
  };

  return (
    <div className="chat-area">
      <header className="chat-header">
        # {currentChannel.name}
      </header>

      <div className="messages-container">
        {messages.map((msg, index) => (
            <div key={index} className="message-item">
                <span className="message-author">{msg.author.username}</span>

                {/* Tarih ve Saat */}
                <span className="message-time" style={{fontSize: '11px', color: '#72767d', marginLeft: '6px'}}>
                    {formatMessageDate(msg.createdAt)}
                </span>

                {/* İçeriği Render Et */}
                {renderMessageContent(msg)}
            </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {previewImage && (
        <div className="image-modal-overlay" onClick={() => setPreviewImage(null)}>
          <div className="image-modal">
            <img src={previewImage} alt="Önizleme" />
          </div>
        </div>
      )}

      <footer className="message-input-area">
        <form onSubmit={handleSendMessage}>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: 'none' }}
            accept="image/*,video/*"
          />

          <button
            type="button"
            className="attach-file-btn"
            onClick={() => fileInputRef.current.click()}
          >
            📎
          </button>

          <input
            type="text"
            placeholder={file ? `Dosya: ${file.name}` : `#${currentChannel.name} kanalına mesaj gönder...`}
            value={inputContent}
            onChange={(e) => setInputContent(e.target.value)}
            disabled={isUploading}
          />
          <button type="submit" disabled={!socket || isUploading}>
            {isUploading ? '...' : 'Gönder'}
          </button>
        </form>
      </footer>
    </div>
  );
};

export default ChatArea;