// src/App.jsx
import React, { useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Context Imports
import { AuthProvider, AuthContext } from './context/AuthContext';
import { ServerProvider } from './context/ServerContext';
import { ToastProvider } from './context/ToastContext';
import { VoiceProvider } from './context/VoiceContext';
import { AudioSettingsProvider } from './context/AudioSettingsContext';
import { SocketProvider } from './context/SocketContext';

// Pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import LegalPage from './pages/LegalPage';
import ToastContainer from './components/common/ToastContainer';
import UserProfilePage from './pages/UserProfilePage';
// 🟢 KORUMALI ROTA (Giriş yapmamışsa Login'e at)
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useContext(AuthContext);
  return isAuthenticated ? children : <Navigate to="/login" />;
};

// 🟢 PUBLIC ROTA (Giriş yapmışsa Login sayfasını GÖSTERME, Dashboard'a at)
const PublicRoute = ({ children }) => {
  const { isAuthenticated } = useContext(AuthContext);
  return isAuthenticated ? <Navigate to="/dashboard" /> : children;
};

// 🟢 ANA İÇERİK BİLEŞENİ (Loading kontrolü burada yapılır)
const AppContent = () => {
    const { loading } = useContext(AuthContext);

    // 1. EĞER YÜKLENİYORSA: Sadece logoyu göster (Login sayfası görünmez)
    if (loading) {
        return (
            <div style={{
                height: '100vh',
                width: '100vw',
                backgroundColor: '#2f3136',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                color: 'white'
            }}>
                {/* Buraya kendi logonun resmini koyabilirsin */}
                <div style={{textAlign: 'center'}}>
                    <h2>OceanLan</h2>
                    <p style={{fontSize: '12px', color: '#888'}}>Başlatılıyor...</p>
                </div>
            </div>
        );
    }

    // 2. YÜKLEME BİTTİ: Rotaları Göster
    return (
        <Routes>
            <Route path="/login" element={
                <PublicRoute><LoginPage /></PublicRoute>
            } />
            <Route path="/register" element={
                <PublicRoute><RegisterPage /></PublicRoute>
            } />
            <Route path="/dashboard/settings" element={<UserProfilePage />} />

            <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/verify-change-email/:token" element={<VerifyEmailPage />} />
            <Route path="/legal/:type" element={<LegalPage />} />
            <Route path="/dashboard/*" element={
                <ProtectedRoute><DashboardPage /></ProtectedRoute>
            } />

            {/* Varsayılan yönlendirme: Girişliyse Dash, değilse Login */}
            <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
    );
};

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ToastContainer />
        <AudioSettingsProvider>
          <SocketProvider>
            <ServerProvider>
              <VoiceProvider>

                {/* 🟢 İÇERİĞİ AYRI BİLEŞENE ALDIK */}
                <AppContent />

              </VoiceProvider>
            </ServerProvider>
          </SocketProvider>
        </AudioSettingsProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;