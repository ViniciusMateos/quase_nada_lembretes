import { t } from '../i18n';

/**
 * Rótulo de recorrência do card ("Único", "Semanalmente", "Dias úteis"...).
 *
 * O backend manda esse texto pronto em `recurrence_str`, mas SEMPRE em português
 * — traduzir lá exigiria enviar o idioma em toda request e re-gerar o texto de
 * todos os lembretes ao trocar de idioma. Como o app já recebe os campos
 * estruturados (recurrence, days_of_week, interval_seconds), montamos o rótulo
 * aqui: traduz na hora, muda junto com o toggle e não depende do servidor.
 *
 * `recurrence_str` fica como último recurso, se vier um tipo que não conhecemos.
 */

const DIAS = ['day.mon', 'day.tue', 'day.wed', 'day.thu', 'day.fri', 'day.sat', 'day.sun'];

function rotuloDias(days) {
  const s = [...new Set(days || [])].filter(d => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (!s.length) return t('reminders.recurrence.weeklyDays');
  if (s.length === 7) return t('reminders.dayPreset.everyDay');
  if (s.join() === '0,1,2,3,4') return t('reminders.dayPreset.weekdays');
  if (s.join() === '5,6') return t('reminders.dayPreset.weekend');

  // Contíguo com 3+ dias vira faixa: "Seg–Sex" / "Mon–Fri".
  const contiguo = s.length >= 3 && s.every((d, i) => i === 0 || d === s[i - 1] + 1);
  if (contiguo) return `${t(DIAS[s[0]])}–${t(DIAS[s[s.length - 1]])}`;

  return s.map(d => t(DIAS[d])).join(', ');
}

function rotuloIntervalo(seconds) {
  if (!seconds) return t('reminders.recurrence.interval');
  if (seconds % 86400 === 0) {
    const n = seconds / 86400;
    return t(n === 1 ? 'reminders.every.day' : 'reminders.every.days', { n });
  }
  if (seconds % 3600 === 0) return t('reminders.every.hours', { n: seconds / 3600 });
  if (seconds % 60 === 0) return t('reminders.every.minutes', { n: seconds / 60 });
  return t('reminders.every.seconds', { n: seconds });
}

export function recurrenceLabel(reminder) {
  if (!reminder) return '';
  const { recurrence, days_of_week: days, interval_seconds: intervalo } = reminder;

  switch (recurrence) {
    case 'once':
    case null:
    case undefined:
      return t('reminders.recurrence.once');
    case 'daily':
      return t('reminders.recurrence.daily');
    case 'weekly':
      return t('reminders.recurrence.weeklyLabel');
    case 'monthly':
      return t('reminders.recurrence.monthlyLabel');
    case 'day_of_month':
      return t('reminders.recurrence.dayOfMonth');
    case 'weekly_days':
      return rotuloDias(days);
    case 'interval_seconds':
      return rotuloIntervalo(intervalo);
    default:
      return reminder.recurrence_str || '';
  }
}
