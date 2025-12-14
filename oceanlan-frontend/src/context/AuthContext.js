// src/context/AuthContext.js
import React, { createContext, useReducer, useEffect } from 'react';
import axiosInstance from '../utils/axiosInstance';

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_URL = `${API_URL_BASE}/api/v1/auth`;

const getSafeUserFromStorage = () => {
  const userString = localStorage.getItem('user');
  if (!userString || userString === "undefined") return null;
  try { return JSON.parse(userString); } catch (error) { return null; }
};

const initialState = {
  user: getSafeUserFromStorage(),
  token: localStorage.getItem('token') || null,
  isAuthenticated: !!localStorage.getItem('token'),
  loading: false,
  unreadDmConversations: [],
};

const AuthReducer = (state, action) => {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
    case 'REGISTER_SUCCESS':
      localStorage.setItem('token', action.payload.token);
      localStorage.setItem('user', JSON.stringify(action.payload.user));
      return { ...state, user: action.payload.user, token: action.payload.token, isAuthenticated: true, loading: false };

    case 'LOGOUT':
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      return { ...state, user: null, token: null, isAuthenticated: false };

    case 'NEW_UNREAD_DM':
      const { conversationId } = action.payload;
      if (!state.unreadDmConversations.includes(conversationId)) return { ...state, unreadDmConversations: [...state.unreadDmConversations, conversationId] };
      return state;

    case 'MARK_DM_AS_READ':
      return { ...state, unreadDmConversations: state.unreadDmConversations.filter(id => id !== action.payload.readConversationId) };

    case 'SET_LOADING': return { ...state, loading: action.payload };
    default: return state;
  }
};

export const AuthContext = createContext(initialState);

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(AuthReducer, initialState);

  // 🟢 1. AXIOS LOGOUT OLAYINI DİNLE
  useEffect(() => {
    const handleForceLogout = () => dispatch({ type: 'LOGOUT' });
    window.addEventListener('auth:logout', handleForceLogout);
    return () => window.removeEventListener('auth:logout', handleForceLogout);
  }, []);

  const login = async (email, password) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const res = await axiosInstance.post(`/auth/login`, { email, password });
      dispatch({ type: 'LOGIN_SUCCESS', payload: { token: res.data.token, user: res.data.user } });
      return true;
    } catch (err) {
      dispatch({ type: 'SET_LOADING', payload: false });
      throw new Error(err.response?.data?.message || 'Giriş başarısız');
    }
  };

  const register = async (username, email, password, firstName, lastName, phoneNumber) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const res = await axiosInstance.post(`/auth/register`, { username, email, password, firstName, lastName, phoneNumber });
      dispatch({ type: 'REGISTER_SUCCESS', payload: { token: res.data.token, user: res.data.user } });
      return true;
    } catch (err) {
      dispatch({ type: 'SET_LOADING', payload: false });
      throw new Error(err.response?.data?.message || 'Kayıt başarısız');
    }
  };

  const logout = () => dispatch({ type: 'LOGOUT' });

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, dispatch }}>
      {children}
    </AuthContext.Provider>
  );
};