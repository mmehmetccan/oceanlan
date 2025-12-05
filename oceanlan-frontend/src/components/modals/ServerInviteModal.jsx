// src/components/modals/ServerInviteModal.jsx
import React, { useState, useEffect } from 'react';
import axiosInstance from '../../utils/axiosInstance';
import { XMarkIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import '../../styles/ModalStyles.css'; // Veya kendi stil dosyan

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const ServerInviteModal = ({ serverId, onClose }) => {
  const [inviteCode, setInviteCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Modal açılınca mevcut kodu çek veya yeni oluştur
  useEffect(() => {
    const fetchInvite = async () => {
      setLoading(true);
      try {
        // Önce sunucu bilgilerinden mevcut kodu almaya çalışabiliriz
        // ama temiz olsun diye "create/get invite" endpointine istek atıyoruz
        const res = await axiosInstance.post(`${API_URL_BASE}/api/v1/servers/${serverId}/invite`);
        setInviteCode(res.data.data?.code || res.data.code);
      } catch (error) {
        console.error("Davet kodu alınamadı:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchInvite();
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
              <div className="invite-loading">Kod oluşturuluyor...</div>
            ) : (
              <>
                <input
                  type="text"
                  readOnly
                  value={inviteCode || 'Kod bulunamadı'}
                  className="invite-code-input"
                />
                <button
                  onClick={handleCopy}
                  className={`copy-btn ${copied ? 'copied' : ''}`}
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