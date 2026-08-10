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

// Qual tela o toque numa notificação deve abrir (usado pra armar o gate de
// cold-start com o alvo certo):
//   'edit'      → notificação de um lembrete/pré-aviso/snooze (tem reminderId)
//   'lembretes' → resumo diário/semanal (sem reminderId, abre a lista)
//   null        → outros avisos, não navega
export function coldStartTargetFromNotification(notification) {
  const data = notification?.data || {};
  if (data.reminderId) return 'edit';
  if (typeof data.type === 'string' && data.type.startsWith('summary')) return 'lembretes';
  return null;
}

// Navega a partir da notificação tocada. Lembrete único abre o modal de edição;
// resumo diário/semanal abre a lista de Lembretes (não tem um reminder só).
// Serve pros 3 cenários (foreground, background e cold start).
export function openReminderEditFromNotification(notification) {
  const data = notification?.data || {};
  const rid = data.reminderId;
  const isResumo = typeof data.type === 'string' && data.type.startsWith('summary');
  if (!rid && !isResumo) return; // outros avisos não navegam
  const go = () => {
    try {
      navigationRef.current?.navigate('Main', { screen: 'Lembretes' });
    } catch {}
    // requestEditReminder é pegajoso: se a tela ainda não montou (cold start),
    // consome quando ela assinar. Sem delay fixo — abre no primeiro frame útil.
    // Resumo não tem reminderId: só abrir a lista já é o objetivo.
    if (rid) requestEditReminder(rid);
  };
  // Espera adaptativa pela navegação em vez de um setTimeout fixo, pra abrir a
  // tela o mais cedo possível quando o app foi aberto pela notificação.
  if (navigationRef.current?.isReady?.()) go();
  else {
    let tentativas = 0;
    const esperar = () => {
      if (navigationRef.current?.isReady?.()) go();
      else if (tentativas++ < 120) requestAnimationFrame(esperar);
    };
    requestAnimationFrame(esperar);
  }
}
