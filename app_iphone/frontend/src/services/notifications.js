import notifee, { TriggerType, AndroidImportance, EventType } from '@notifee/react-native';
import { ExtensionStorage } from '@bacons/apple-targets';
import { getPriorityEnabled } from './notificationSettings';
import { createReminder } from '../api/reminders.api';
// Não é componente React: usa o `t` do módulo, que lê o idioma atual na hora da chamada.
import { tRaw as t, getLocale } from '../i18n';

const CHANNEL_ID = 'quase-nada-lembretes';

// Categoria/ações de adiar (snooze). No iOS exige setNotificationCategories no boot.
export const CATEGORY_ID = 'lembrete';
export const ACTION_SNOOZE_5 = 'snooze_5';
export const ACTION_SNOOZE_10 = 'snooze_10';

// Sons empacotados no bundle nativo via plugin expo-notifications (app.config.js).
// iOS usa o nome do arquivo; Android usa o recurso em res/raw (sem hífen/extensão).
const IOS_SOUND = 'sound-reminder.wav';
const ANDROID_SOUND = 'sound_reminder';

// Som de "lembrete criado / mensagem do chat" — diferente do alarme de quando o
// lembrete dispara. Empacotado só a partir do próximo build; até lá o iOS cai no
// som padrão (que já é diferente do alarme). O de disparo continua o IOS_SOUND.
const SOUND_CREATED = { ios: 'sound-receive.wav', android: 'sound_receive' };

const SNOOZE_PREFIX = 'snooze_';

// No banner do iOS o TÍTULO é bold e o CORPO é regular — e não há como estilizar
// mais nada. Por isso o lembrete vai no TÍTULO ("Lembrete: Comer", em negrito) e
// a dica de adiar vai sozinha no CORPO, minúscula e sem peso. Antes os dois
// viviam no corpo, com o mesmo peso, e a dica competia com o lembrete.
//
// Função, não constante: como const, o texto congelaria no idioma do import.
const tituloLembrete = titulo => t('notifications.reminderPrefix', { titulo });

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
    name: t('notifications.channel'),
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
          { id: ACTION_SNOOZE_5, title: t('notifications.snooze.5') },
          { id: ACTION_SNOOZE_10, title: t('notifications.snooze.10') },
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

// Grupos de notificação (thread). O iOS empilha por threadId e o Android por
// groupId, então cada tipo vira um amontoado separado na central em vez de tudo
// misturado: lembretes reais, pré-avisos ("me avise antes"), ações do chat
// (criou/editou/removeu) e os resumos diário/semanal.
export const THREAD = {
  LEMBRETE: 'lembrete',
  PRE: 'pre',
  ACAO: 'acao',
  RESUMO: 'resumo',
};

function buildNotification(id, title, body, threadId = THREAD.LEMBRETE) {
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
      groupId: threadId,
      actions: [
        { title: t('notifications.snooze.5'), pressAction: { id: ACTION_SNOOZE_5 } },
        { title: t('notifications.snooze.10'), pressAction: { id: ACTION_SNOOZE_10 } },
      ],
    },
    ios: {
      sound: iosSound(),
      categoryId: CATEGORY_ID,
      threadId,
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

// Só o LOCALE acompanha o idioma; fuso continua fixo em São Paulo e o 24h aqui
// é intencional (formato de parede do agendamento).
const hmBRT = date =>
  new Intl.DateTimeFormat(getLocale(), {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);

// "daqui a 2 dias" / "daqui a 3 horas" / "daqui a 30 minutos" (ou "in 2 days"...).
// Arredonda pra unidade mais graúda que ainda descreve bem a antecedência.
function anteced(leadSeconds) {
  const s = Math.max(60, Math.round(leadSeconds));
  if (s >= 86400) {
    const d = Math.round(s / 86400);
    return t(d === 1 ? 'notifications.in.day' : 'notifications.in.days', { n: d });
  }
  if (s >= 3600) {
    const h = Math.round(s / 3600);
    return t(h === 1 ? 'notifications.in.hour' : 'notifications.in.hours', { n: h });
  }
  const m = Math.round(s / 60);
  return t(m === 1 ? 'notifications.in.minute' : 'notifications.in.minutes', { n: m });
}

// Monta (sem agendar) o notif de um pré-aviso. Pré-aviso não é o lembrete: não
// toca a ação de adiar (não há o que adiar ainda) e diz quanto falta e a que
// horas é o disparo. Retorna { ts, notif } pro balde central, ou null se já
// passou. Quem agenda é o scheduleFromSync (com o corte do limite do iOS).
function buildPreNotif(reminder, pre, now) {
  const ts = new Date(pre.at).getTime();
  if (ts <= now) return null;

  const alvo = new Date(pre.target);
  const notif = buildNotification(
    `${reminder.id}_pre_${ts}`,
    t('notifications.pre.title', { titulo: reminder.title }),
    t('notifications.pre.body', { quando: anteced(pre.lead_seconds), hora: hmBRT(alvo) }),
    THREAD.PRE,
  );
  delete notif.android.actions;
  delete notif.ios.categoryId;
  notif.data = {
    reminderId: reminder.id,
    title: reminder.title,
    isRecurring: '0',
    type: 'pre',
  };

  return { ts, notif };
}

// App Group compartilhado com os widgets (mesmo id do app.config.js / target).
const widgetStore = new ExtensionStorage('group.com.quasenada.lembretes');

// Dia da semana curto ("seg", "sáb") no fuso BRT, pro rótulo do widget.
const diaCurtoBRT = date =>
  new Intl.DateTimeFormat(getLocale(), {
    timeZone: 'America/Sao_Paulo', weekday: 'short',
  }).format(date).replace('.', '');

// Rótulo "quando" do widget: "hoje 10:00" / "sáb 20:00" / "01/08 14:00".
function rotuloQuando(ts) {
  const d = new Date(ts);
  const hoje = brtDayKey(Date.now());
  const dia = brtDayKey(ts);
  const hora = hmBRT(d);
  if (dia === hoje) return `${t('common.today').toLowerCase()} ${hora}`;
  const diff = (new Date(dia) - new Date(hoje)) / 86400000;
  if (diff === 1) return `${t('common.tomorrow').toLowerCase()} ${hora}`;
  if (diff > 1 && diff < 7) return `${diaCurtoBRT(d)} ${hora}`;
  const dm = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit',
  }).format(d);
  return `${dm} ${hora}`;
}

