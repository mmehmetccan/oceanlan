// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { HashRouter as Router } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ServerProvider } from './context/ServerContext';


if (typeof window !== 'undefined') {
  if (window.global === undefined) {
    window.global = window;
  }
  if (window.process === undefined) {
    window.process = { env: {} };
  }
  if (window.process.nextTick === undefined) {
    window.process.nextTick = (cb) => setTimeout(cb, 0);
  }
}
// 👆👆👆 YUKARIDAKİ KOD BLOĞUNU YAPIŞTIR 👆👆👆

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    //<React.StrictMode>
    <Router>

          <App />

    </Router>
  //</React.StrictMode>,
);