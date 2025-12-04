// src/components/modals/DeleteServerModal.jsx
import React, { useState ,useContext} from 'react';
import { ToastContext } from '../../context/ToastContext';

const DeleteServerModal = ({ serverName, onClose, onConfirm }) => {
  const [confirmText, setConfirmText] = useState('');
  const { addToast } = useContext(ToastContext);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (confirmText.trim() !== serverName) {
      addToast('Sunucu adı eşleşmiyor. Lütfen doğru yazın.', 'error');
      return;
    }
    if (onConfirm) onConfirm();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Sunucuyu Sil</h3>
        <p className="hint">
          Bu işlem geri alınamaz. Devam etmek için sunucu adını yazın:
        </p>
        <form onSubmit={handleSubmit} className="create-server-form">
          <input
            type="text"
            placeholder={serverName}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
          {error && <p className="error-message">{error}</p>}
          <button type="submit" className="danger">
            Sil ve Devam Et
          </button>
        </form>
        <button className="close-button" onClick={onClose}>
          X
        </button>
      </div>
    </div>
  );
};

export default DeleteServerModal;