// Grava os próximos lembretes no App Group pros widgets de lista lerem. Só o
// PRÓXIMO disparo de cada lembrete entra (o widget não precisa da série toda),
// ordenado por horário; o Swift separa pontuais de recorrentes.
async function gravarLembretesParaWidget(syncData, now) {
  try {
    const itens = [];
    for (const r of syncData.reminders || []) {
      if (!r.is_active) continue;
      const proximoISO = (r.scheduled_executions || [])
        .map(iso => new Date(iso).getTime())
        .filter(ts => ts > now)
        .sort((a, b) => a - b)[0];
      if (!proximoISO) continue;
      itens.push({
        id: r.id,
        titulo: r.title,
        quando: rotuloQuando(proximoISO),
        recorrente: !!r.recurrence && r.recurrence !== 'once',
        timestamp: proximoISO,
      });
    }
    itens.sort((a, b) => a.timestamp - b.timestamp);
    // O ExtensionStorage aceita string; guardamos o JSON (o Swift decodifica).
    // Guarda o suficiente pro widget grande (13 linhas) com folga.
    widgetStore.set('proximos_lembretes', JSON.stringify(itens.slice(0, 16)));
    ExtensionStorage.reloadWidget(); // redesenha os widgets já na tela
  } catch (error) {
    console.warn('[Notifications] Erro ao gravar lembretes do widget:', error);
  }
}

// O iOS mantém no máximo 64 notificações locais PENDENTES por app e descarta,
// sem avisar, tudo que passar disso. Deixamos folga pros "adiar" one-off.
const LIMITE_PENDENTES = 58;

export async function scheduleFromSync(syncData) {
  try {
    await ensureChannel();
    await cancelSyncedNotifications();

    if (!syncData?.reminders?.length) return;

    const now = Date.now();

    // Junta TODAS as notificações candidatas (pré-avisos, disparos e resumos)
    // num balde único com seu horário, ordena por horário e agenda só as mais
    // PRÓXIMAS. Antes o loop agendava em ordem de lembrete — quando batia o
    // limite do iOS, o que vinha depois (pré-avisos e resumos de lembretes mais
    // adiante no loop) sumia, mesmo disparando antes. Ordenando por tempo, as
    // iminentes sempre entram.
    const candidatos = [];

    for (const reminder of syncData.reminders) {
      if (!reminder.is_active) continue;

      for (const pre of reminder.pre_executions || []) {
        const c = buildPreNotif(reminder, pre, now);
        if (c) candidatos.push(c);
      }

      const isRecurring = !!reminder.recurrence && reminder.recurrence !== 'once';
      for (const executionISO of reminder.scheduled_executions || []) {
        const ts = new Date(executionISO).getTime();
        if (ts <= now) continue;
        const notif = buildNotification(
          `${reminder.id}_${ts}`,
          tituloLembrete(reminder.title),
          t('notifications.snoozeHint'),
        );
        notif.data = {
          reminderId: reminder.id,
          title: reminder.title,
          isRecurring: isRecurring ? '1' : '0',
        };
        candidatos.push({ ts, notif });
      }
    }

    // Resumos entram no mesmo balde (também ocupam slot do iOS).
    coletarResumos(syncData, now, candidatos);

    candidatos.sort((a, b) => a.ts - b.ts);
    const agendar = candidatos.slice(0, LIMITE_PENDENTES);
    for (const c of agendar) {
      await notifee.createTriggerNotification(c.notif, {
        type: TriggerType.TIMESTAMP,
        timestamp: c.ts,
      });
    }
    if (candidatos.length > LIMITE_PENDENTES) {
      console.warn(
        `[Notifications] ${candidatos.length} candidatas; agendadas as ${LIMITE_PENDENTES} mais próximas (limite do iOS). As demais entram no próximo sync.`,
      );
    }

    await gravarLembretesParaWidget(syncData, now);
  } catch (error) {
    console.warn('[Notifications] Erro ao sincronizar notificações:', error);
  }
}

