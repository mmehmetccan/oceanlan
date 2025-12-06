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

    // 👇 ONLINE DURUMU GÜNCELLEME (BU EKSİKTİ)
    case 'UPDATE_MEMBER_STATUS':
        if (!state.activeServer || !state.activeServer.members) return state;

        const updatedMembers = state.activeServer.members.map(member => {
            // Member objesinin içindeki user._id ile gelen userId eşleşiyor mu?
            const mUserId = member.user?._id || member.user;
            if (String(mUserId) === String(action.payload.userId)) {
                return {
                    ...member,
                    user: {
                        ...member.user,
                        onlineStatus: action.payload.status, // 'online' veya 'offline'
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

  // 👇 SOCKET DINLEYICISI (ONLINE/OFFLINE İÇİN)
  useEffect(() => {
      if (!socket) return;

      const handleStatusChange = ({ userId, status, lastSeenAt }) => {
          dispatch({
              type: 'UPDATE_MEMBER_STATUS',
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

  const createNewServer = useCallback(async (serverData) => { /* ... Eski kodun aynısı ... */ }, [token, fetchServerDetails]);
  const setActiveChannel = useCallback((channel) => { dispatch({ type: 'SELECT_CHANNEL', payload: channel }); }, []);

  return (
    <ServerContext.Provider value={{ ...state, dispatch, fetchServerDetails, createNewServer, fetchUserServers, setActiveChannel }}>
      {children}
    </ServerContext.Provider>
  );
};