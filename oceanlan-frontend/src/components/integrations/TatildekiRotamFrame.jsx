// src/components/integrations/TatildekiRotamFrame.jsx
import React, { useState } from 'react';

const TatildekiRotamFrame = () => {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#202225',
        overflow: 'hidden'
    }}>

      {/* Üst Bilgi Çubuğu */}
      <div style={{
          height: '48px',
          padding: '0 20px',
          borderBottom: '1px solid #2f3136',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#2f3136',
          flexShrink: 0
      }}>
        <h3 style={{ margin: 0, color: '#fff', fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
          ✈️ TatildekiRotam.com
        </h3>
        <div style={{ display: 'flex', gap: '15px' }}>
            <button
                onClick={() => {
                    const iframe = document.getElementById('tatil-iframe');
                    if(iframe) iframe.src = iframe.src;
                }}
                style={{ background: 'none', border: 'none', color: '#b9bbbe', cursor: 'pointer', fontSize: '12px' }}
            >
                Yenile ↻
            </button>
            <a
                href="https://tatildekirotam.com"
                target="_blank"
                rel="noreferrer"
                style={{ color: '#00aff4', fontSize: '12px', textDecoration: 'none' }}
            >
                Tarayıcıda Aç ↗
            </a>
        </div>
      </div>

      {/* Yükleniyor Göstergesi */}
      {isLoading && (
          <div style={{
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              color: '#b9bbbe',
              background: '#36393f'
          }}>
              Rota Yükleniyor...
          </div>
      )}

      {/* Web Sitesi Çerçevesi */}
      <iframe
        id="tatil-iframe"
        src="https://tatildekirotam.com"
        title="Tatildeki Rotam"
        style={{
            flex: 1,
            width: '100%',
            height: '100%',
            border: 'none',
            display: isLoading ? 'none' : 'block',
            background: '#fff'
        }}
        onLoad={() => setIsLoading(false)}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; microphone; camera"
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
      />
    </div>
  );
};

export default TatildekiRotamFrame;