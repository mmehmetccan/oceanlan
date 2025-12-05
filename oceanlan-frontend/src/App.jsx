// src/App.jsx
import React, { useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// --- CONTEXT IMPORTS ---
import { AuthProvider, AuthContext } from './context/AuthContext';
import { ServerProvider } from './context/ServerContext';
import { ToastProvider } from './context/ToastContext';
import { VoiceProvider } from './context/VoiceContext';
import { AudioSettingsProvider } from './context/AudioSettingsContext';

// --- PAGE IMPORTS ---
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import VerifyChangeEmailPage from './pages/VerifyEmailPage'; // İsimlendirme tutarlılığı için

// --- COMPONENT IMPORTS ---
import ToastContainer from './components/common/ToastContainer';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useContext(AuthContext);
  if (loading) return <div>Yükleniyor...</div>;
  return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
  return (
    // 1. EN TEPEYE AUTH KOYUYORUZ (Kullanıcı verisi her şeye lazım)
    <AuthProvider>
      {/* 2. TOAST KOYUYORUZ (Hata mesajları için) */}
      <ToastProvider>
        <ToastContainer />

        {/* 3. AUDIO AYARLARI */}
        <AudioSettingsProvider>

            {/* 4. VOICE PROVIDER (Artık User verisine erişebilir!) */}
            <VoiceProvider>

                {/* 5. SERVER PROVIDER */}
                <ServerProvider>
                    <Routes>
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/register" element={<RegisterPage />} />
                        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                        <Route path="/resetpassword/:resetToken" element={<ResetPasswordPage />} />
                        <Route path="/verify-email" element={<VerifyEmailPage />} />
                        {/* Eğer verify-change-email aynı sayfaysa: */}
                        <Route path="/verify-change-email/:token" element={<VerifyEmailPage />} />

                        <Route
                        path="/dashboard/*"
                        element={
                            <ProtectedRoute>
                            <DashboardPage />
                            </ProtectedRoute>
                        }
                        />

                        <Route path="*" element={<Navigate to="/dashboard" />} />
                    </Routes>
                </ServerProvider>

            </VoiceProvider>
        </AudioSettingsProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;