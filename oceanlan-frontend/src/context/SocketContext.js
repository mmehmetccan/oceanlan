// src/context/SocketContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { AuthContext } from './AuthContext';

export const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const { token, isAuthenticated, dispatch } = useContext(AuthContext);

  useEffect(() => {
    // 1. GÜVENLİK VE TEMİZLİK: Oturum yoksa mevcut soketi kapat
    if (!isAuthenticated || !token) {
      if (socket) {
        console.log("[SOCKET] Oturum kapandı veya yetki yok, bağlantı kesiliyor.");
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    // 2. ÇAKIŞMA ÖNLEME: Eğer zaten bağlı bir soket varsa ikinciyi açma
    if (socket && socket.connected) return;

    // 3. URL YÖNETİMİ
    const isElectron = navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;
    const isProductionUrl = window.location.hostname.includes('oceanlan.com');
    const backendUrl = (isElectron || isProductionUrl) ? 'https://oceanlan.com' : 'http://localhost:4000';

    console.log(`[SOCKET] Bağlantı denemesi: ${backendUrl}`);

    // 4. BAĞLANTI AYARLARI (WebRTC sinyalleşmesi için kararlı hale getirildi)
    const newSocket = io(backendUrl, {
      auth: { token },
      // Önce Websocket dene, başarısız olursa Polling'e dön (Düşük gecikme için kritik)
      transports: ['websocket', 'polling'], 
      secure: true,
      reconnection: true,
      reconnectionAttempts: 20, // Daha fazla deneme (oyunlarda kopma direnci için)
      reconnectionDelay: 2000,   // Her deneme arası 2 saniye
    });

    setSocket(newSocket);

    // 5. OLAY DİNLEYİCİLERİ
    newSocket.on('connect', () => {
      console.log('[SOCKET] Başarıyla bağlandı. ID:', newSocket.id);
    });

    newSocket.on('connect_error', (err) => {
      console.error('[SOCKET] Bağlantı Hatası:', err.message);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[SOCKET] Bağlantı koptu. Sebep:', reason);
      // Eğer sebep sunucu tarafından değilse otomatik bağlanmaya devam eder
    });

    // Cleanup: Bileşen kapandığında veya token değiştiğinde eski soketi temizle
    return () => {
      console.log("[SOCKET] Cleanup çalışıyor, soket kapatılıyor.");
      newSocket.disconnect();
    };
  }, [token, isAuthenticated]); // Sadece auth durumunda yeniden çalışır

  // 6. GLOBAL OYUN VE SOSYAL EVENTLER
  useEffect(() => {
    if (!socket) return;

    // Seviye atlama bildirimi
    socket.on('level-up', (data) => {
      dispatch({
        type: 'UPDATE_USER_STATS',
        payload: {
          level: data.level,
          xp: data.xp
        }
      });
    });

    // Rozet kazanma bildirimi
    socket.on('badge-earned', (data) => {
       console.log("[SOCKET] Yeni rozet kazanıldı:", data);
       // Buraya Toast bildirimini ekleyebilirsin: 
       // addToast(`${data.badgeName} rozetini kazandın!`, 'success');
    });

    return () => {
      socket.off('level-up');
      socket.off('badge-earned');
    };
  }, [socket, dispatch]);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};

// 7. HOOK TANIMI: Diğer dosyalarda useSocket() olarak çağırılır
export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket mutlaka SocketProvider içinde kullanılmalıdır.');
  }
  return context;
};