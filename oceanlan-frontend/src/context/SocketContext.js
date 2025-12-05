// src/context/SocketContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const backendUrl = import.meta.env.VITE_SOCKET_URL || 'https://oceanlan.com'; // 🌐 BURAYA domain adresini gir
    const s = io(backendUrl, {
      transports: ['websocket'],
      withCredentials: true,
    });

    setSocket(s);

    s.on('connect', () => {
      console.log('[SOCKET] Bağlandı:', s.id);
    });

    s.on('disconnect', () => {
      console.log('[SOCKET] Bağlantı kesildi');
    });

    return () => {
      s.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
