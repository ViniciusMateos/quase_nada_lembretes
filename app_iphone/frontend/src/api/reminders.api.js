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
  const response = await apiClient.get('/api/v1/reminders');
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
