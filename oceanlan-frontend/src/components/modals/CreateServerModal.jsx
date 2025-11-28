// src/components/modals/CreateServerModal.jsx
import React, { useState,useRef } from 'react';

const CreateServerModal = ({ onClose, createServer, onCreated }) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);


  const handleFileChange = (e) => {
      const selectedFile = e.target.files[0];
      if (selectedFile) {
          setFile(selectedFile);
          // Önizleme oluştur
          const reader = new FileReader();
          reader.onloadend = () => {
              setPreview(reader.result);
          };
          reader.readAsDataURL(selectedFile);
      }
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Lütfen bir sunucu adı girin.');
      return;
    }

    try {
      setLoading(true);

      // --- DEĞİŞİKLİK: FormData Kullanımı ---
      const formData = new FormData();
      formData.append('name', name.trim());
      if (file) {
          formData.append('icon', file); // Backend 'icon' bekliyor
      }
      // -------------------------------------

      const newServer = await createServer(formData); // FormData gönderiyoruz
      if (onCreated) onCreated(newServer);
      onClose();
    } catch (err) {
      setError(err?.message || 'Sunucu oluşturulamadı');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Yeni Sunucu Oluştur</h3>

        <div style={{display: 'flex', justifyContent: 'center', marginBottom: '20px'}}>
          <div
              onClick={() => fileInputRef.current.click()}
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                backgroundColor: '#36393f',
                border: '2px dashed #4f545c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                overflow: 'hidden',
                backgroundImage: preview ? `url(${preview})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
          >
            {!preview && <span style={{fontSize: '24px', color: '#b9bbbe'}}>📷</span>}
          </div>
          <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{display: 'none'}}
              accept="image/*"
          />
        </div>

        <form onSubmit={handleSubmit} className="create-server-form">
          <input
              type="text"
              placeholder="Yeni sunucu adı"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
          />
          {error && <p className="error-message">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Oluşturuluyor...' : 'Oluştur'}
          </button>
        </form>
        <button className="close-button" onClick={onClose}>
          X
        </button>
      </div>
    </div>
  );
};

export default CreateServerModal;
