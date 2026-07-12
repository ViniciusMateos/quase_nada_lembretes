import notifee, { TriggerType, AndroidImportance, EventType } from '@notifee/react-native';
import { getPriorityEnabled } from './notificationSettings';
import { createReminder } from '../api/reminders.api';

const CHANNEL_ID = 'quase-nada-lembretes';

// Categoria/ações de adiar (snooze). No iOS exige setNotificationCategories no boot.
export const CATEGORY_ID = 'lembrete';
export const ACTION_SNOOZE_5 = 'snooze_5';
export const ACTION_SNOOZE_10 = 'snooze_10';

// Sons empacotados no bundle nativo via plugin expo-notifications (app.config.js).
// iOS usa o nome do arquivo; Android usa o recurso em res/raw (sem hífen/extensão).
const IOS_SOUND = 'sound-reminder.wav';
const ANDROID_SOUND = 'sound_reminder';

const SNOOZE_PREFIX = 'snooze_';
const SNOOZE_HINT = '\nsegure para adiar';

// Notificações-resumo: diária às 12h do dia anterior ("você tem X pra amanhã")
// e semanal na segunda de manhã. Ids com prefixo summary_ — como não começam
// com snooze_, o cancelSyncedNotifications já as recria a cada sync.
const SUMMARY_PREFIX = 'summary_';
const DAILY_SUMMARY_HOUR = 12; // 12h (BRT) do dia anterior
const WEEKLY_SUMMARY_HOUR = 8; // segunda 8h (BRT)
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000; // Brasília fixo UTC-3

// Chave de dia (YYYY-MM-DD) em BRT a partir de um epoch.
function brtDayKey(ts) {
  const d = new Date(ts - BRT_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Epoch de um horário de parede BRT num dia (YYYY-MM-DD). BRT->UTC = +3h.
function brtTimestamp(dayKey, hour) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return Date.UTC(y, m - 1, d, hour + 3, 0, 0);
}

function dayKeyFromParts(base) {
  const dt = new Date(base);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function prevDayKey(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return dayKeyFromParts(Date.UTC(y, m - 1, d) - 86400000);
}

// Segunda-feira da semana de um dayKey (Seg como início).
function mondayOfWeekKey(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d);
  const backToMon = (new Date(base).getUTCDay() + 6) % 7; // Dom=0 -> 6, Seg=1 -> 0
  return dayKeyFromParts(base - backToMon * 86400000);
}

// Som do app SEMPRE — nunca o som padrão do sistema (decisão de produto:
// o lembrete sempre toca a voz/efeito do Quase Nada, sem opção de desligar).
function iosSound() {
  return IOS_SOUND;
}

function androidSound() {
  return ANDROID_SOUND;
}

async function ensureChannel() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Lembretes',
    importance: AndroidImportance.HIGH,
    sound: androidSound(),
    vibration: true,
    vibrationPattern: [100, 200, 100, 200],
  });
}

// Categorias de ação — chamar uma vez no boot do app.
export async function setupNotificationCategories() {
  try {
    await notifee.setNotificationCategories([
      {
        id: CATEGORY_ID,
        actions: [
          { id: ACTION_SNOOZE_5, title: 'Adiar 5 min' },
          { id: ACTION_SNOOZE_10, title: 'Adiar 10 min' },
        ],
      },
    ]);
  } catch (error) {
    console.warn('[Notifications] Erro ao registrar categorias:', error);
  }
}

