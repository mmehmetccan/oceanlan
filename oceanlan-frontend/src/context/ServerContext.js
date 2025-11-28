// src/context/ServerContext.js
import React, { createContext, useReducer, useContext, useCallback, useEffect } from 'react';
import axiosInstance from '../utils/axiosInstance';
import { AuthContext } from './AuthContext';
import { useSocket } from '../hooks/useSocket';

// Backend API rotası
const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_URL = `${API_URL_BASE}/api/v1/servers`;

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
        activeServer: action.payload,
        activeChannel: action.payload.channels[0]?._id // Kanal varsa ID'sini al
      };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'RESET_SERVER_STATE':
      return initialState;

    // 📢 KRİTİK GÜNCELLEME: Üye çevrimiçi durumunu anlık güncelleme
    case 'UPDATE_MEMBER_PRESENCE':
      if (!state.activeServer || !state.activeServer.members) return state;

      const updatedMembers = state.activeServer.members.map(member => {
        // Güvenli ID kontrolü: Populate edilmemişse veya ObjectId ise string'e çevir
        const memberUserId = member.user?._id || member.user;

        if (memberUserId && memberUserId.toString() === action.payload.userId.toString()) {
          // Eğer ID'ler eşleşiyorsa, status ve lastSeenAt bilgilerini güncelle
          return {
            ...member,
            user: {
              ...member.user, // Mevcut kullanıcı verilerini koru (username, avatar vb.)
              onlineStatus: action.payload.status,
              lastSeenAt: action.payload.lastSeenAt
            }
          };
        }
        return member;
      });

      return {
        ...state,
        activeServer: {
          ...state.activeServer,
          members: updatedMembers
        }
      };

    default:
      return state;
  }
};

export const ServerContext = createContext(initialState);

export const ServerProvider = ({ children }) => {
  const [state, dispatch] = useReducer(ServerReducer, initialState);
  const { token, isAuthenticated, logout } = useContext(AuthContext);

  // 📢 Socket kancasını çağırıyoruz
  const { socket } = useSocket();

  const fetchServerDetails = useCallback(async (serverId) => {
    if (!token) {
      console.warn("fetchServerDetails çağrıldı ancak token yok.");
      return;
    }
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const res = await axiosInstance.get(`/servers/${serverId}`);
      dispatch({ type: 'SET_ACTIVE_SERVER', payload: res.data.data });
      dispatch({ type: 'SET_LOADING', payload: false });
      return res.data.data;
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      if (error.response && error.response.status === 401) {
        console.error('Yetkilendirme Hatası (fetchServerDetails): Oturum Sonlanıyor.');
        logout();
      } else {
        console.error('Sunucu detayları çekilemedi:', error.response?.status, error.response?.data?.message);
      }
    }
  }, [dispatch, token, logout]);

  const fetchUserServers = useCallback(async () => {
    if (!token) {
      console.warn("fetchUserServers çağrıldı ancak token yok.");
      return;
    }
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const res = await axiosInstance.get('/servers/');
      dispatch({ type: 'SET_SERVERS', payload: res.data.data });
      dispatch({ type: 'SET_LOADING', payload: false });
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      if (error.response && error.response.status === 401) {
        console.error('Yetkilendirme Hatası (fetchUserServers): Oturum Sonlanıyor.');
        logout();
      } else {
        console.error('Sunucu listesi çekilemedi:', error.response?.status, error.response?.data?.message);
      }
    }
  }, [token, dispatch, logout]);

  // 📢 Socket Dinleyicisi: Anlık Durum Değişiklikleri
  useEffect(() => {
    if (!socket) return;

    const handleStatusChange = (data) => {
      // data: { userId, status, lastSeenAt }
      dispatch({ type: 'UPDATE_MEMBER_PRESENCE', payload: data });
    };

    socket.on('userStatusChanged', handleStatusChange);

    return () => {
      socket.off('userStatusChanged', handleStatusChange);
    };
  }, [socket]);

  // Giriş yapıldığında sunucuları çek
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchUserServers();
    } else {
      dispatch({ type: 'RESET_SERVER_STATE' });
    }
  }, [isAuthenticated, token, fetchUserServers]);

  const createNewServer = useCallback(async (serverData) => {
    if (!token) throw new Error('Oturum sonlandı.');
    try {
      const isFormData = serverData instanceof FormData;
      const payload = typeof serverData === 'string' ? { name: serverData } : serverData;

      const config = {};
      if (isFormData) {
          config.headers = { "Content-Type": "multipart/form-data" };
      }

      // 1. Sunucuyu oluştur
      const res = await axiosInstance.post('/servers', payload, config);
      const newServerRaw = res.data.data;

      // 2. 🛠️ BUG DÜZELTME: Oluşan sunucuyu listeye ekle
      dispatch({ type: 'ADD_SERVER', payload: newServerRaw });

      // 3. 🛠️ BUG DÜZELTME: Sunucu detaylarını TAZE olarak çek ve Active yap
      // Bu işlem, permissionChecker'ın ihtiyaç duyduğu tüm populate edilmiş verileri garanti eder.
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