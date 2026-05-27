/**
 * Tarefa de segundo plano: drena a fila offline de mensagens e notifica o
 * resultado localmente (ex.: "Lembrete registrado") quando processado fora do app.
 *
 * A definição (defineTask) roda no nível do módulo — este arquivo é importado
 * em index.js para registrar a task cedo, antes do app montar.
 *
 * Limitação iOS: o sistema decide quando rodar (mínimo ~15 min) e nunca roda com
 * o app totalmente encerrado pelo usuário. Cobertura total exigiria push.
 */
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { drainQueue } from './messageQueue';
import { displayLocalNotification } from './notifications';

export const BACKGROUND_QUEUE_TASK = 'background-message-queue';

TaskManager.defineTask(BACKGROUND_QUEUE_TASK, async () => {
  try {
    const sent = await drainQueue(async (item, result) => {
      const body = result?.response
        ? String(result.response).split('\n')[0]
        : 'Lembrete registrado';
      await displayLocalNotification('Lembrete registrado', body);
    });
    return sent > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundQueueTask() {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
        status === BackgroundFetch.BackgroundFetchStatus.Denied) {
      return;
    }
    await BackgroundFetch.registerTaskAsync(BACKGROUND_QUEUE_TASK, {
      minimumInterval: 15 * 60, // segundos (mínimo prático no iOS)
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch (e) {
    console.warn('[bg] Erro ao registrar task de fila:', e);
  }
}
