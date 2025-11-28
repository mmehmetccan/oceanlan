// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { HashRouter as Router } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ServerProvider } from './context/ServerContext';
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <AuthProvider>
       <ServerProvider>
          <App />
        </ServerProvider>
      </AuthProvider>
    </Router>
  </React.StrictMode>,
);