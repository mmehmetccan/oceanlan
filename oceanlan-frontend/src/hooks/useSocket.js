// src/hooks/useSocket.js
import { useEffect, useContext, useState, useRef } from 'react';
import io from 'socket.io-client';
import { AuthContext } from '../context/AuthContext';

const SOCKET_SERVER_URL =
  import.meta.env.PROD
    ? window.location.origin        // https://oceanlan.com
    : 'http://localhost:3000';      // Vite dev iken backendlet globalSocket = null; // Bağlantıyı globalde tut

export const useSocket = () => {
  const { isAuthenticated, token } = useContext(AuthContext); // Token'ı context'ten al
  const [socket, setSocket] = useState(globalSocket);

  useEffect(() => {
    // 1. GİRİŞ YAPILDIYSA ve token varsa ve global socket YOKSA
    if (isAuthenticated && token && !globalSocket) {
      console.log("[useSocket] Token bulundu, socket bağlantısı kuruluyor...");

      const newSocket = io(SOCKET_SERVER_URL, {
        // Backend'deki 'io.use()' middleware'inin okuması için token'ı gönder
        auth: { token },
        transports: ['websocket', 'polling'],
          withCredentials: true,

      });

      newSocket.on('connect', () => {
        console.log('[SOCKET]: Bağlantı kuruldu ->', newSocket.id);
      });

      newSocket.on('disconnect', () => {
        console.log('[SOCKET]: Bağlantı kesildi');
      });

      newSocket.on('connect_error', (err) => {
          // Eğer backend (io.use) token'ı reddederse burada hata görürüz
          console.error('[SOCKET HATA]: Bağlantı hatası:', err.message);
      });

      globalSocket = newSocket;
      setSocket(newSocket);
    }
    // 2. ÇIKIŞ YAPILDIYSA ve global socket VARSA
    else if (!isAuthenticated && globalSocket) {
      console.log("[useSocket] Çıkış yapıldı, socket bağlantısı kesiliyor...");
      globalSocket.close();
      globalSocket = null;
      setSocket(null);
    }

  // 'isAuthenticated' veya 'token' değiştiğinde bu efekti yeniden çalıştır
  }, [isAuthenticated, token]);

  return { socket };
};