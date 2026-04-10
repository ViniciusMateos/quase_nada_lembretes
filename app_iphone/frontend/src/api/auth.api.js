/**
 * Endpoints públicos de autenticação.
 * Não usam o interceptor de token (são chamadas abertas).
 */

import apiClient from './client';

/**
 * Cadastra novo usuário.
 * @param {{ name: string, email: string, password: string }} data
 * @returns {Promise<{ access_token: string, token_type: string, expires_in: number, user: object }>}
 */
export async function register({ name, email, password }) {
  const response = await apiClient.post('/api/v1/auth/register', {
    name,
    email,
    password,
  });
  return response.data;
}

/**
 * Autentica usuário existente.
 * @param {{ email: string, password: string }} data
 * @returns {Promise<{ access_token: string, token_type: string, expires_in: number, user: object }>}
 */
export async function login({ email, password }) {
  const response = await apiClient.post('/api/v1/auth/login', {
    email,
    password,
  });
  return response.data;
}
