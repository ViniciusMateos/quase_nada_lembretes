/**
 * Serviço de notificações locais iOS via Notifee.
 * Notificações agendadas no device — sem dependência de servidor.
 */

import notifee, { TriggerType, AndroidImportance } from '@notifee/react-native';

const CHANNEL_ID = 'quase-nada-lembretes';

/**
 * Cria canal de notificação (necessário para Android, inócuo no iOS).
 */
async function ensureChannel() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Lembretes',
    importance: AndroidImportance.HIGH,
    sound: 'default',
  });
}

/**
 * Solicita permissão de notificação ao usuário (iOS).
 * @returns {Promise<boolean>} true se autorizado
 */
export async function requestPermission() {
  try {
    const settings = await notifee.requestPermission();
    // authorizationStatus: 1 = autorizado, 2 = provisional
    return settings.authorizationStatus >= 1;
  } catch {
    return false;
  }
}

/**
 * Verifica se permissão já foi concedida (sem prompt).
 * @returns {Promise<boolean>}
 */
export async function checkPermission() {
  try {
    const settings = await notifee.getNotificationSettings();
    return settings.authorizationStatus >= 1;
  } catch {
    return false;
  }
}

/**
 * Cancela TODAS as notificações locais (exibidas + agendadas).
 */
export async function cancelAllNotifications() {
  try {
    await notifee.cancelAllTriggerNotifications();
    await notifee.cancelAllNotifications();
  } catch (error) {
    console.warn('[Notifications] Erro ao cancelar notificações:', error);
  }
}

/**
 * Sincroniza notificações locais com dados da API.
 * 1. Cancela todas as notificações existentes.
 * 2. Para cada lembrete ativo, cria trigger para cada execução futura.
 *
 * @param {{
 *   synced_at: string,
 *   reminders: Array<{
 *     id: string,
 *     title: string,
 *     is_active: boolean,
 *     scheduled_executions: string[]
 *   }>
 * }} syncData
 */
export async function scheduleFromSync(syncData) {
  try {
    await ensureChannel();

    // Limpa todas as notificações antigas antes de reagendar
    await cancelAllNotifications();

    if (!syncData?.reminders?.length) {
      return;
    }

    const now = Date.now();

    for (const reminder of syncData.reminders) {
      if (!reminder.is_active) continue;
      if (!reminder.scheduled_executions?.length) continue;

      for (const executionISO of reminder.scheduled_executions) {
        const triggerTimestamp = new Date(executionISO).getTime();

        // Ignora execuções no passado
        if (triggerTimestamp <= now) continue;

        const trigger = {
          type: TriggerType.TIMESTAMP,
          timestamp: triggerTimestamp,
        };

        await notifee.createTriggerNotification(
          {
            id: `${reminder.id}_${triggerTimestamp}`,
            title: 'Quase Nada Lembretes',
            body: reminder.title,
            android: {
              channelId: CHANNEL_ID,
              pressAction: { id: 'default' },
            },
            ios: {
              sound: 'default',
            },
          },
          trigger,
        );
      }
    }
  } catch (error) {
    console.warn('[Notifications] Erro ao sincronizar notificações:', error);
  }
}
