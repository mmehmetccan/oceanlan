// src/context/SocketContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { AuthContext } from './AuthContext'; // AuthContext eklendi

export const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const { token, isAuthenticated ,dispatch} = useContext(AuthContext); // Token ve Auth durumunu al

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

  useEffect(() => {
    if (!socket) return;

    // 🏆 ROZET KAZANILDIĞINDA
    socket.on('badge-earned', (data) => {
       // Backend'den sadece rozet bilgisi geliyor, mevcut user'a eklemeliyiz
       // (Not: En sağlıklısı backend'in tüm user objesini dönmesidir ama manuel ekleyelim)
       // Burada sadece Toast göstersek yeterli, veri güncellemeyi 'level-up' veya profil çekmede yaparız.
       // Ama eğer anlık rozet ikonunu göstermek istiyorsan backend'den güncel 'badges' arrayini istemek en iyisidir.
    });

    // ⭐ LEVEL ATLADIĞINDA
    socket.on('level-up', (data) => {
        // data: { level: 5, xp: 1250 }
        dispatch({
            type: 'UPDATE_USER_STATS',
            payload: {
                level: data.level,
                xp: data.xp
            }
        });
    });

    // Mesaj atınca gelen ufak XP güncellemeleri için (Opsiyonel)
    // Backend'e "xp-updated" eventi eklediysen buraya yazabilirsin.

    return () => {
        socket.off('badge-earned');
        socket.off('level-up');
    };
  }, [socket, dispatch]);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);