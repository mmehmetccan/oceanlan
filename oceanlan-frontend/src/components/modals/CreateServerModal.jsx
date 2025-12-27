// src/components/modals/CreateServerModal.jsx
import React, { useState, useContext } from 'react';
import { ServerContext } from '../../context/ServerContext';
import { XMarkIcon, PhotoIcon, LockClosedIcon, GlobeAltIcon } from '@heroicons/react/24/solid';
import '../../styles/ModalStyles.css';

const CreateServerModal = ({ onClose }) => {
  const { createNewServer } = useContext(ServerContext);

  const [serverName, setServerName] = useState('');
  const [serverIcon, setServerIcon] = useState(null);
  const [preview, setPreview] = useState(null);

  // 🟢 YENİ STATE'LER
  const [isPublic, setIsPublic] = useState(false);
  const [joinMode, setJoinMode] = useState('direct'); // 'direct' veya 'request'

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setServerIcon(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!serverName.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // 🟢 Context'teki fonksiyona yeni parametreleri gönderiyoruz
      // Not: ServerContext içindeki createNewServer fonksiyonunu da güncellemen gerekebilir
      // Eğer context direkt axios çağırıyorsa sorun yok, ama parametre alıyorsa oraya da ekle.
      await createNewServer(serverName, serverIcon, isPublic, joinMode);
      onClose();
    } catch (err) {
      // Backend'den gelen "Bu isim alınmış" hatası burada görünecek
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px', textAlign: 'center' }}>
        <div className="modal-header" style={{ justifyContent: 'center' }}>
          <h3>Sunucunu Özelleştir</h3>
          <button className="close-btn" onClick={onClose} style={{ position: 'absolute', right: '20px' }}><XMarkIcon width={24} /></button>
        </div>

        <p style={{ color: '#b9bbbe', marginBottom: '20px', fontSize: '13px' }}>
          Sunucuna bir kimlik kazandır. İstersen herkese açıp topluluğunu büyütebilirsin.
        </p>

        <form onSubmit={handleSubmit} className="modal-body">

          {/* RESİM YÜKLEME ALANI */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            <label htmlFor="server-icon-upload" style={{ width: '80px', height: '80px', borderRadius: '50%', border: '2px dashed #b9bbbe', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', position: 'relative' }}>
              {preview ? (
                <img src={preview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#b9bbbe', fontSize: '10px' }}>
                  <PhotoIcon width={24} /> <span>YÜKLE</span>
                </div>
              )}
              <input id="server-icon-upload" type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
            </label>
          </div>

          {/* İSİM ALANI */}
          <div className="input-group" style={{ textAlign: 'left', marginBottom: '15px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#b9bbbe', marginBottom: '5px', display: 'block' }}>SUNUCU ADI</label>
            <input type="text" value={serverName} onChange={(e) => setServerName(e.target.value)} placeholder="Sunucum" required className="invite-code-input" style={{ width: '100%', padding: '10px', backgroundColor: '#202225', border: 'none', color: 'white', borderRadius: '4px' }} />
          </div>

          {/* 🟢 GÖRÜNÜRLÜK AYARI (RADIO) */}
          <div className="input-group" style={{ textAlign: 'left', marginBottom: '15px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#b9bbbe', marginBottom: '5px', display: 'block' }}>GÖRÜNÜRLÜK</label>

            <div style={{ display: 'flex', gap: '10px' }}>
              <div
                onClick={() => setIsPublic(false)}
                style={{
                  flex: 1, padding: '10px', borderRadius: '4px', cursor: 'pointer', border: !isPublic ? '1px solid #1ab199' : '1px solid transparent',
                  backgroundColor: !isPublic ? 'rgba(88, 101, 242, 0.1)' : '#2f3136'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold', fontSize: '14px' }}>
                  <LockClosedIcon width={16} /> Özel
                </div>
                <p style={{ fontSize: '11px', color: '#b9bbbe', marginTop: '3px' }}>Sadece davet edilenler katılabilir.</p>
              </div>

              <div
                onClick={() => setIsPublic(true)}
                style={{
                  flex: 1, padding: '10px', borderRadius: '4px', cursor: 'pointer', border: isPublic ? '1px solid #3ba55c' : '1px solid transparent',
                  backgroundColor: isPublic ? 'rgba(59, 165, 92, 0.1)' : '#2f3136'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold', fontSize: '14px' }}>
                  <GlobeAltIcon width={16} /> Herkese Açık
                </div>
                <p style={{ fontSize: '11px', color: '#b9bbbe', marginTop: '3px' }}>Keşfet sayfasında görünür.</p>
              </div>
            </div>
          </div>

          {/* 🟢 KATILIM MODU (SADECE PUBLIC İSE GÖRÜNÜR) */}
          {isPublic && (
            <div className="input-group" style={{ textAlign: 'left', marginBottom: '15px', animation: 'fadeIn 0.3s' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#b9bbbe', marginBottom: '5px', display: 'block' }}>KATILIM TÜRÜ</label>
              <select
                value={joinMode}
                onChange={(e) => setJoinMode(e.target.value)}
                style={{ width: '100%', padding: '10px', backgroundColor: '#1ab199', color: 'white', border: 'none', borderRadius: '4px' }}
              >
                <option value="direct">Direkt Katılım (Herkes Girebilir)</option>
                <option value="request">Onaylı Katılım (Admin Onayı Gerekir)</option>
              </select>
            </div>
          )}

          {error && <div className="error-message" style={{ color: '#ed4245', marginTop: '10px', fontSize: '13px' }}>{error}</div>}

          <div className="modal-footer" style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>Vazgeç</button>
            <button type="submit" className="copy-btn" disabled={loading} style={{ width: 'auto', padding: '10px 24px', backgroundColor: "#1ab199" }}>
              {loading ? 'Oluşturuluyor...' : 'Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateServerModal;