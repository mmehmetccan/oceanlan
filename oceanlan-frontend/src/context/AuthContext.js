// src/context/AuthContext.js
import React, { createContext, useReducer, useEffect } from 'react';
import axios from 'axios';

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_URL = `${API_URL_BASE}/api/v1/auth`;

// GÜVENLİ VERİ OKUMA HELPER FONKSİYONU
const getSafeUserFromStorage = () => {
  const userString = localStorage.getItem('user');
  if (!userString || userString === "undefined") {
    return null;
  }
  try {
    return JSON.parse(userString);
  } catch (error) {
    console.error("AuthContext: Failed to parse user from localStorage", error);
    return null;
  }
};

// Başlangıç durumu (initial state)
const initialState = {
  user: getSafeUserFromStorage(),
  token: localStorage.getItem('token') || null,
  isAuthenticated: !!localStorage.getItem('token'),
  loading: false, // ✅ Zaten false, bu iyi
  unreadDmConversations: [],
};

// Reducer fonksiyonu
const AuthReducer = (state, action) => {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
    case 'REGISTER_SUCCESS':
      localStorage.setItem('token', action.payload.token);
      localStorage.setItem('user', JSON.stringify(action.payload.user));
      axios.defaults.headers.common['Authorization'] = `Bearer ${action.payload.token}`;
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        loading: false, // ✅ Burada false
      };

    case 'LOGOUT':
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      delete axios.defaults.headers.common['Authorization'];
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        loading: false, // ✅ Logout'ta da false
      };

    case 'UPDATE_USER_STATS':
      const updatedUser = {
        ...state.user,
        xp: action.payload.xp !== undefined ? action.payload.xp : state.user?.xp,
        level: action.payload.level !== undefined ? action.payload.level : state.user?.level,
        badges: action.payload.badges ? action.payload.badges : state.user?.badges
      };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      return {
        ...state,
        user: updatedUser
      };

    case 'NEW_UNREAD_DM':
      const { conversationId } = action.payload;
      if (!state.unreadDmConversations.includes(conversationId)) {
        return {
          ...state,
          unreadDmConversations: [...state.unreadDmConversations, conversationId],
        };
      }
      return state;

    case 'MARK_DM_AS_READ':
      const { readConversationId } = action.payload;
      return {
        ...state,
        unreadDmConversations: state.unreadDmConversations.filter(id => id !== readConversationId),
      };

    case 'SET_LOADING':
      return { ...state, loading: action.payload };

    default:
      return state;
  }
};

// Context oluşturuluyor
export const AuthContext = createContext(initialState);

// Provider bileşeni
export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(AuthReducer, initialState);
  const { token } = state;

  // ✅ ÖNEMLİ: Sayfa yüklendiğinde token varsa loading'i false yap
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
    
    // ✅ Yükleme tamamlandı, loading false
    dispatch({ type: 'SET_LOADING', payload: false });
  }, [token]);

  // Giriş işlemi
  const login = async (email, password) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const res = await axios.post(`${API_URL}/login`, { email, password });
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { token: res.data.token, user: res.data.user },
      });
      return true;
    } catch (err) {
      dispatch({ type: 'SET_LOADING', payload: false });
      throw new Error(err.response?.data?.message || 'Giriş başarısız');
    }
  };

  // Kayıt işlemi
  const register = async (username, email, password, firstName, lastName, phoneNumber) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const res = await axios.post(`${API_URL}/register`, {
          username,
          email,
          password,
          firstName,
          lastName,
          phoneNumber
      });
      dispatch({
        type: 'REGISTER_SUCCESS',
        payload: { token: res.data.token, user: res.data.user },
      });
      return true;
    } catch (err) {
      dispatch({ type: 'SET_LOADING', payload: false });
      throw new Error(err.response?.data?.message || 'Kayıt başarısız');
    }
  };

  // Çıkış işlemi
  const logout = () => dispatch({ type: 'LOGOUT' });

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        dispatch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};