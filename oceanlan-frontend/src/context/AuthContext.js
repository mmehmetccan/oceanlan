// src/context/AuthContext.js
import React, { createContext, useReducer, useEffect } from 'react';
import axios from 'axios';

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_URL = `${API_URL_BASE}/api/v1/auth`;

// 30 Günlük süre (Milisaniye)
const REMEMBER_DURATION = 30 * 24 * 60 * 60 * 1000;

// --- GÜVENLİ VERİ OKUMA HELPER ---
const getSafeUserFromStorage = () => {
  const userString = localStorage.getItem('user') || sessionStorage.getItem('user');
  if (!userString || userString === "undefined") return null;

  // Süre Kontrolü (Beni Hatırla için)
  const loginTime = localStorage.getItem('loginTime');
  if (loginTime) {
      const now = new Date().getTime();
      if (now - parseInt(loginTime) > REMEMBER_DURATION) {
          console.log("[Auth] Oturum süresi doldu, temizleniyor.");
          localStorage.clear();
          return null;
      }
  }

  try {
    return JSON.parse(userString);
  } catch (error) {
    console.error("[Auth] User parse hatası:", error);
    return null;
  }
};

const initialState = {
  user: getSafeUserFromStorage(),
  token: (() => {
      const loginTime = localStorage.getItem('loginTime');
      if (loginTime && (new Date().getTime() - parseInt(loginTime) > REMEMBER_DURATION)) {
          return null;
      }
      return localStorage.getItem('token') || sessionStorage.getItem('token') || null;
  })(),
  isAuthenticated: false,
  loading: true, // Başlangıçta Yükleniyor...
  unreadDmConversations: [],
};

// State'i tutarlı hale getir
initialState.isAuthenticated = !!initialState.token;

const AuthReducer = (state, action) => {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
    case 'REGISTER_SUCCESS':
      const { token, user, rememberMe } = action.payload;

      if (rememberMe) {
          localStorage.setItem('token', token);
          localStorage.setItem('user', JSON.stringify(user));
          localStorage.setItem('loginTime', new Date().getTime().toString());
          sessionStorage.removeItem('token'); sessionStorage.removeItem('user');
      } else {
          sessionStorage.setItem('token', token);
          sessionStorage.setItem('user', JSON.stringify(user));
          localStorage.removeItem('token'); localStorage.removeItem('user'); localStorage.removeItem('loginTime');
      }

      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      return { ...state, user, user, token, isAuthenticated: true, loading: false };

    case 'LOGOUT':
      localStorage.clear();
      sessionStorage.clear();
      delete axios.defaults.headers.common['Authorization'];
      return { ...state, user: null, token: null, isAuthenticated: false, loading: false };

    case 'NEW_UNREAD_DM':
      const { conversationId } = action.payload;
      if (!state.unreadDmConversations.includes(conversationId)) {
        return { ...state, unreadDmConversations: [...state.unreadDmConversations, conversationId] };
      }
      return state;

    case 'MARK_DM_AS_READ':
      const { readConversationId } = action.payload;
      return { ...state, unreadDmConversations: state.unreadDmConversations.filter(id => id !== readConversationId) };

    case 'SET_LOADING':
      return { ...state, loading: action.payload };

    // 💡 KRİTİK: Yüklemeyi bitiren kod
    case 'INIT_CHECK_COMPLETED':
       return { ...state, loading: false };

    default:
      return state;
  }
};

export const AuthContext = createContext(initialState);

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(AuthReducer, initialState);
  const { token } = state;

  // 🟢 DÜZELTİLEN KISIM: Sadece 1 kere çalışır ve yüklemeyi kapatır
  useEffect(() => {
    const initAuth = async () => {
        console.log("[Auth] Başlatılıyor...");

        // Token varsa axios'a ekle
        if (token) {
           console.log("[Auth] Token bulundu, oturum açılıyor.");
           axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        } else {
           console.log("[Auth] Token yok, giriş ekranına yönlendirilecek.");
           delete axios.defaults.headers.common['Authorization'];
        }

        // React'ın render döngüsüne nefes aldırıp loading'i kapatıyoruz
        setTimeout(() => {
            console.log("[Auth] Yükleme tamamlandı (INIT_CHECK_COMPLETED).");
            dispatch({ type: 'INIT_CHECK_COMPLETED' });
        }, 500); // 500ms bekletelim ki logo görünsün
    };

    initAuth();
  }, []); // 👈 DİKKAT: Burası boş dizi [] olmalı.

  // Token değiştiğinde Axios header'ı güncelle (Login/Logout durumları için)
  useEffect(() => {
      if (token) {
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
  }, [token]);

  const login = async (email, password, rememberMe = false) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const res = await axios.post(`${API_URL}/login`, { email, password });
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { token: res.data.token, user: res.data.user, rememberMe },
      });
      return true;
    } catch (err) {
      dispatch({ type: 'SET_LOADING', payload: false });
      throw new Error(err.response?.data?.message || 'Giriş başarısız');
    }
  };

  const register = async (username, email, password, firstName, lastName, phoneNumber) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const res = await axios.post(`${API_URL}/register`, { username, email, password, firstName, lastName, phoneNumber });
      dispatch({ type: 'REGISTER_SUCCESS', payload: { token: res.data.token, user: res.data.user, rememberMe: false } });
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