export async function requestPermission() {
  try {
    // criticalAlert fica de fora (exige entitlement aprovado pela Apple).
    const settings = await notifee.requestPermission({
      sound: true,
      alert: true,
      badge: true,
    });
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

// Cancela só as notificações geradas pelo /sync, preservando os "adiar" one-off
// (ids com prefixo snooze_) para que um adiamento não seja apagado no próximo sync.
async function cancelSyncedNotifications() {
  try {
    const ids = await notifee.getTriggerNotificationIds();
    const toCancel = (ids || []).filter(id => !id.startsWith(SNOOZE_PREFIX));
    if (toCancel.length) await notifee.cancelTriggerNotifications(toCancel);
  } catch (error) {
    console.warn('[Notifications] Erro ao cancelar notificações:', error);
  }
}

export async function cancelAllNotifications() {
  try {
    await notifee.cancelAllNotifications();
  } catch (error) {
    console.warn('[Notifications] Erro ao cancelar notificações:', error);
  }
}

function buildNotification(id, title, body) {
  const priority = getPriorityEnabled();
  return {
    id,
    title,
    body,
    data: {},
    android: {
      channelId: CHANNEL_ID,
      pressAction: { id: 'default' },
      sound: androidSound(),
      importance: AndroidImportance.HIGH,
      vibrationPattern: [100, 200, 100, 200],
      actions: [
        { title: 'Adiar 5 min', pressAction: { id: ACTION_SNOOZE_5 } },
        { title: 'Adiar 10 min', pressAction: { id: ACTION_SNOOZE_10 } },
      ],
    },
    ios: {
      sound: iosSound(),
      categoryId: CATEGORY_ID,
      // timeSensitive fura modos de Foco; 'active' é o nível normal.
      interruptionLevel: priority ? 'timeSensitive' : 'active',
      // Sem isso, iOS suprime o banner quando o app está em foreground.
      foregroundPresentationOptions: {
        alert: true,
        badge: true,
        sound: true,
        banner: true,
        list: true,
      },
    },
  };
}

export async function scheduleFromSync(syncData) {
  try {
    await ensureChannel();
    await cancelSyncedNotifications();

    if (!syncData?.reminders?.length) return;

    const now = Date.now();

    for (const reminder of syncData.reminders) {
      if (!reminder.is_active) continue;
      if (!reminder.scheduled_executions?.length) continue;

      const isRecurring = !!reminder.recurrence && reminder.recurrence !== 'once';

      for (const executionISO of reminder.scheduled_executions) {
        const triggerTimestamp = new Date(executionISO).getTime();
        if (triggerTimestamp <= now) continue;

        const notif = buildNotification(
          `${reminder.id}_${triggerTimestamp}`,
          'Quase Nada Lembretes',
          reminder.title + SNOOZE_HINT,
        );
        notif.data = {
          reminderId: reminder.id,
          title: reminder.title,
          isRecurring: isRecurring ? '1' : '0',
        };

        await notifee.createTriggerNotification(notif, {
          type: TriggerType.TIMESTAMP,
          timestamp: triggerTimestamp,
        });
      }
    }

    await scheduleSummaryNotifications(syncData);
  } catch (error) {
    console.warn('[Notifications] Erro ao sincronizar notificações:', error);
  }
}

// Agenda as notificações-resumo a partir das mesmas execuções do /sync:
// - DIÁRIA: às 12h do dia anterior, uma notificação unificada por dia
//   ("você tem N lembretes para amanhã: ...").
// - SEMANAL: toda segunda 8h, o total da semana.
// Recriadas a cada sync (ids determinísticos), então não duplicam.
async function scheduleSummaryNotifications(syncData) {
  const now = Date.now();
  // TESTE: dispara os resumos em segundos em vez dos horários reais (12h dia
  // anterior / segunda 8h). TROCAR PRA false depois de testar.
  const SUMMARY_TEST = false;
  const byDay = {}; // dayKey(BRT) -> [titles]

  for (const reminder of syncData.reminders) {
    if (!reminder.is_active) continue;
    for (const executionISO of reminder.scheduled_executions || []) {
      const ts = new Date(executionISO).getTime();
      if (ts <= now) continue;
      const key = brtDayKey(ts);
      (byDay[key] = byDay[key] || []).push({ title: reminder.title, ts });
    }
  }

  const dayKeys = Object.keys(byDay).sort();

  const emit = async (id, title, body, data, timestamp) => {
    const notif = buildNotification(id, title, body);
    delete notif.android.actions; // resumo não tem "adiar"
    // Categoria própria do resumo — casa com a Notification Content Extension
    // (targets/resumo-notif) quando ela for buildada; sem ela, mostra o padrão.
    notif.ios.categoryId = 'resumo';
    notif.data = data;
    await notifee.createTriggerNotification(notif, { type: TriggerType.TIMESTAMP, timestamp });
  };

  // Corpo listando cada lembrete (nome + horário) — cada um numa linha, pra
  // aparecer todos ao expandir/segurar a notificação. `comDia` inclui o dia.
  const SP = 'America/Sao_Paulo';
  const hm = ts =>
    new Intl.DateTimeFormat('pt-BR', { timeZone: SP, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
  const diaHm = ts =>
    new Intl.DateTimeFormat('pt-BR', { timeZone: SP, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
      .format(new Date(ts))
      .replace('.', '');
  const listar = (items, comDia) => {
    const linhas = items.slice(0, 10).map(it => `• ${it.title} — ${comDia ? diaHm(it.ts) : hm(it.ts)}`);
    if (items.length > 10) linhas.push(`…e mais ${items.length - 10}`);
    return linhas.join('\n');
  };

  // Diária — 12h do dia anterior a cada dia com lembretes.
  for (const dayKey of dayKeys) {
    const fireTs = SUMMARY_TEST ? now + 12000 : brtTimestamp(prevDayKey(dayKey), DAILY_SUMMARY_HOUR);
    if (!SUMMARY_TEST && fireTs <= now) continue; // aviso das 12h de ontem já passou
    const items = byDay[dayKey].slice().sort((a, b) => a.ts - b.ts);
    const n = items.length;
    const body = `Você tem ${n} ${n === 1 ? 'lembrete' : 'lembretes'} para amanhã:\n${listar(items, false)}`;
    await emit(`${SUMMARY_PREFIX}daily_${dayKey}`, 'Lembretes de amanhã', body, { type: 'summary_daily', dayKey }, fireTs);
  }

  // Semanal — segunda 8h, todos os lembretes da semana (seg..dom).
  const byWeek = {}; // mondayKey -> [{title, ts}]
  for (const dayKey of dayKeys) {
    const mk = mondayOfWeekKey(dayKey);
    (byWeek[mk] = byWeek[mk] || []).push(...byDay[dayKey]);
  }
  for (const mondayKey of Object.keys(byWeek).sort()) {
    const fireTs = SUMMARY_TEST ? now + 30000 : brtTimestamp(mondayKey, WEEKLY_SUMMARY_HOUR);
    if (!SUMMARY_TEST && fireTs <= now) continue;
    const items = byWeek[mondayKey].slice().sort((a, b) => a.ts - b.ts);
    const n = items.length;
    const body = `Você tem ${n} ${n === 1 ? 'lembrete' : 'lembretes'} essa semana:\n${listar(items, true)}`;
    await emit(`${SUMMARY_PREFIX}weekly_${mondayKey}`, 'Lembretes da semana', body, { type: 'summary_weekly', mondayKey }, fireTs);
  }
}

// Agenda uma notificação local pontual (one-off) para adiar um lembrete.
// Não toca no servidor nem na recorrência — vale só "para aquele momento".
export async function scheduleSnoozeNotification({ reminderId, title, minutes }) {
  try {
    await ensureChannel();
    const timestamp = Date.now() + minutes * 60 * 1000;
    const cleanTitle = (title || 'Lembrete').split('\n')[0];
    const notif = buildNotification(
      `${SNOOZE_PREFIX}${reminderId || 'x'}_${Date.now()}`,
      'Quase Nada Lembretes',
      cleanTitle + SNOOZE_HINT,
    );
    // Guarda o título LIMPO no data pra o próximo adiar não reanexar o hint.
    notif.data = { reminderId: reminderId || '', title: cleanTitle, isRecurring: '1' };
    await notifee.createTriggerNotification(notif, {
      type: TriggerType.TIMESTAMP,
      timestamp,
    });
  } catch (error) {
    console.warn('[Notifications] Erro ao agendar adiamento:', error);
  }
}

// Agenda uma notificação com o MESMO formato de id do /sync (`${id}_${ts}`), para
// que o próximo scheduleFromSync a gerencie sem duplicar.
async function scheduleServerReminderNotification(reminderId, title, timestamp) {
  await ensureChannel();
  const notif = buildNotification(`${reminderId}_${timestamp}`, 'Quase Nada Lembretes', title + SNOOZE_HINT);
  notif.data = { reminderId, title, isRecurring: '0' };
  await notifee.createTriggerNotification(notif, {
    type: TriggerType.TIMESTAMP,
    timestamp,
  });
}

// Trata o toque nas ações de adiar (foreground e background).
// Recorrente: agenda uma notificação local pontual (não mexe na recorrência).
// Pontual: cria um novo lembrete no servidor (+5/+10) — assim persiste na lista —
// e agenda a notificação localmente (id no formato do /sync, sem duplicar).
export async function handleNotificationEvent({ type, detail }) {
  try {
    if (type !== EventType.ACTION_PRESS) return;
    const actionId = detail?.pressAction?.id;
    if (actionId !== ACTION_SNOOZE_5 && actionId !== ACTION_SNOOZE_10) return;

    const minutes = actionId === ACTION_SNOOZE_5 ? 5 : 10;
    const data = detail?.notification?.data || {};
    const reminderId = data.reminderId;
    const title = (data.title || detail?.notification?.body || 'Lembrete').split('\n')[0];
    const isRecurring = data.isRecurring === '1';

    if (isRecurring) {
      await scheduleSnoozeNotification({ reminderId, title, minutes });
      return;
    }

    const when = new Date(Date.now() + minutes * 60 * 1000);
    try {
      const created = await createReminder({
        title,
        scheduled_time: when.toISOString(),
        recurrence: 'once',
      });
      await scheduleServerReminderNotification(created.id, title, when.getTime());
    } catch (e) {
      // Sem rede/sessão: garante o adiamento com uma notificação local pontual.
      console.warn('[Notifications] Adiar pontual via servidor falhou, usando local:', e);
      await scheduleSnoozeNotification({ reminderId, title, minutes });
    }
  } catch (error) {
    console.warn('[Notifications] Erro ao tratar ação de notificação:', error);
  }
}

// Notificação local imediata (ex.: "Lembrete registrado" quando processado em background,
// ou confirmações do chat). `silent: true` derruba o som de sistema — usar quando o app
// já está tocando o som de "received" pela tela.
export async function displayLocalNotification(title, body, { silent = false } = {}) {
  try {
    await ensureChannel();
    const notif = buildNotification(`local_${Date.now()}`, title, body);
    // remove ações de adiar nesse aviso informativo
    delete notif.android.actions;
    delete notif.ios.categoryId;
    if (silent) {
      delete notif.android.sound;
      delete notif.ios.sound;
      notif.ios.foregroundPresentationOptions.sound = false;
    }
    await notifee.displayNotification(notif);
  } catch (error) {
    console.warn('[Notifications] Erro ao exibir notificação local:', error);
  }
}
