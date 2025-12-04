// src/components/modals/CreateServerModal.jsx
import React, { useState, useRef, useEffect } from 'react';

const CreateServerModal = ({ onClose, createServer, onCreated }) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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
    setError('');

    if (!name.trim()) {
      setError('Lütfen bir sunucu adı girin.');
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

      if (onCreated) onCreated(newServer);
      onClose();

    } catch (err) {
      console.error(err);
      setError(err?.message || 'Sunucu oluşturulamadı');
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
              width: '100px', // Boyutu biraz büyüttük
              height: '100px',
              borderRadius: '50%',
              backgroundColor: '#36393f',
              border: '2px dashed #4f545c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              overflow: 'hidden',
              position: 'relative' // İkon ortalamak için
            }}
          >
            {preview ? (
              <img
                src={preview}
                alt="Sunucu Önizleme"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover' // Resmin çerçeveye sığmasını sağlar
                }}
              />
            ) : (
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '24px', display: 'block' }}>📷</span>
                <span style={{ fontSize: '10px', color: '#b9bbbe', textTransform: 'uppercase', marginTop: '4px' }}>Yükle</span>
              </div>
            )}
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: 'none' }}
            accept="image/*"
          />
        </div>

        <form onSubmit={handleSubmit} className="create-server-form">
          <label style={{ color: '#b9bbbe', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
            Sunucu Adı
          </label>
          <input
            type="text"
            placeholder="Sunucunun adı ne olsun?"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            autoFocus
          />

          {error && <p className="error-message" style={{ color: '#f04747', fontSize: '14px', marginTop: '10px' }}>{error}</p>}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
            <button type="button" onClick={onClose} className="pill-btn ghost" disabled={loading} style={{ marginRight: '10px' }}>
              Geri
            </button>
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