// src/App.jsx
import React, { useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// --- CONTEXT IMPORTS ---
import { AuthProvider, AuthContext } from './context/AuthContext';
import { ServerProvider } from './context/ServerContext';
import { ToastProvider } from './context/ToastContext';
import { VoiceProvider } from './context/VoiceContext';
import { AudioSettingsProvider } from './context/AudioSettingsContext'; // 👈 EKLENDİ



// --- PAGE IMPORTS ---
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import AudioSettingsPage from './pages/AudioSettingsPage'; // 👈 EKLENDİ (Rota için)

// --- COMPONENT IMPORTS ---
import ToastContainer from './components/common/ToastContainer';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useContext(AuthContext);
  if (loading) return <div>Yükleniyor...</div>;
  return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
  return (
    /* DİKKAT: Sıralama Önemli!
       AudioSettingsProvider, VoiceProvider'dan üstte olmalı ki
       Voice kanalları ses ayarlarına erişebilsin.
    */
    <AuthProvider>
      <ServerProvider>
        <AudioSettingsProvider> {/* 👈 KRİTİK EKLEME */}
          <VoiceProvider>
            <ToastProvider>
              <ToastContainer />

              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/resetpassword/:resetToken" element={<ResetPasswordPage />} />
                <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
                <Route path="/verify-change-email/:token" element={<VerifyEmailPage />} />

                {/* Dashboard ve Alt Rotaları */}
                <Route
                  path="/dashboard/*"
                  element={
                    <ProtectedRoute>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />

                {/* Ayarlar Sayfası Rotası */}
                <Route
                    path="/dashboard/settings/audio"
                    element={
                        <ProtectedRoute>
                            <AudioSettingsPage />
                        </ProtectedRoute>
                    }
                />

                <Route path="*" element={<Navigate to="/dashboard" />} />
              </Routes>

            </ToastProvider>
          </VoiceProvider>
        </AudioSettingsProvider> {/* 👈 KAPANIŞ ETİKETİ */}
      </ServerProvider>
    </AuthProvider>
  );
}

export default App;