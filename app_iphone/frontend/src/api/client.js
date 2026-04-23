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
// Rotas de autenticação retornam 401 por credenciais inválidas (não sessão expirada)
// e precisam que o erro chegue ao componente para exibir a mensagem de erro
apiClient.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      const requestUrl = error.config?.url || '';
      const isAuthRoute = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register');

      if (!isAuthRoute) {
        // Sessão expirada em rota protegida — limpa e redireciona
        storage.delete('auth_token');
        storage.delete('auth_user');

        if (navigationRef.current) {
          navigationRef.current.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
        }
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
