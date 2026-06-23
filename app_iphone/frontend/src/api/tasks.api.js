/**
 * Endpoints de gerenciamento de tarefas.
 * Requer autenticação (token injetado pelo interceptor do client).
 * As tarefas são por usuário (escopadas pelo JWT no backend).
 */

import apiClient from './client';

/**
 * Lista as tarefas visíveis numa semana (inclui carry-over de pendentes).
 * @param {string} weekKey chave ISO da semana, ex: "2026-W25"
 * @returns {Promise<{ tasks: Array<object> }>}
 */
export async function listTasks(weekKey) {
  const response = await apiClient.get('/api/v1/tasks', {
    params: { week: weekKey },
  });
  return response.data;
}

/**
 * Cria uma tarefa.
 * @param {{ name: string, priority?: string, notes?: string, week_key: string }} data
 * @returns {Promise<object>} tarefa criada
 */
export async function createTask(data) {
  const response = await apiClient.post('/api/v1/tasks', data);
  return response.data;
}

/**
 * Atualiza uma tarefa (nome/prioridade/anotações/concluída).
 * Ao concluir, envie `week_key` (semana de referência) para o carry-over.
 * @param {string} id
 * @param {{ name?: string, priority?: string, notes?: string, completed?: boolean, week_key?: string }} data
 * @returns {Promise<object>}
 */
export async function updateTask(id, data) {
  const response = await apiClient.patch(`/api/v1/tasks/${id}`, data);
  return response.data;
}

/**
 * Deleta uma tarefa pelo ID.
 * @param {string} id
 * @returns {Promise<{ id: string, deleted: boolean }>}
 */
export async function deleteTask(id) {
  const response = await apiClient.delete(`/api/v1/tasks/${id}`);
  return response.data;
}
