// src/context/SocketContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { AuthContext } from './AuthContext';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const { token, isAuthenticated } = useContext(AuthContext);

  useEffect(() => {
    // 🛑 OTURUM YOKSA BAĞLANMA
    if (!isAuthenticated || !token) {
        if (socket) {
            socket.disconnect();
            setSocket(null);
        }
        return;
    }

    if (socket && socket.connected) return;

    const isElectron = navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;
    const isProductionUrl = window.location.hostname.includes('oceanlan.com');
    const backendUrl = (isElectron || isProductionUrl) ? 'https://oceanlan.com' : 'http://localhost:4000';

    const newSocket = io(backendUrl, {
      auth: { token },
      transports: ['polling', 'websocket'],
      secure: true,
      reconnection: true,
      reconnectionAttempts: 5,
    });

    setSocket(newSocket);

    newSocket.on('connect', () => console.log('[SOCKET] Bağlandı ID:', newSocket.id));
    newSocket.on('disconnect', () => console.log('[SOCKET] Bağlantı koptu.'));

    return () => { newSocket.disconnect(); };
  }, [token, isAuthenticated]);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);