// Agenda as notificações-resumo a partir das mesmas execuções do /sync:
// - DIÁRIA: às 12h do dia anterior, uma notificação unificada por dia
//   ("você tem N lembretes para amanhã: ...").
// - SEMANAL: toda segunda 8h, o total da semana.
// Recriadas a cada sync (ids determinísticos), então não duplicam.
// Junta os resumos (diário/semanal) no `candidatos`, em vez de agendar direto —
// assim eles competem pelos slots do iOS junto com os lembretes, por horário.
function coletarResumos(syncData, now, candidatos) {
  const byDay = {}; // dayKey(BRT) -> [titles]

  for (const reminder of syncData.reminders) {
    if (!reminder.is_active) continue;
    const recorrente = !!reminder.recurrence && reminder.recurrence !== 'once';
    for (const executionISO of reminder.scheduled_executions || []) {
      const ts = new Date(executionISO).getTime();
      if (ts <= now) continue;
      const key = brtDayKey(ts);
      (byDay[key] = byDay[key] || []).push({ title: reminder.title, ts, recorrente });
    }
  }

  const dayKeys = Object.keys(byDay).sort();

  const emit = (id, title, body, data, timestamp) => {
    const notif = buildNotification(id, title, body, THREAD.RESUMO);
    delete notif.android.actions; // resumo não tem "adiar"
    // Categoria própria do resumo — casa com a Notification Content Extension
    // (targets/resumo-notif); sem ela, mostra o padrão.
    notif.ios.categoryId = 'resumo';
    notif.data = data;
    candidatos.push({ ts: timestamp, notif });
  };

  // Corpo listando cada lembrete (nome + horário) — cada um numa linha, pra
  // aparecer todos ao expandir/segurar a notificação. `comDia` inclui o dia.
  const SP = 'America/Sao_Paulo';
  const hm = ts =>
    new Intl.DateTimeFormat(getLocale(), { timeZone: SP, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
  const diaHm = ts =>
    new Intl.DateTimeFormat(getLocale(), { timeZone: SP, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
      .format(new Date(ts))
      .replace('.', '');
  // Pontuais primeiro, recorrentes embaixo sob um cabeçalho — mesma separação da
  // aba de Lembretes. O corte de 10 é do TOTAL, e cada vertente só aparece se
  // tiver item (nada de cabeçalho "Recorrentes" órfão).
  const linhaDe = (it, comDia) => `• ${it.title} — ${comDia ? diaHm(it.ts) : hm(it.ts)}`;
  const listar = (items, comDia) => {
    const porTs = (a, b) => a.ts - b.ts;
    const pontuais = items.filter(i => !i.recorrente).sort(porTs);
    const recorrentes = items.filter(i => i.recorrente).sort(porTs);

    const LIMITE = 10;
    const linhas = [];
    let mostrados = 0;

    const push = it => {
      if (mostrados >= LIMITE) return false;
      linhas.push(linhaDe(it, comDia));
      mostrados += 1;
      return true;
    };

    for (const it of pontuais) if (!push(it)) break;

    if (recorrentes.length && mostrados < LIMITE) {
      if (linhas.length) linhas.push('');
      linhas.push(t('notifications.recurring'));
      for (const it of recorrentes) if (!push(it)) break;
    }

    if (items.length > mostrados) linhas.push(t('notifications.andMore', { n: items.length - mostrados }));
    return linhas.join('\n');
  };

  // Diária — 12h do dia anterior a cada dia com lembretes.
  for (const dayKey of dayKeys) {
    const fireTs = brtTimestamp(prevDayKey(dayKey), DAILY_SUMMARY_HOUR);
    if (fireTs <= now) continue; // aviso das 12h de ontem já passou
    const items = byDay[dayKey].slice().sort((a, b) => a.ts - b.ts);
    const n = items.length;
    const cabecalho = t(n === 1 ? 'notifications.summary.daily' : 'notifications.summary.dailyPlural', { n });
    const body = `${cabecalho}\n${listar(items, false)}`;
    emit(`${SUMMARY_PREFIX}daily_${dayKey}`, t('notifications.summary.dailyTitle'), body, { type: 'summary_daily', dayKey }, fireTs);
  }

  // Semanal — segunda 8h, todos os lembretes da semana (seg..dom).
  const byWeek = {}; // mondayKey -> [{title, ts}]
  for (const dayKey of dayKeys) {
    const mk = mondayOfWeekKey(dayKey);
    (byWeek[mk] = byWeek[mk] || []).push(...byDay[dayKey]);
  }
  for (const mondayKey of Object.keys(byWeek).sort()) {
    const fireTs = brtTimestamp(mondayKey, WEEKLY_SUMMARY_HOUR);
    if (fireTs <= now) continue;
    const items = byWeek[mondayKey].slice().sort((a, b) => a.ts - b.ts);
    const n = items.length;
    const cabecalho = t(n === 1 ? 'notifications.summary.weekly' : 'notifications.summary.weeklyPlural', { n });
    const body = `${cabecalho}\n${listar(items, true)}`;
    emit(`${SUMMARY_PREFIX}weekly_${mondayKey}`, t('notifications.summary.weeklyTitle'), body, { type: 'summary_weekly', mondayKey }, fireTs);
  }
}

// Agenda uma notificação local pontual (one-off) para adiar um lembrete.
// Não toca no servidor nem na recorrência — vale só "para aquele momento".
export async function scheduleSnoozeNotification({ reminderId, title, minutes }) {
  try {
    await ensureChannel();
    const timestamp = Date.now() + minutes * 60 * 1000;
    const cleanTitle = (title || t('notifications.fallbackTitle')).split('\n')[0];
    const notif = buildNotification(
      `${SNOOZE_PREFIX}${reminderId || 'x'}_${Date.now()}`,
      tituloLembrete(cleanTitle),
      t('notifications.snoozeHint'),
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
  const notif = buildNotification(`${reminderId}_${timestamp}`, tituloLembrete(title), t('notifications.snoozeHint'));
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
    const title = (data.title || detail?.notification?.body || t('notifications.fallbackTitle')).split('\n')[0];
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
export async function displayLocalNotification(title, body, { silent = false, sound } = {}) {
  try {
    await ensureChannel();
    // Aviso informativo (criou/editou/removeu lembrete pelo chat) → grupo próprio.
    const notif = buildNotification(`local_${Date.now()}`, title, body, THREAD.ACAO);
    // remove ações de adiar nesse aviso informativo
    delete notif.android.actions;
    delete notif.ios.categoryId;
    if (sound) {
      // Som específico (ex.: som de "criado", diferente do alarme de disparo).
      notif.ios.sound = sound.ios;
      notif.android.sound = sound.android;
    }
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

// Notificação de "lembrete criado/atualizado/removido" — MESMO texto que o banner
// interno do chat. Serve pra disparar de fora do app (fila offline / background)
// quando a mensagem foi processada sem o usuário estar olhando a tela.
const ACTION_TITLE_KEY = {
  reminder_created: 'chat.banner.created',
  reminder_updated: 'chat.banner.updated',
  reminder_deleted: 'chat.banner.deleted',
};

// Texto (título + corpo) da ação de lembrete — fonte única usada tanto pela
// notificação real (fora do app) quanto pelo banner simulado (dentro do app).
export function reminderActionText(actionType, action) {
  const key = ACTION_TITLE_KEY[actionType];
  if (!key) return null;
  const body = action?.reminder?.title || action?.reminder_title || t('chat.banner.fallback');
  return { title: t(key), body };
}

// Texto pra QUALQUER resposta do chat: ação de lembrete tem título próprio;
// as demais (pergunta de horário, ambígua, resposta comum) viram uma notificação
// de "nova mensagem" com o texto da IA. Retorna null se não há o que notificar.
export function chatResponseText(actionType, action, response) {
  const acao = reminderActionText(actionType, action);
  if (acao) return acao;
  const body = String(response || '').split('\n')[0].trim();
  if (!body) return null;
  return { title: t('notifications.chatMessageTitle'), body };
}

// Notificação real (fora do app) de mensagem/ação do chat — com o som de "criado"
// (suave), diferente do alarme de quando o lembrete dispara.
export async function notifyChatBanner(title, body) {
  await displayLocalNotification(title, body, { sound: SOUND_CREATED });
}

export async function notifyReminderAction(actionType, action) {
  const txt = reminderActionText(actionType, action);
  if (!txt) return false;
  await notifyChatBanner(txt.title, txt.body);
  return true;
}
