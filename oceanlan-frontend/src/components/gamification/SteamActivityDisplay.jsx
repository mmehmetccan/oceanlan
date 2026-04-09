import React from 'react';
import { useSteamStatus } from '../../hooks/useSteamStatus';

const SteamActivityDisplay = ({ userId, showAlways = false }) => {
  const { steamData, loading } = useSteamStatus(userId);

  // Veri yükleniyorsa veya steam hesabı bağlı değilse hiçbir şey gösterme
  if (loading || !steamData) return null;

  // Oyun oynamıyorsa ve 'her zaman göster' modu kapalıysa gösterme
  if (!showAlways && !steamData.currentGame) return null;

  const handleSteamClick = (e) => {
    e.stopPropagation(); // Diğer tıklama olaylarını (örn: modal kapatma) engelle
    if (steamData.steamId) {
      window.open(`https://steamcommunity.com/profiles/${steamData.steamId}`, '_blank');
    }
  };

  return (
    <div 
      className="steam-activity-container" 
      onClick={handleSteamClick}
      style={{ cursor: 'pointer', marginTop: '4px' }}
    >
      {/* Profil Sayfası İçin: Her zaman takma adı göster */}
      {showAlways && (
        <div style={{ fontSize: '12px', color: '#b9bbbe', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <img src="/steam-icon.png" style={{ width: '14px' }} alt="" />
          {steamData.personaname}
        </div>
      )}

      {/* Oyun Oynuyorsa: Canlı oyun bilgisini göster */}
      {steamData.currentGame && (
        <div style={{ fontSize: '11px', color: '#3ca4ff', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span className="pulse-dot">🎮</span> {steamData.currentGame} Oynuyor
        </div>
      )}
    </div>
  );
};

export default SteamActivityDisplay;