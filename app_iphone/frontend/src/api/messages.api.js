/**
 * Endpoint central do app — processamento de mensagens pela IA.
 * Requer autenticação (token injetado pelo interceptor do client).
 */

import apiClient from './client';
import { detectIs12h } from '../utils/timeFormat';

// ID de sessão do chat — gerado UMA vez por abertura do app (enquanto este módulo
// vive na memória). Mantém o contexto da IA por sessão e zera só quando o app é
// fechado de vez (background/resume preserva).
const SESSION_ID = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

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
export async function sendMessage({ content, client_timestamp, client_message_id }) {
  const response = await apiClient.post('/api/v1/messages', {
    content,
    client_timestamp,
    hour_format: detectIs12h() ? '12h' : '24h',
    session_id: SESSION_ID,
    // Idempotência: reenvios da fila usam o MESMO id → o backend devolve o
    // resultado já processado em vez de recriar o lembrete (duplicado).
    client_message_id,
  }, { timeout: 90000 });
  return response.data;
}
