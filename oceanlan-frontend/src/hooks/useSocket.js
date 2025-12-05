// src/hooks/useSocket.js
import { useEffect, useContext, useState } from 'react';
import io from 'socket.io-client';
import { AuthContext } from '../context/AuthContext';

let globalSocket = null;

export const useSocket = () => {
  const { isAuthenticated, token } = useContext(AuthContext);
  const [socket, setSocket] = useState(globalSocket);

  useEffect(() => {
    // Zaten bağlıysa veya giriş yapılmamışsa işlem yapma
    if (!isAuthenticated || !token) {
        if (globalSocket) {
            globalSocket.disconnect();
            globalSocket = null;
            setSocket(null);
        }
        return;
    }

    if (!globalSocket) {
      // 🟢 URL AYARI BURADA YAPILIYOR 🟢
      const isProduction = window.location.hostname.includes('oceanlan.com');

      const SOCKET_SERVER_URL = isProduction
        ? 'https://oceanlan.com'
        : 'http://localhost:4000';

      console.log(`[useSocket] Bağlanılıyor: ${SOCKET_SERVER_URL}`);

      const newSocket = io(SOCKET_SERVER_URL, {
        auth: { token }, // Token göndermeyi unutmuyoruz
        transports: ['polling', 'websocket'],
        secure: isProduction,
        reconnection: true,
        reconnectionAttempts: 5,
      });

      newSocket.on('connect', () => {
          console.log('[useSocket] Genel Socket Bağlandı:', newSocket.id);
      });

      newSocket.on('connect_error', (err) => {
          console.error('[useSocket] Bağlantı Hatası:', err.message);
      });

      globalSocket = newSocket;
      setSocket(newSocket);
    }
  }, [isAuthenticated, token]);

  return { socket };
};