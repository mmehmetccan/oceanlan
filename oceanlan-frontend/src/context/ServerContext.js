// src/context/ServerContext.js
import React, { createContext, useReducer, useContext, useCallback, useEffect } from 'react';
import axiosInstance from '../utils/axiosInstance';
import { AuthContext } from './AuthContext';
import { useSocket } from '../hooks/useSocket';

const initialState = {
  servers: [],
  activeServer: null,
  activeChannel: null,
  loading: false,
};

const ServerReducer = (state, action) => {
  switch (action.type) {
    case 'SET_SERVERS':
      return { ...state, servers: action.payload };
    case 'SET_ACTIVE_SERVER':
      return { ...state, activeServer: action.payload };
    case 'SELECT_CHANNEL':
      return { ...state, activeChannel: action.payload };
    case 'ADD_SERVER':
      return { ...state, servers: [...state.servers, action.payload] };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };

    // 🛠️ DÜZELTME: İSİM EŞİTLENDİ (UPDATE_MEMBER_PRESENCE)
    case 'UPDATE_MEMBER_PRESENCE':
      if (!state.activeServer || !state.activeServer.members) return state;

      const updatedMembers = state.activeServer.members.map(member => {
        const mUserId = member.user?._id || member.user;
        if (String(mUserId) === String(action.payload.userId)) {
          // Mevcut veriyi koru, sadece status güncelle
          const oldUserObj = typeof member.user === 'object' ? member.user : { _id: mUserId };
          return {
            ...member,
            user: {
              ...oldUserObj,
              onlineStatus: action.payload.status,
              lastSeenAt: action.payload.lastSeenAt
            }
          };
        }
        return member;
      });

      return {
        ...state,
        activeServer: { ...state.activeServer, members: updatedMembers }
      };

    case 'RESET_SERVER_STATE':
      return initialState;
    default:
      return state;
  }
};

export const ServerContext = createContext(initialState);

export const ServerProvider = ({ children }) => {
  const [state, dispatch] = useReducer(ServerReducer, initialState);
  const { token, isAuthenticated } = useContext(AuthContext);
  const { socket } = useSocket();

  // Socket Dinleyicisi
  useEffect(() => {
    if (!socket) return;
    const handleStatusChange = (data) => {
      // Socket'ten gelen veriyi Reducer'a gönder
      dispatch({ type: 'UPDATE_MEMBER_PRESENCE', payload: data });
    };
    socket.on('userStatusChanged', handleStatusChange);
    return () => socket.off('userStatusChanged', handleStatusChange);
  }, [socket]);

  const fetchServerDetails = useCallback(async (serverId) => {
    if (!token) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const res = await axiosInstance.get(`/servers/${serverId}`);
      dispatch({ type: 'SET_ACTIVE_SERVER', payload: res.data.data });
      dispatch({ type: 'SET_LOADING', payload: false });
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [token]);

  const fetchUserServers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axiosInstance.get('/servers/');
      dispatch({ type: 'SET_SERVERS', payload: res.data.data });
    } catch (e) { }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated && token) fetchUserServers();
    else dispatch({ type: 'RESET_SERVER_STATE' });
  }, [isAuthenticated, token, fetchUserServers]);

  const createNewServer = useCallback(async (serverName, iconFile, isPublic, joinMode) => {
    if (!token) throw new Error('Oturum yok');
    try {
      const formData = new FormData();
      formData.append('name', serverName);

      // Frontend'den gelen boolean değerleri FormData'ya ekliyoruz
      formData.append('isPublic', isPublic);
      formData.append('joinMode', joinMode);

      if (iconFile) {
        formData.append('icon', iconFile);
      }

      // Tek bir POST isteği ile resmi ve verileri gönderiyoruz
      const res = await axiosInstance.post('/servers', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const newServer = res.data.data;
      dispatch({ type: 'ADD_SERVER', payload: newServer });

      // Oluşan sunucunun detaylarını çekip aktif yap
      await fetchServerDetails(newServer._id);

      return newServer;
    } catch (e) {
      console.error("Sunucu oluşturma hatası:", e);
      throw new Error(e.response?.data?.message || 'Hata');
    }
  }, [token, dispatch, fetchServerDetails]);

  // 🟢 YENİ EKLENEN: joinPublicServer (ChatArea.jsx içindeki Katıl butonu için)
  const joinPublicServer = useCallback(async (serverId) => {
    if (!token) return;
    try {
      const res = await axiosInstance.post(`/servers/${serverId}/join-public`);

      // Eğer başarılıysa ve direkt katılım ise detayları güncelle
      if (res.data.success && res.data.status !== 'pending') {
        await fetchServerDetails(serverId);
        await fetchUserServers(); // Sol menüdeki listeyi güncelle
      }
      return res.data;
    } catch (error) {
      throw error;
    }
  }, [token, fetchServerDetails, fetchUserServers]);

  const setActiveChannel = useCallback((c) => dispatch({ type: 'SELECT_CHANNEL', payload: c }), []);

  return (
    <ServerContext.Provider value={{ ...state, dispatch, fetchServerDetails, createNewServer, fetchUserServers, setActiveChannel, joinPublicServer }}>
      {children}
    </ServerContext.Provider>
  );
};