// src/components/modals/ServerInviteModal.jsx
import React, { useState, useEffect } from 'react';
import axiosInstance from '../../utils/axiosInstance';
import { XMarkIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import '../../styles/ModalStyles.css';

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const ServerInviteModal = ({ serverId, onClose }) => {
  const [inviteCode, setInviteCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchInvite = async () => {
      setLoading(true);
      try {
        console.log("Davet kodu isteniyor:", serverId);
        // POST isteği ile yeni kod oluştur veya var olanı al
        const res = await axiosInstance.post(`${API_URL_BASE}/api/v1/servers/${serverId}/invite`);

        console.log("Davet API Yanıtı:", res.data); // Konsola basıyoruz ki hatayı görelim

        // Veri yolunu garantiye al (Backend ne gönderirse göndersin yakalayalım)
        const code = res.data.data?.code || res.data.code || res.data?.inviteCode;

        setInviteCode(code);
      } catch (error) {
        console.error("Davet kodu alınamadı:", error);
      } finally {
        setLoading(false);
      }
    };
    if(serverId) fetchInvite();
  }, [serverId]);

  const handleCopy = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content invite-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Arkadaşlarını Davet Et</h3>
          <button className="close-btn" onClick={onClose}>
            <XMarkIcon style={{ width: 24 }} />
          </button>
        </div>

        <div className="modal-body">
          <p className="invite-desc">
            Bu sunucuya insanları davet etmek için aşağıdaki kodu paylaş:
          </p>

          <div className="invite-input-wrapper">
            {loading ? (
              <div className="invite-loading" style={{padding: '10px', color: '#ccc'}}>Kod oluşturuluyor...</div>
            ) : (
              <>
                <input
                  type="text"
                  readOnly
                  value={inviteCode || 'Kod alınamadı (Konsola bak)'}
                  className="invite-code-input"
                />
                <button
                  onClick={handleCopy}
                  className={`copy-btn ${copied ? 'copied' : ''}`}
                  disabled={!inviteCode}
                >
                  {copied ? 'Kopyalandı!' : <ClipboardDocumentIcon style={{ width: 20 }} />}
                </button>
              </>
            )}
          </div>

          <div className="invite-footer-info">
            Davet kodunuzun süresi dolmaz.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServerInviteModal;