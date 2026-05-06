/**
 * Implementação web do serviço de notificações.
 * Expõe a mesma API de notifications.js para compatibilidade total com ChatScreen e RemindersScreen.
 * O Expo web resolve automaticamente este arquivo em vez de notifications.js na plataforma web
 * (resolução por sufixo de plataforma: .web.js tem prioridade sobre .js).
 *
 * Em vez de notificações nativas, exibe toasts visuais no DOM.
 * Útil para o desenvolvedor visualizar quando um lembrete seria disparado.
 */

const MAX_TOASTS = 3;
const activeToasts = [];

function showWebToast(title, body) {
  // Empilhamento máximo de 3 toasts
  if (activeToasts.length >= MAX_TOASTS) {
    const oldest = activeToasts.shift();
    oldest?.remove();
  }

  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: ${24 + activeToasts.length * 90}px;
    right: 24px;
    z-index: 9999;
    background: #1a1a2e;
    color: #f1f5f9;
    padding: 14px 20px;
    border-radius: 12px;
    max-width: 320px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    line-height: 1.4;
    border-left: 3px solid #ff8234;
    transition: opacity 0.3s ease;
  `;
  const titleNode = document.createElement('div');
  titleNode.style.cssText = 'font-weight:600;margin-bottom:4px;font-size:13px;opacity:0.7;';
  titleNode.textContent = title;

  const bodyNode = document.createElement('div');
  bodyNode.style.cssText = 'font-weight:500;';
  bodyNode.textContent = body;

  const previewNode = document.createElement('div');
  previewNode.style.cssText = 'font-size:11px;opacity:0.4;margin-top:6px;';
  previewNode.textContent = 'preview - notificacao simulada';

  toast.append(titleNode, bodyNode, previewNode);

  document.body.appendChild(toast);
  activeToasts.push(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
      const idx = activeToasts.indexOf(toast);
      if (idx > -1) activeToasts.splice(idx, 1);
    }, 300);
  }, 5000);
}

export async function requestPermission() {
  return true;
}

export async function checkPermission() {
  return true;
}

export async function cancelAllNotifications() {
  // no-op na web — não há notificações reais para cancelar
}

/**
 * Agenda toasts baseado nos dados de sync do backend.
 * Usa setTimeout para simular o disparo no horário correto.
 * Delays maiores que 24h são capados em 24h para evitar overflow de int32.
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
  if (!syncData?.reminders?.length) return;

  const now = Date.now();
  const MAX_DELAY_MS = 24 * 60 * 60 * 1000; // 24h

  for (const reminder of syncData.reminders) {
    if (!reminder.is_active) continue;
    if (!reminder.scheduled_executions?.length) continue;

    // Pega apenas a próxima execução futura de cada lembrete
    const nextTimestamp = reminder.scheduled_executions
      .map(iso => new Date(iso).getTime())
      .filter(t => t > now)
      .sort((a, b) => a - b)[0];

    if (!nextTimestamp) continue;

    const delay = Math.min(nextTimestamp - now, MAX_DELAY_MS);

    setTimeout(() => {
      showWebToast('Quase Nada Lembretes', reminder.title);
    }, delay);
  }
}
