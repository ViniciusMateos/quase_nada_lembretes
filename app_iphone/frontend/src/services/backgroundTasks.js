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
import { scheduleFromSync } from './notifications';
import { syncReminders } from '../api/reminders.api';

export const BACKGROUND_QUEUE_TASK = 'background-message-queue';

// Re-sincroniza as notificações em segundo plano. É isto que CANCELA os
// "fantasmas": notificações de lembretes que foram desativados/deletados mas
// cujo agendamento no iOS sobrevive na fila até um sync rodar. Sem abrir o app,
// só o background consegue limpar. Best-effort — o iOS decide quando roda e
// nunca roda com o app forçadamente encerrado; cobertura total exigiria push.
async function resyncEmBackground() {
  try {
    const syncData = await syncReminders();
    await scheduleFromSync(syncData); // cancela os pendentes e reagenda só os ativos
    return true;
  } catch {
    return false; // deslogado/offline: o próximo foreground resolve
  }
}

TaskManager.defineTask(BACKGROUND_QUEUE_TASK, async () => {
  try {
    // Só drena a fila (garante que a mensagem chegue no servidor). NÃO dispara
    // notificação local aqui: quem avisa "lembrete criado" de fora é o PUSH do
    // backend. Disparar também aqui causava notificação DOBRADA e em idioma
    // errado (o push com o título, a local traduzida à parte).
    const sent = await drainQueue();
    const resynced = await resyncEmBackground();
    return sent > 0 || resynced
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
