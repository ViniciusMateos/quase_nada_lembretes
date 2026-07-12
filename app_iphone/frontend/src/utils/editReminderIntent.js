// Sinal de "abrir a edição de um lembrete" — disparado ao TOCAR na notificação
// do lembrete. A RemindersScreen se inscreve, acha o lembrete pelo id e abre o
// modal de edição. Guarda um id pendente pra cobrir o cold start (app aberto pela
// notificação antes da tela se inscrever).
import { navigationRef } from '../api/client';

let listener = null;
let pending = null;

export function requestEditReminder(reminderId) {
  if (!reminderId) return;
  if (listener) listener(String(reminderId));
  else pending = String(reminderId);
}

export function onEditReminder(fn) {
  listener = fn;
  if (pending != null) {
    const id = pending;
    pending = null;
    fn(id);
  }
  return () => {
    if (listener === fn) listener = null;
  };
}

// Navega pra aba Lembretes e pede a edição do lembrete da notificação tocada.
// Serve pros 3 cenários (foreground, background e cold start).
export function openReminderEditFromNotification(notification) {
  const rid = notification?.data?.reminderId;
  if (!rid) return; // resumos e outros avisos não têm reminderId
  const go = () => {
    try {
      navigationRef.current?.navigate('Main', { screen: 'Lembretes' });
    } catch {}
    setTimeout(() => requestEditReminder(rid), 400);
  };
  if (navigationRef.current?.isReady?.()) go();
  else setTimeout(go, 600);
}
