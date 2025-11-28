// src/hooks/useServerSocket.js (FRONTEND - TAM KOD)
import { useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useSocket } from './useSocket';

export const useServerSocket = (serverId) => {
  const { isAuthenticated } = useContext(AuthContext);
  const { socket } = useSocket();

  useEffect(() => {
    // Sadece socket, serverId ve giriş varsa çalış
    if (socket && isAuthenticated && serverId) {

      // Backend'e hangi sunucu odasında olmamız gerektiğini söyle.
      // Backend (bir sonraki adımda düzelteceğimiz) eski odadan
      // bizi otomatik olarak çıkaracak ve yarış durumu (race condition) olmayacak.
      socket.emit('joinServer', serverId);
      console.log(`[SOCKET-HOOK]: 'joinServer' isteği gönderildi -> ${serverId}`);
    }

    // Artık cleanup (temizlik) fonksiyonuna (return) ihtiyacımız YOK.
    // React Strict Mode artık 'leaveServer' komutunu tetikleyemeyecek.

  }, [socket, serverId, isAuthenticated]);

  // Bu hook'un bir şey döndürmesine gerek yok
  return null;
};