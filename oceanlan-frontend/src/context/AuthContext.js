// src/context/AuthContext.js
import React, { createContext, useReducer, useEffect } from 'react';
import axios from 'axios';


const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_URL = `${API_URL_BASE}/api/v1/auth`;

// --- GÜVENLİ VERİ OKUMA HELPER FONKSİYONU ---
const getSafeUserFromStorage = () => {
  const userString = localStorage.getItem('user');

  // Eğer değer yoksa (null) veya "undefined" stringi ise null döndür
  if (!userString || userString === "undefined") {
    return null;
  }

  try {
    // Geçerli JSON stringini ayrıştır
    return JSON.parse(userString);
  } catch (error) {
    console.error("AuthContext: Failed to parse user from localStorage", error);
    return null;
  }
};
// ---------------------------------------------

// Başlangıç durumu (initial state)
const initialState = {
  // 💡 DÜZELTME: Güvenli okuma fonksiyonunu kullan
  user: getSafeUserFromStorage(),
  token: localStorage.getItem('token') || null,
  isAuthenticated: !!localStorage.getItem('token'),
  loading: false,
  unreadDmConversations: [],
};

// Reducer fonksiyonu — state değişikliklerini yönetir
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
        loading: false,
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

    // 💡 YENİ CASE: DM okunduğunda (Siz bir konuşma odasına katıldığınızda)
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

  // Token varsa axios header'a ekle
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  // Giriş işlemi
  // src/context/AuthContext.jsx içindeki login fonksiyonu

const login = async (email, password, rememberMe = false) => {
  dispatch({ type: 'SET_LOADING', payload: true });

  try {
    const res = await axiosInstance.post('/auth/login', { email, password });

    // Token varsa kaydet
    if (res.data.token) {
        localStorage.setItem('token', res.data.token);
    }

    dispatch({
      type: 'LOGIN_SUCCESS',
      payload: { token: res.data.token, user: res.data.user },
    });

    return true; // Başarılıysa true dön

  } catch (err) {
    dispatch({ type: 'SET_LOADING', payload: false });

    // 🔴 HATA BURADAYDI:
    // Hatayı "throw" ile fırlatmazsan kod başarılı sanıp devam eder.
    // Backend'den gelen veriyi (needsVerification bilgisini) fırlatıyoruz.

    if (err.response && err.response.data) {
        throw err.response.data;
    } else {
        throw { message: 'Sunucu ile iletişim kurulamadı.' };
    }
  }
};

  // Kayıt işlemi
  const register = async (username, email, password, firstName, lastName, phoneNumber) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      // API'ye tüm verileri gönder
      const res = await axios.post(`${API_URL}/register`, {
          username,
          email,
          password,
          firstName,   // YENİ
          lastName,    // YENİ
          phoneNumber  // YENİ
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