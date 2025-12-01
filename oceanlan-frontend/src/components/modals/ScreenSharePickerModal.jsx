// src/components/modals/ScreenSharePickerModal.jsx
import React, { useEffect, useState } from 'react';
import '../../styles/ScreenSharePicker.css';

const ScreenSharePickerModal = ({ onClose, onSelect }) => {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getSources = async () => {
      // Preload üzerinden kaynakları iste
      if (window.electronAPI) {
        try {
          const _sources = await window.electronAPI.getScreenSources();
          setSources(_sources);
        } catch (e) {
          console.error("Kaynaklar alınamadı:", e);
        } finally {
          setLoading(false);
        }
      }
    };
    getSources();
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose} style={{zIndex: 99999}}>
      <div className="modal-content screen-picker-modal" onClick={e => e.stopPropagation()}>
        <h3>Ekran Paylaşımı</h3>
        <p className="hint">Paylaşmak istediğiniz ekranı veya pencereyi seçin.</p>

        {loading ? (
            <div className="loading-text">Kaynaklar yükleniyor...</div>
        ) : (
            <div className="sources-grid">
              {sources.map(source => (
                  <div key={source.id} className="source-item" onClick={() => onSelect(source.id)}>
                    <img src={source.thumbnail} alt={source.name}/>
                    <span>{source.name}</span>
                  </div>
              ))}
            </div>
        )}
        <button className="close-button" onClick={onClose}>X</button>
      </div>
    </div>
  );
};

export default ScreenSharePickerModal;