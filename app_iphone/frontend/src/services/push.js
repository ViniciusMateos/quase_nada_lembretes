// Registro do token de push (Expo) no backend. É o que permite o backend
// notificar "lembrete criado" com o app FECHADO/em background — o cliente não
// consegue (o iOS suspende o JS ao sair do app).
//
// IMPORTANTE: só funciona num build que tenha a entitlement `aps-environment`
// (app.config.js) — ou seja, a partir do próximo `eas build`. No build atual
// (sem a entitlement) `getExpoPushTokenAsync` falha e a função vira no-op, sem
// quebrar nada.
import * as Notifications from 'expo-notifications';
import apiClient from '../api/client';

// EAS projectId (mesmo do app.config.js extra.eas.projectId) — identificador
// público, necessário pro getExpoPushTokenAsync. Hardcode pra não depender do
// expo-constants (que não é dependência direta).
const EAS_PROJECT_ID = '1f724db0-72ef-4a9a-9ca4-6026fec5a1a1';

let jaRegistrou = false;

export async function registerPushToken() {
  if (jaRegistrou) return;
  try {
    // Permissão: o app já pede pra notificação local; aqui só confere/garante.
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    });
    if (!token) return;

    await apiClient.post('/api/v1/push/register', { token, platform: 'ios' });
    jaRegistrou = true;
  } catch (e) {
    // Build sem push (aps-environment), permissão negada, offline → ignora.
    // Reabre a chance na próxima vez (jaRegistrou continua false).
  }
}
