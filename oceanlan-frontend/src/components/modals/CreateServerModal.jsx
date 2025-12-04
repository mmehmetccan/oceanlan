// src/components/modals/CreateServerModal.jsx
import React, { useState, useRef, useEffect ,useContext} from 'react';
import { ToastContext } from '../../context/ToastContext';

const CreateServerModal = ({ onClose, createServer, onCreated }) => {
  const { addToast } = useContext(ToastContext); // 👈 Toast fonksiyonunu çekiyoruz
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);

  // Dosya seçildiğinde çalışır
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      // Modern tarayıcılar için daha hızlı önizleme oluşturma yöntemi
      const objectUrl = URL.createObjectURL(selectedFile);
      setPreview(objectUrl);
    }
  };

  // Component unmount olduğunda (kapandığında) veya preview değiştiğinde belleği temizle
  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
        addToast('Lütfen bir sunucu adı girin.', 'warning'); // 👈 Uyarı Toast'u
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append('name', name.trim());
      if (file) {
        formData.append('icon', file);
      }

      // createServer fonksiyonu (Context'ten gelen)
      const newServer = await createServer(formData);

      addToast('Sunucu başarıyla oluşturuldu!', 'success');

      if (onCreated) onCreated(newServer);
      onClose();

    } catch (err) {
      console.error(err);
      addToast(err?.message || 'Sunucu oluşturulamadı', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Yeni Sunucu Oluştur</h3>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <div
            onClick={() => fileInputRef.current.click()}
            style={{
              width: '100px', height: '100px', borderRadius: '50%',
              backgroundColor: '#36393f', border: '2px dashed #4f545c',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', overflow: 'hidden', position: 'relative'
            }}
          >
            {preview ? (
              <img src={preview} alt="Sunucu Önizleme" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '24px', display: 'block' }}>📷</span>
                <span style={{ fontSize: '10px', color: '#b9bbbe', textTransform: 'uppercase', marginTop: '4px' }}>Yükle</span>
              </div>
            )}
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept="image/*" />
        </div>

        <form onSubmit={handleSubmit} className="create-server-form">
          <label style={{ color: '#b9bbbe', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
            Sunucu Adı
          </label>
          <input
            type="text" placeholder="Sunucunun adı ne olsun?"
            value={name} onChange={(e) => setName(e.target.value)}
            disabled={loading} autoFocus
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
            <button type="button" onClick={onClose} className="pill-btn ghost" disabled={loading} style={{ marginRight: '10px' }}>Geri</button>
            <button type="submit" disabled={loading} className="pill-btn primary">
              {loading ? 'Oluşturuluyor...' : 'Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateServerModal;