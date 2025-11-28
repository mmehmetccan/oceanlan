// src/components/views/DMView.jsx
import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams } from 'react-router-dom';
import axiosInstance from '../../utils/axiosInstance';
import { useSocket } from '../../hooks/useSocket';
import { AuthContext } from '../../context/AuthContext';
import { getFullImageUrl } from '../../utils/urlHelper';
import '../../styles/DMView.css';

// Backend base URL (Resimler için)
const SERVER_API_URL = import.meta.env.VITE_API_URL;

const DMView = () => {
  const { friendId, conversationId } = useParams();
  const { socket } = useSocket();
  const { user } = useContext(AuthContext);

  const [messages, setMessages] = useState([]);
  const [inputContent, setInputContent] = useState('');
  const [friendName, setFriendName] = useState('Yükleniyor...');

  // --- STATE'LER ---
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const fileInputRef = useRef(null);
  // ----------------------

  const messagesEndRef = useRef(null);

  // --- YENİ: Tarih Formatlama Yardımcı Fonksiyonu ---
  const formatMessageDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    // Örnek çıktı: 24 Kas 2023 14:30
    return date.toLocaleString('tr-TR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
  };
  // --------------------------------------------------

  useEffect(() => {
    const fetchFriendProfile = async () => {
      try {
        const res = await axiosInstance.get(`/users/${friendId}/profile`);
        if (res.data && res.data.user) {
          setFriendName(res.data.user.username);
        }
      } catch (error) {
        console.error('Arkadaş ismi alınamadı:', error);
        setFriendName('Bilinmeyen Kullanıcı');
      }
    };
    if (friendId) fetchFriendProfile();
  }, [friendId]);

  useEffect(() => {
    if (!conversationId) return;
    const fetchDmMessages = async () => {
      try {
        const res = await axiosInstance.get(`/friends/dm/${conversationId}/messages`);
        setMessages(res.data.data);
      } catch (error) {
        console.error('DM geçmişi çekilemedi:', error);
      }
    };
    if (socket) socket.emit('joinConversation', conversationId);
    fetchDmMessages();
    return () => {
        if(socket) socket.emit('leaveConversation', conversationId);
    };
  }, [conversationId, socket]);

  useEffect(() => {
    if (!socket) return;
    const handleNewPrivateMessage = (newMessage) => {
        if(newMessage.conversation === conversationId) {
            setMessages((prevMessages) => [...prevMessages, newMessage]);
        }
    };
    socket.on('newPrivateMessage', handleNewPrivateMessage);
    return () => {
      socket.off('newPrivateMessage', handleNewPrivateMessage);
    };
  }, [socket, conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleFileChange = (e) => {
      if (e.target.files && e.target.files[0]) {
          setFile(e.target.files[0]);
      }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (inputContent.trim() === '' && !file) return;

    if (file) {
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('content', inputContent);

        try {
            await axiosInstance.post(`/friends/dm/${conversationId}/file`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setInputContent('');
            setFile(null);
            fileInputRef.current.value = null;

        } catch (error) {
            alert(error.response?.data?.message || 'Dosya gönderilemedi.');
        } finally {
            setIsUploading(false);
        }
    }
    else if (inputContent.trim() !== '') {
        const messageData = {
            content: inputContent,
            conversationId: conversationId,
            authorId: user.id,
        };
        socket.emit('sendPrivateMessage', messageData);
        setInputContent('');
    }
  };

  const renderMessageContent = (msg) => {
      const fullFileUrl = getFullImageUrl(msg.fileUrl);

    return (
      <>
        {msg.fileUrl && (
          <div className="message-file-container" style={{marginBottom: '5px'}}>
            {msg.fileType === 'image' && (
              <img
                src={fullFileUrl} // 👈 DÜZELTİLDİ
                alt="Ek"
                className="chat-image"
                style={{ maxWidth: '300px', borderRadius: '8px', cursor: 'pointer' }}
                onClick={() => setPreviewImage(fullFileUrl)} // 👈 DÜZELTİLDİ
              />
            )}
            {msg.fileType === 'video' && (
              <video controls className="chat-video" style={{ maxWidth: '300px', borderRadius: '8px' }}>
                <source src={fullFileUrl} type="video/mp4" /> // 👈 DÜZELTİLDİ
                Tarayıcınız videoyu desteklemiyor.
              </video>
            )}
            {msg.fileType === 'other' && (
              <a href={fullFileUrl} target="_blank" rel="noopener noreferrer" style={{color: '#7289da'}}>
                Dosyayı İndir
              </a>
            )}
          </div>
        )}
        {msg.content && <p className="message-content">{msg.content}</p>}
      </>
    );
  };

  return (
    <div className="dm-view chat-area">
      <header className="dm-header">
        <div className="dm-header-title">
          <span className="dm-dot" aria-hidden="true" />
          <div>
            <p className="dm-overline">Özel Sohbet</p>
            <h2>{friendName}</h2>
          </div>
        </div>
      </header>

      <div className="messages-container dm-messages">
        {messages.map((msg, index) => {
          const isOwn =
            msg.author?._id === user?.id ||
            msg.authorId === user?.id ||
            msg.author?.id === user?.id;

          return (
            <div
              key={index}
              className={`dm-message ${isOwn ? 'from-me' : 'from-them'}`}
            >
              <div className="dm-message-meta">
                <span className="dm-message-author">
                  {msg.author?.username || 'Bilinmeyen'}
                </span>

                {/* 📢 EKLENDİ: Tarih ve Saat Bilgisi */}
                <span className="dm-time" style={{ marginLeft: '8px', fontSize: '11px', color: '#99aab5' }}>
                    {formatMessageDate(msg.createdAt)}
                </span>
                {/* -------------------------------- */}

                {isOwn && <span className="dm-badge">Sen</span>}
              </div>
              <div className="dm-bubble">
                {renderMessageContent(msg)}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Resim Önizleme Modalı */}
      {previewImage && (
        <div
            className="image-modal-overlay"
            onClick={() => setPreviewImage(null)}
            style={{
                position: 'fixed', top:0, left:0, right:0, bottom:0,
                backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
        >
          <div className="image-modal">
            <img src={previewImage} alt="Önizleme" style={{maxWidth: '90vw', maxHeight: '90vh'}} />
          </div>
        </div>
      )}

      <footer className="dm-input-area">
        <form onSubmit={handleSendMessage} className="dm-input-form">
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
            style={{
                background: 'transparent', border: 'none', color: '#b9bbbe',
                fontSize: '20px', cursor: 'pointer', marginRight: '10px'
            }}
            disabled={isUploading}
          >
            📎
          </button>

          <input
            type="text"
            placeholder={file ? `Dosya seçildi: ${file.name}` : `@${friendName} kişisine mesaj gönder...`}
            value={inputContent}
            onChange={(e) => setInputContent(e.target.value)}
            disabled={isUploading || !socket}
            className="dm-input"
          />
          <button
            type="submit"
            disabled={(!socket && !file) || isUploading}
            className="dm-send-btn"
          >
            {isUploading ? '...' : 'Gönder'}
          </button>
        </form>
      </footer>
    </div>
  );
};

export default DMView;