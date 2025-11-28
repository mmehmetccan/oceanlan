// src/components/common/ToastContainer.jsx
import React, { useContext } from 'react';
import { ToastContext } from '../../context/ToastContext';
import './Toast.css'; // Birazdan oluşturacağımız CSS dosyası

const ToastContainer = () => {
  const { toasts, removeToast } = useContext(ToastContext);

  if (!toasts.length) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <span>{toast.message}</span>
          <button onClick={() => removeToast(toast.id)} className="toast-close-btn">
            &times;
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;