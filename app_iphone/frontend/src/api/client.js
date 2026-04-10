/**
 * Cliente HTTP centralizado.
 * Todas as chamadas de API passam por aqui.
 * Token JWT injetado via interceptor de request.
 * 401 → limpa sessão e redireciona para Login.
 */

import axios from 'axios';
import { storage } from '../context/AuthContext';

// Reference de navegação global para redirecionar sem hook
export const navigationRef = { current: null };

const apiClient = axios.create({
  baseURL: process.env.API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Interceptor de REQUEST — injeta token JWT
apiClient.interceptors.request.use(
  config => {
    const token = storage.getString('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error),
);

// Interceptor de RESPONSE — trata 401 globalmente
apiClient.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      // Limpa token salvo
      storage.delete('auth_token');
      storage.delete('auth_user');

      // Redireciona para Login via navigation ref global
      if (navigationRef.current) {
        navigationRef.current.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
