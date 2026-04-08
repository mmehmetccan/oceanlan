// src/hooks/useSocket.js
import { useContext } from 'react';
import { SocketContext } from '../context/SocketContext';

export const useSocket = () => {
  // Kendi içinde io() başlatmak yerine merkezi Context'i kullanıyoruz.
  const context = useContext(SocketContext);
  
  if (!context) {
    return { socket: null };
  }

  return { socket: context.socket };
};