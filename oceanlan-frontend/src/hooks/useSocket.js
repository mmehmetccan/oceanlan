// src/hooks/useSocket.js
import { useContext } from 'react';
import { SocketContext } from '../context/SocketContext'; 

export const useSocket = () => {
  const context = useContext(SocketContext);
  
  // Eğer bileşen bir SocketProvider içinde değilse hata vermemesi için:
  if (!context) {
    return { socket: null }; 
  }
  
  return context; // { socket } objesini döndürür
};