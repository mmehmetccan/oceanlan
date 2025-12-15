// src/components/integrations/IlkonbirKurFrame.jsx
import React, { useState } from 'react';

const IlkonbirKurFrame = () => {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#202225' }}>

      {/* Üst Bilgi Çubuğu */}
      <div style={{
          padding: '10px 20px',
          borderBottom: '1px solid #2f3136',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#2f3136'
      }}>
        <h3 style={{ margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
          ⚽ İlkonbirKur.com
        </h3>
        <a
            href="https://ilkonbirkur.com"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#00aff4', fontSize: '12px', textDecoration: 'none' }}
        >
            Tarayıcıda Aç ↗
        </a>
      </div>

      {/* Site Yükleniyor Göstergesi */}
      {isLoading && (
          <div style={{
              flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#b9bbbe'
          }}>
              Yükleniyor...
          </div>
      )}

      {/* Web Sitesi Çerçevesi */}
      <iframe
        src="https://ilkonbirkur.com"
        title="IlkonbirKur Squad Builder"
        style={{
            flex: 1,
            border: 'none',
            width: '100%',
            display: isLoading ? 'none' : 'block'
        }}
        onLoad={() => setIsLoading(false)}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; microphone; camera" // Gerekirse izinler
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms" // Güvenlik ayarları
      />
    </div>
  );
};

export default IlkonbirKurFrame;