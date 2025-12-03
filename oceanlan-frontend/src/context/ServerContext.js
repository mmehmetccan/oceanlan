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
      return {
        ...state,
        servers: [...state.servers, action.payload],
        // NOT: Active server'ı burada hemen set etmiyoruz,
        // detaylı fetch (fetchServerDetails) yapınca set edilecek.
      };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'RESET_SERVER_STATE':
      return initialState;

    case 'UPDATE_MEMBER_PRESENCE':
      if (!state.activeServer || !state.activeServer.members) return state;
      const updatedMembers = state.activeServer.members.map(member => {
        const memberUserId = member.user?._id || member.user;
        if (memberUserId && memberUserId.toString() === action.payload.userId.toString()) {
          return {
            ...member,
            user: {
              ...member.user,
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

    default:
      return state;
  }
};

export const ServerContext = createContext(initialState);

export const ServerProvider = ({ children }) => {
  const [state, dispatch] = useReducer(ServerReducer, initialState);
  const { token, isAuthenticated, logout } = useContext(AuthContext);
  const { socket } = useSocket();

  const fetchServerDetails = useCallback(async (serverId) => {
    if (!token) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const res = await axiosInstance.get(`/servers/${serverId}`);
      dispatch({ type: 'SET_ACTIVE_SERVER', payload: res.data.data });
      dispatch({ type: 'SET_LOADING', payload: false });
      return res.data.data;
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      console.error("Sunucu detay hatası:", error);
    }
  }, [dispatch, token]);

  const fetchUserServers = useCallback(async () => {
    if (!token) return;
    // Loading'i true yapmıyoruz ki menü titremesin
    try {
      const res = await axiosInstance.get('/servers/');
      dispatch({ type: 'SET_SERVERS', payload: res.data.data });
    } catch (error) {
      console.error("Sunucu listesi hatası:", error);
    }
  }, [token, dispatch]);

  // Socket Presence
  useEffect(() => {
    if (!socket) return;
    const handleStatusChange = (data) => {
      dispatch({ type: 'UPDATE_MEMBER_PRESENCE', payload: data });
    };
    socket.on('userStatusChanged', handleStatusChange);
    return () => { socket.off('userStatusChanged', handleStatusChange); };
  }, [socket]);

  // İlk açılış
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchUserServers();
    } else {
      dispatch({ type: 'RESET_SERVER_STATE' });
    }
  }, [isAuthenticated, token, fetchUserServers]);

  // 📢 DÜZELTİLEN FONKSİYON: createNewServer
  const createNewServer = useCallback(async (serverData) => {
    if (!token) throw new Error('Oturum sonlandı.');
    try {
      const isFormData = serverData instanceof FormData;
      const payload = typeof serverData === 'string' ? { name: serverData } : serverData;
      const config = isFormData ? { headers: { "Content-Type": "multipart/form-data" } } : {};

      // 1. Sunucuyu oluştur
      const res = await axiosInstance.post('/servers', payload, config);
      const newServerRaw = res.data.data;

      // 2. Listeye ekle
      dispatch({ type: 'ADD_SERVER', payload: newServerRaw });

      // 3. 📢 KRİTİK: Detayları (Roller, İzinler) veritabanından tam çek
      // Bu işlem 'activeServer'ı günceller ve 'Sunucu Ayarları' butonu görünür olur.
      await fetchServerDetails(newServerRaw._id);

      return newServerRaw;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Sunucu oluşturma başarısız');
    }
  }, [token, dispatch, fetchServerDetails]);

  const setActiveChannel = useCallback((channel) => {
    dispatch({ type: 'SELECT_CHANNEL', payload: channel });
  }, [dispatch]);

  return (
    <ServerContext.Provider value={{
      ...state,
      dispatch,
      fetchServerDetails,
      createNewServer,
      fetchUserServers,
      setActiveChannel,
    }}>
      {children}
    </ServerContext.Provider>
  );
};