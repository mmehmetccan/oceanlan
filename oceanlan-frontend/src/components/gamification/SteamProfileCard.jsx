import React from 'react';
import { useSteamStatus } from '../hooks/useSteamStatus';

const SteamProfileCard = ({ userId }) => {
  const { steamData, loading } = useSteamStatus(userId);

  if (loading || !steamData) return null;

  return (
    <div className="mt-4 p-3 bg-[#1e1f22] rounded-lg border border-[#2f3136] flex items-center gap-3">
      <div className="relative">
        <img 
          src={steamData.avatar} 
          alt="Steam Avatar" 
          className="w-12 h-12 rounded-md border-2 border-blue-500" 
        />
        <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[#1e1f22] ${steamData.status > 0 ? 'bg-green-500' : 'bg-gray-500'}`} />
      </div>
      
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
          <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm6.657 14.857c-.247 1.054-1.285 1.705-2.317 1.454l-2.614-.645c-.563.486-1.266.837-2.046.963l-.364 2.684c-.144 1.071-1.127 1.821-2.193 1.674s-1.821-1.127-1.674-2.193l.365-2.684c-1.396-.226-2.502-1.283-2.775-2.67l-2.613-.645c-1.032-.251-1.666-1.285-1.414-2.317s1.285-1.666 2.317-1.414l2.614.645c.563-.486 1.266-.837 2.046-.963l.364-2.684c.144-1.071 1.127-1.821 2.193-1.674s1.821 1.127 1.674 2.193l-.365 2.684c1.396.226 2.502 1.283 2.775 2.67l2.613.645c1.032.251 1.666 1.285 1.414 2.317z"/></svg>
          Steam Bağlı
        </div>
        <div className="text-white font-medium truncate">{steamData.personaname}</div>
        {steamData.currentGame && (
          <div className="text-xs text-blue-400 font-semibold animate-pulse truncate">
            🎮 {steamData.currentGame} Oynuyor
          </div>
        )}
      </div>
    </div>
  );
};