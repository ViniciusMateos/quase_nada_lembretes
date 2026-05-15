import notifee, { TriggerType, AndroidImportance } from '@notifee/react-native';

const CHANNEL_ID = 'quase-nada-lembretes';

async function ensureChannel() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Lembretes',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
    vibrationPattern: [100, 200, 100, 200],
  });
}

export async function requestPermission() {
  try {
    const settings = await notifee.requestPermission();
    return settings.authorizationStatus >= 1;
  } catch {
    return false;
  }
}

export async function checkPermission() {
  try {
    const settings = await notifee.getNotificationSettings();
    return settings.authorizationStatus >= 1;
  } catch {
    return false;
  }
}

export async function cancelAllNotifications() {
  try {
    await notifee.cancelAllTriggerNotifications();
    await notifee.cancelAllNotifications();
  } catch (error) {
    console.warn('[Notifications] Erro ao cancelar notificações:', error);
  }
}

export async function scheduleFromSync(syncData) {
  try {
    await ensureChannel();
    await cancelAllNotifications();

    if (!syncData?.reminders?.length) return;

    const now = Date.now();

    for (const reminder of syncData.reminders) {
      if (!reminder.is_active) continue;
      if (!reminder.scheduled_executions?.length) continue;

      for (const executionISO of reminder.scheduled_executions) {
        const triggerTimestamp = new Date(executionISO).getTime();
        if (triggerTimestamp <= now) continue;

        await notifee.createTriggerNotification(
          {
            id: `${reminder.id}_${triggerTimestamp}`,
            title: 'Quase Nada Lembretes',
            body: reminder.title,
            android: {
              channelId: CHANNEL_ID,
              pressAction: { id: 'default' },
              vibrationPattern: [100, 200, 100, 200],
            },
            ios: {
              sound: 'default',
              // vibração no iOS é automática com a notificação
            },
          },
          {
            type: TriggerType.TIMESTAMP,
            timestamp: triggerTimestamp,
          },
        );
      }
    }
  } catch (error) {
    console.warn('[Notifications] Erro ao sincronizar notificações:', error);
  }
}
