/**
 * Helpers de data e de semana ISO.
 *
 * O `getWeekKey` é uma réplica EXATA da função do site quase-nada-tarefas para
 * que as chaves de semana ("AAAA-Www") batam byte a byte com o backend e a
 * comparação lexicográfica de strings continue ordenando corretamente.
 *
 * Meses em PT-BR ficam hardcoded (sem depender de ICU/Intl) para evitar
 * variações entre engines (Hermes) e garantir o mesmo rótulo em qualquer build.
 */

export const MESES_CURTOS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

export const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export const MESES_CAP = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export const MESES_ABREV_CAP = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

/** Chave ISO da semana ("AAAA-Www"). Réplica exata da função do site. */
export function getWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Segunda-feira (00:00 local) da semana que contém `date`. */
export function getMonday(date) {
  const m = new Date(date);
  const day = m.getDay();
  const diff = m.getDate() - day + (day === 0 ? -6 : 1);
  m.setDate(diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

/** Rótulo do intervalo da semana, ex: "22 jun - 28 jun". */
export function getWeekRangeLabel(date) {
  const mon = getMonday(date);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = d => `${d.getDate()} ${MESES_CURTOS[d.getMonth()]}`;
  return `${fmt(mon)} - ${fmt(sun)}`;
}

/** Data do dia no formato "23, dezembro, 2026". */
export function formatTodayLabel(date = new Date()) {
  return `${date.getDate()}, ${MESES[date.getMonth()]}, ${date.getFullYear()}`;
}

/**
 * Semanas de um mês (segunda→domingo) que tocam aquele mês. Réplica da lógica do
 * site, usada no picker de semanas.
 */
export function getWeeksForMonth(year, month) {
  const weeks = [];
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay() === 0 ? 7 : firstDay.getDay();
  const startMonday = new Date(year, month, 1 - firstDayOfWeek + 1);

  const currentMonday = new Date(startMonday);
  for (let i = 0; i < 6; i++) {
    const sunday = new Date(currentMonday);
    sunday.setDate(currentMonday.getDate() + 6);
    if (currentMonday.getMonth() === month || sunday.getMonth() === month) {
      weeks.push({ monday: new Date(currentMonday), sunday: new Date(sunday) });
    }
    currentMonday.setDate(currentMonday.getDate() + 7);
  }
  return weeks;
}
