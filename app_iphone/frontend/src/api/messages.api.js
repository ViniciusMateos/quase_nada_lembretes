/**
 * Endpoint central do app — processamento de mensagens pela IA.
 * Requer autenticação (token injetado pelo interceptor do client).
 */

import apiClient from './client';

/**
 * Envia mensagem para a IA e recebe resposta com intenção detectada.
 * @param {{ content: string, client_timestamp: string }} data — timestamp em ISO8601
 * @returns {Promise<{
 *   message_id: string,
 *   response: string,
 *   intent: string,
 *   action: { type: string, candidates?: Array<{id: string, title: string}> } | null,
 *   model_used: string
 * }>}
 */
export async function sendMessage({ content, client_timestamp }) {
  const response = await apiClient.post('/api/v1/messages', {
    content,
    client_timestamp,
  });
  return response.data;
}
