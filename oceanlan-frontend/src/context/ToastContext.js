// src/context/ToastContext.js
import React, { createContext, useReducer, useCallback } from 'react';

const ToastContext = createContext();

const initialState = {
  toasts: [],
};

let toastCount = 0;

const toastReducer = (state, action) => {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [...state.toasts, action.payload],
      };
    case 'REMOVE_TOAST':
      return {
        ...state,
        toasts: state.toasts.filter((toast) => toast.id !== action.payload),
      };
    default:
      return state;
  }
};

const ToastProvider = ({ children }) => {
  const [state, dispatch] = useReducer(toastReducer, initialState);

  const addToast = useCallback((message, type = 'info') => {
    const id = toastCount++;
    dispatch({
      type: 'ADD_TOAST',
      payload: { id, message, type },
    });

    // 3 saniye sonra tostu kaldır
    setTimeout(() => {
      dispatch({ type: 'REMOVE_TOAST', payload: id });
    }, 3000);
  }, []);

  const removeToast = (id) => {
    dispatch({ type: 'REMOVE_TOAST', payload: id });
  };

  return (
    <ToastContext.Provider value={{ ...state, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
};

export { ToastContext, ToastProvider };