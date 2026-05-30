/**
 * Endpoints de gerenciamento de lembretes.
 * Requer autenticação (token injetado pelo interceptor do client).
 */

import apiClient from './client';

/**
 * Lista todos os lembretes do usuário.
 * @returns {Promise<{ reminders: Array<object>, total: number }>}
 */
export async function listReminders() {
  // limit alto p/ trazer TODOS os lembretes ativos — mantém a aba consistente
  // com o /sync (que agenda todos), evitando "dispara mas não aparece na lista".
  const response = await apiClient.get('/api/v1/reminders', {
    params: { active_only: true, limit: 500, offset: 0 },
  });
  return response.data;
}

/**
 * Cria um lembrete diretamente (usado pelo "adiar" de lembretes pontuais).
 * @param {{ title: string, scheduled_time: string, recurrence?: string }} data
 * @returns {Promise<object>} lembrete criado
 */
export async function createReminder(data) {
  const response = await apiClient.post('/api/v1/reminders', data);
  return response.data;
}

/**
 * Deleta um lembrete pelo ID.
 * @param {string} id
 * @returns {Promise<{ id: string, title: string, deleted: boolean }>}
 */
export async function deleteReminder(id) {
  const response = await apiClient.delete(`/api/v1/reminders/${id}`);
  return response.data;
}

/**
 * Atualiza título e/ou horário de um lembrete.
 * @param {string} id
 * @param {{ title?: string, scheduled_time?: string }} data
 * @returns {Promise<object>}
 */
export async function updateReminder(id, data) {
  const response = await apiClient.patch(`/api/v1/reminders/${id}`, data);
  return response.data;
}

/**
 * Sincroniza lembretes com execuções agendadas para notificações locais.
 * @returns {Promise<{
 *   synced_at: string,
 *   reminders: Array<{
 *     id: string,
 *     title: string,
 *     recurrence_str: string,
 *     is_active: boolean,
 *     scheduled_executions: string[]
 *   }>
 * }>}
 */
export async function syncReminders() {
  const response = await apiClient.get('/api/v1/reminders/sync');
  return response.data;
}
