// src/hooks/useServerSocket.js
import { useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useSocket } from './useSocket';

export const useServerSocket = (serverId) => {
  const { isAuthenticated } = useContext(AuthContext);
  const { socket } = useSocket();

  useEffect(() => {
    if (socket && isAuthenticated && serverId) {
      // Sadece join gönderilmeli
      socket.emit('joinServer', serverId);
      console.log(`[SOCKET-HOOK]: 'joinServer' -> ${serverId}`);
      
      // Cleanup: SADECE bileşen kapandığında veya sunucu değiştiğinde odadan çık
      return () => {
        socket.emit('leaveServer', serverId);
      };
    }
  }, [socket, serverId, isAuthenticated]);

  return null;
};