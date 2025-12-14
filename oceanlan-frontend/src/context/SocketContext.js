// src/context/SocketContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { AuthContext } from './AuthContext'; // AuthContext eklendi

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const { token, isAuthenticated } = useContext(AuthContext); // Token ve Auth durumunu al

  useEffect(() => {
    // Eğer giriş yapılmamışsa veya token yoksa socket açma (veya varsa kapat)
    if (!isAuthenticated || !token) {
        if (socket) {
            console.log("[SOCKET] Oturum kapandı, bağlantı kesiliyor.");
            socket.disconnect();
            setSocket(null);
        }
        return;
    }

    // Eğer zaten bağlı bir socket varsa ve token değişmediyse tekrar bağlanma
    if (socket && socket.connected) return;

    // Backend URL
    const isElectron = navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;
    const isProductionUrl = window.location.hostname.includes('oceanlan.com');
    const backendUrl = (isElectron || isProductionUrl) ? 'https://oceanlan.com' : 'http://localhost:4000';

    console.log(`[SOCKET] Başlatılıyor... (${backendUrl})`);

    const newSocket = io(backendUrl, {
      auth: { token }, // Token'ı gönder (Backend kim olduğunu bilsin)
      transports: ['polling', 'websocket'], // Polling önce, sonra websocket (Daha kararlı)
      secure: true,
      reconnection: true,
      reconnectionAttempts: 10,
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('[SOCKET] Bağlandı ID:', newSocket.id);
    });

    newSocket.on('disconnect', () => {
      console.log('[SOCKET] Bağlantı koptu.');
    });

    // Cleanup: Component unmount olduğunda (veya token değiştiğinde) kapat
    return () => {
      newSocket.disconnect();
    };
  }, [token, isAuthenticated]); // Token veya Auth değişince burası çalışır

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);