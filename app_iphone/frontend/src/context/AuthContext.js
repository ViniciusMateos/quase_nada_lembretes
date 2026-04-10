/**
 * Contexto global de autenticação.
 * Persiste token e dados do usuário via MMKV.
 * Expõe hook useAuth() para todos os componentes.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { MMKV } from 'react-native-mmkv';

// Instância de storage persistente (importada também pelo client.js)
export const storage = new MMKV();

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  // isLoading = true enquanto verifica token salvo no storage
  const [isLoading, setIsLoading] = useState(true);

  // Ao montar: verifica se existe sessão salva
  useEffect(() => {
    try {
      const savedToken = storage.getString('auth_token');
      const savedUserRaw = storage.getString('auth_user');

      if (savedToken && savedUserRaw) {
        setToken(savedToken);
        setUser(JSON.parse(savedUserRaw));
      }
    } catch (error) {
      // Token corrompido — ignora e segue não autenticado
      storage.delete('auth_token');
      storage.delete('auth_user');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Persiste sessão após login ou cadastro.
   * @param {string} newToken
   * @param {object} newUser
   */
  const login = (newToken, newUser) => {
    storage.set('auth_token', newToken);
    storage.set('auth_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  /**
   * Limpa sessão e remove dados persistidos.
   */
  const logout = () => {
    storage.delete('auth_token');
    storage.delete('auth_user');
    setToken(null);
    setUser(null);
  };

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
