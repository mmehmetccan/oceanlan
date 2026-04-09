import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

export const useSteamStatus = (userId) => {
  const [steamData, setSteamData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    if (!userId) return;
    try {
      const response = await axios.get(`${API_URL}/users/${userId}/steam-status`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.data.success) {
        setSteamData(response.data.data);
      }
    } catch (err) {
      console.error("Steam verisi çekilemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // 60 saniyede bir oyun durumunu güncelle (Discord tarzı canlılık)
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, [userId]);

  return { steamData, loading };
};