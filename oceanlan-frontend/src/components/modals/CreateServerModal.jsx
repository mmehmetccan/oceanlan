// src/components/modals/CreateServerModal.jsx
import React, { useState, useContext } from 'react';
import { ServerContext } from '../../context/ServerContext';
import { XMarkIcon, PhotoIcon } from '@heroicons/react/24/solid';
import '../../styles/ModalStyles.css';

const CreateServerModal = ({ onClose }) => {
  const { createNewServer } = useContext(ServerContext);
  const [serverName, setServerName] = useState('');
  const [serverIcon, setServerIcon] = useState(null);
  const [preview, setPreview] = useState(null);
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
      // İki parametre gönderiyoruz: İsim ve Dosya
      await createNewServer(serverName, serverIcon);
      onClose(); // Başarılıysa kapat
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '400px', textAlign:'center'}}>
        <div className="modal-header" style={{justifyContent:'center'}}>
          <h3>Sunucunu Özelleştir</h3>
          {/* Kapat butonu absolute olsun */}
          <button className="close-btn" onClick={onClose} style={{position:'absolute', right:'20px'}}><XMarkIcon width={24} /></button>
        </div>

        <p style={{color:'#b9bbbe', marginBottom:'20px'}}>Sunucuna bir isim ve simge vererek ona bir kişilik kazandır. Bunları daha sonra değiştirebilirsin.</p>

        <form onSubmit={handleSubmit} className="modal-body">

          {/* RESİM YÜKLEME ALANI */}
          <div style={{display:'flex', justifyContent:'center', marginBottom:'20px'}}>
              <label
                htmlFor="server-icon-upload"
                style={{
                    width: '80px', height: '80px', borderRadius: '50%',
                    border: '2px dashed #b9bbbe', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', overflow: 'hidden', position: 'relative'
                }}
              >
                  {preview ? (
                      <img src={preview} alt="Preview" style={{width:'100%', height:'100%', objectFit:'cover'}} />
                  ) : (
                      <div style={{display:'flex', flexDirection:'column', alignItems:'center', color:'#b9bbbe', fontSize:'10px'}}>
                          <PhotoIcon width={24} />
                          <span>YÜKLE</span>
                      </div>
                  )}
                  {/* Gizli Input */}
                  <input
                      id="server-icon-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      style={{display:'none'}}
                  />
              </label>
          </div>

          <div className="input-group" style={{textAlign:'left'}}>
              <label style={{fontSize:'12px', fontWeight:'bold', color:'#b9bbbe', marginBottom:'5px', display:'block'}}>SUNUCU ADI</label>
              <input
                  type="text"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="Sunucum"
                  required
                  className="invite-code-input" // Mevcut stilini kullan
                  style={{width: '100%', boxSizing:'border-box', backgroundColor: '#202225', padding:'10px', borderRadius:'4px', border:'none', color:'white'}}
              />
          </div>

          {error && <div className="error-message" style={{color:'#ed4245', marginTop:'10px'}}>{error}</div>}

          <div className="modal-footer" style={{marginTop:'20px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <button type="button" onClick={onClose} style={{background:'transparent', border:'none', color:'white', cursor:'pointer'}}>Vazgeç</button>
              <button type="submit" className="copy-btn" disabled={loading} style={{width:'auto', padding:'10px 24px'}}>
                  {loading ? 'Oluşturuluyor...' : 'Oluştur'}
              </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateServerModal;