// src/hooks/useSocket.js
import { useEffect, useContext, useState } from 'react';
import io from 'socket.io-client';
import { AuthContext } from '../context/AuthContext';

// Prod'da: https://oceanlan.com
// Dev'de: http://localhost:3000 (backend'in portunu burada ne kullanıyorsan ona göre ayarla)
const ENV_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
// Eğer adreste /api/v1 varsa temizle (Socket kök adrese bağlanır)
const SOCKET_SERVER_URL = ENV_URL.replace('/api/v1', '');
// 🔴 ÖNEMLİ: global socket burada TANIMLANACAK (yorum değil, gerçek kod)
let globalSocket = null; // Bağlantıyı globalde tut

export const useSocket = () => {
  const { isAuthenticated, token } = useContext(AuthContext);
  const [socket, setSocket] = useState(globalSocket);

  useEffect(() => {
    // 1. GİRİŞ YAPILDIYSA ve token varsa ve global socket YOKSA
    if (isAuthenticated && token && !globalSocket) {
      console.log('[useSocket] Token bulundu, socket bağlantısı kuruluyor...');

      const newSocket = io(SOCKET_SERVER_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        withCredentials: true,
        // prod'da nginx üzerinden /socket.io ya gidiyor
        // path: '/socket.io', // istersen bunu da açıkça yazabilirsin
      });

      newSocket.on('connect', () => {
        console.log('[SOCKET]: Bağlantı kuruldu ->', newSocket.id);
      });

      newSocket.on('disconnect', () => {
        console.log('[SOCKET]: Bağlantı kesildi');
      });

      newSocket.on('connect_error', (err) => {
        console.error('[SOCKET HATA]: Bağlantı hatası:', err.message);
      });

      globalSocket = newSocket;
      setSocket(newSocket);
    }
    // 2. ÇIKIŞ YAPILDIYSA ve global socket VARSA
    else if (!isAuthenticated && globalSocket) {
      console.log('[useSocket] Çıkış yapıldı, socket bağlantısı kesiliyor...');
      globalSocket.close();
      globalSocket = null;
      setSocket(null);
    }
  }, [isAuthenticated, token]);

  return { socket };
};
