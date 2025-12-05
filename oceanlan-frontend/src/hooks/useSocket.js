// src/hooks/useSocket.js
import { useEffect, useContext, useState } from 'react';
import io from 'socket.io-client';
import { AuthContext } from '../context/AuthContext';

// 🔴 Backend portunuz 4000 ise burası 4000 olmalı
const getSocketUrl = () => {
  return import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';
};

const SOCKET_SERVER_URL = getSocketUrl();


let globalSocket = null;

export const useSocket = () => {
  const { isAuthenticated, token } = useContext(AuthContext);
  const [socket, setSocket] = useState(globalSocket);

  useEffect(() => {
    if (isAuthenticated && token && !globalSocket) {
      const newSocket = io(SOCKET_SERVER_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        withCredentials: true,
        reconnectionAttempts: 5,
      });

      newSocket.on('connect', () => console.log('[SOCKET] Bağlandı:', newSocket.id));

      globalSocket = newSocket;
      setSocket(newSocket);
    }
    else if (!isAuthenticated && globalSocket) {
      globalSocket.close();
      globalSocket = null;
      setSocket(null);
    }
  }, [isAuthenticated, token]);

  return { socket };
};