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
import { displayLocalNotification, notifyReminderAction, scheduleFromSync } from './notifications';
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
    const sent = await drainQueue(async (item, result) => {
      // Mesma notificação de "lembrete criado/atualizado/removido" que apareceria
      // dentro do app — só que disparada de fora, já que foi processado em background.
      const tipo = result?.action?.type;
      const notificou = await notifyReminderAction(tipo, result?.action);
      // Se não foi uma ação de lembrete (ex.: resposta comum da IA), avisa genérico.
      if (!notificou) {
        const body = result?.response ? String(result.response).split('\n')[0] : 'Lembrete registrado';
        await displayLocalNotification('Lembrete registrado', body);
      }
    });
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
