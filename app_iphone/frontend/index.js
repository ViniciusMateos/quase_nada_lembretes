import { registerRootComponent } from 'expo';
import notifee, { EventType } from '@notifee/react-native';

import App from './App';
import { handleNotificationEvent } from './src/services/notifications';
import { openReminderEditFromNotification } from './src/utils/editReminderIntent';
// Importa para registrar a task de background (defineTask roda no nível do módulo).
import './src/services/backgroundTasks';

// Handler de eventos em segundo plano. Toque no corpo (PRESS) → abre a edição do
// lembrete; ações de "adiar" (ACTION_PRESS) → handleNotificationEvent.
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS) {
    openReminderEditFromNotification(detail.notification);
  } else {
    await handleNotificationEvent({ type, detail });
  }
});

registerRootComponent(App);
