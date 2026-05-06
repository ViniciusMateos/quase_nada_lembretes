/**
 * Contexto global de autenticação.
 * Persiste token e dados do usuário via MMKV.
 * Expõe hook useAuth() para todos os componentes.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { MMKV } from 'react-native-mmkv';
import { registerLogout, registerUpdateTokens } from '../api/client';

// Instância de storage persistente (importada também pelo client.js)
export const storage = new MMKV();

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const savedToken = storage.getString('auth_token');
      const savedUserRaw = storage.getString('auth_user');

      if (savedToken && savedUserRaw) {
        setToken(savedToken);
        setUser(JSON.parse(savedUserRaw));
      }
    } catch {
      storage.delete('auth_token');
      storage.delete('auth_user');
      storage.delete('refresh_token');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = (newToken, newUser, newRefreshToken) => {
    storage.set('auth_token', newToken);
    storage.set('auth_user', JSON.stringify(newUser));
    if (newRefreshToken) storage.set('refresh_token', newRefreshToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    storage.delete('auth_token');
    storage.delete('auth_user');
    storage.delete('refresh_token');
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    registerLogout(logout);
    registerUpdateTokens((newAccessToken, newRefreshToken) => {
      storage.set('auth_token', newAccessToken);
      storage.set('refresh_token', newRefreshToken);
      setToken(newAccessToken);
    });
  }, []);

  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isLoading,
        isAuthenticated,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook para consumir contexto de autenticação.
 * Lança erro se usado fora do AuthProvider.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
}
