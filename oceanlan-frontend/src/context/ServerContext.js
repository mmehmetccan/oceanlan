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

    // 🛠️ DÜZELTME BURADA: İsim "UPDATE_MEMBER_PRESENCE" olarak değiştirildi
    // (Aşağıdaki dispatch ile aynı olması şart!)
    case 'UPDATE_MEMBER_PRESENCE':
        if (!state.activeServer || !state.activeServer.members) return state;

        const updatedMembers = state.activeServer.members.map(member => {
            const mUserId = member.user?._id || member.user;

            // Gelen userId ile eşleşiyorsa güncelle
            if (String(mUserId) === String(action.payload.userId)) {

                // Eski user objesini koru, sadece status'u değiştir
                const oldUserObj = typeof member.user === 'object' ? member.user : { _id: mUserId };

                return {
                    ...member,
                    user: {
                        ...oldUserObj, // Eski verileri (isim, avatar) koru
                        onlineStatus: action.payload.status, // Yeni durumu yaz
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

  // 🟢 SOCKET DINLEYICISI
  useEffect(() => {
      if (!socket) return;

      const handleStatusChange = ({ userId, status, lastSeenAt }) => {
          // Socket'ten gelen veriyi Reducer'a gönderiyoruz
          // İsim burada "UPDATE_MEMBER_PRESENCE" olduğu için yukarıda da öyle olmalı!
          dispatch({
              type: 'UPDATE_MEMBER_PRESENCE',
              payload: { userId, status, lastSeenAt }
          });
      };

      socket.on('userStatusChanged', handleStatusChange);

      return () => {
          socket.off('userStatusChanged', handleStatusChange);
      };
  }, [socket]);

  useEffect(() => {
    if (isAuthenticated && token) fetchUserServers();
    else dispatch({ type: 'RESET_SERVER_STATE' });
  }, [isAuthenticated, token, fetchUserServers]);

  const createNewServer = useCallback(async (serverName, file = null) => {
    if (!token) throw new Error('Oturum sonlandı.');
    try {
      const res = await axiosInstance.post('/servers', { name: serverName });
      let newServer = res.data.data;
      if (file) {
          try {
              const formData = new FormData();
              formData.append('icon', file);
              const iconRes = await axiosInstance.put(`/servers/${newServer._id}/icon`, formData, { headers: { "Content-Type": "multipart/form-data" } });
              if (iconRes.data.data) newServer = iconRes.data.data;
          } catch (uploadErr) { console.error("Resim yüklenemedi:", uploadErr); }
      }
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