
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333',
  headers: {
    'Content-Type': 'application/json',
  },
});

const safeLocalStorage = {
  getItem(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
    }
  },
  removeItem(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
    }
  },
};

// Intercept requests to add token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = safeLocalStorage.getItem('token');
    if (token) {
      config.headers = config.headers ?? {};
      (config.headers as any).Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Intercept responses to handle errors (e.g. 401)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token and redirect to login if unauthorized
      if (typeof window !== 'undefined') {
        safeLocalStorage.removeItem('token');
        window.location.href = '/login';
      }
    }
    if (error.response?.status === 402) {
      if (typeof window !== 'undefined') {
        const message = error.response?.data?.message;
        if (typeof message === 'string' && message.length > 0) {
          safeLocalStorage.setItem('auth_error', message);
        }
        safeLocalStorage.removeItem('token');
        safeLocalStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
