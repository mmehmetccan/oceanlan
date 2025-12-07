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
    case 'UPDATE_MEMBER_PRESENCE':
      if (!state.activeServer || !state.activeServer.members) return state;
      const updatedMembers = state.activeServer.members.map(member => {
        const mUserId = member.user?._id || member.user;
        if (String(mUserId) === String(action.payload.userId)) {
          return {
            ...member,
            user: { ...member.user, onlineStatus: action.payload.status, lastSeenAt: action.payload.lastSeenAt }
          };
        }
        return member;
      });
      return { ...state, activeServer: { ...state.activeServer, members: updatedMembers } };
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
    } catch (error) { console.error(error); }
  }, [token]);

  // Presence Dinleyicisi
  useEffect(() => {
      if (!socket) return;
      const handleStatusChange = (data) => dispatch({ type: 'UPDATE_MEMBER_PRESENCE', payload: data });
      socket.on('userStatusChanged', handleStatusChange);
      return () => socket.off('userStatusChanged', handleStatusChange);
  }, [socket]);

  useEffect(() => {
    if (isAuthenticated && token) fetchUserServers();
    else dispatch({ type: 'RESET_SERVER_STATE' });
  }, [isAuthenticated, token, fetchUserServers]);

  // 📢 DÜZELTİLEN FONKSİYON: createNewServer
  // Artık (name, file) alıyor. Önce oluşturuyor, sonra resim yüklüyor.
  const createNewServer = useCallback(async (serverName, file = null) => {
    if (!token) throw new Error('Oturum sonlandı.');

    // Yükleme ekranını açmıyoruz ki modal kapanıp kullanıcı arkaplanda görsün
    // Veya istersen dispatch({ type: 'SET_LOADING', payload: true }); yapabilirsin

    try {
      // 1. Sunucuyu oluştur (Sadece JSON) - Bu adım Web'de de Electron'da da sorunsuz çalışır
      const res = await axiosInstance.post('/servers', { name: serverName });
      let newServer = res.data.data;

      // 2. Eğer resim seçildiyse, oluşturulan sunucuya PUT isteği at
      if (file) {
          try {
              const formData = new FormData();
              formData.append('icon', file);

              // İkon güncelleme endpointi
              const iconRes = await axiosInstance.put(`/servers/${newServer._id}/icon`, formData, {
                  headers: { "Content-Type": "multipart/form-data" }
              });

              if (iconRes.data.data) {
                  newServer = iconRes.data.data; // Güncel (resimli) veriyi al
              }
          } catch (uploadErr) {
              console.error("Sunucu oluştu ama resim yüklenemedi:", uploadErr);
              // Kritik hata değil, devam et
          }
      }

      // 3. Listeye ekle ve detayları çek
      dispatch({ type: 'ADD_SERVER', payload: newServer });
      await fetchServerDetails(newServer._id);

      return newServer;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Sunucu oluşturma başarısız');
    }
  }, [token, dispatch, fetchServerDetails]);

  const setActiveChannel = useCallback((channel) => { dispatch({ type: 'SELECT_CHANNEL', payload: channel }); }, []);

  return (
    <ServerContext.Provider value={{ ...state, dispatch, fetchServerDetails, createNewServer, fetchUserServers, setActiveChannel }}>
      {children}
    </ServerContext.Provider>
  );
};