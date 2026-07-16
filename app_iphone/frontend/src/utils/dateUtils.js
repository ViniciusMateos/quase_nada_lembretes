/**
 * Helpers de data e de semana ISO.
 *
 * O `getWeekKey` é uma réplica EXATA da função do site quase-nada-tarefas para
 * que as chaves de semana ("AAAA-Www") batam byte a byte com o backend e a
 * comparação lexicográfica de strings continue ordenando corretamente.
 *
 * Os meses eram arrays fixos em PT-BR. Agora saem do Intl no idioma escolhido no
 * app — viraram FUNÇÕES (e não mais constantes) de propósito: o idioma pode
 * mudar em runtime, e um array congelado no import ficaria preso ao idioma que
 * estava valendo quando o módulo carregou.
 */
import { anim, getLang, getLocale } from '../i18n';

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const mesesFmt = (mes, opts) =>
  new Intl.DateTimeFormat(getLocale(), opts).format(new Date(2020, mes, 1));

/** ['jan','fev',...] no idioma ativo. */
export const mesesCurtos = () =>
  Array.from({ length: 12 }, (_, i) => mesesFmt(i, { month: 'short' }).replace('.', ''));

/** ['janeiro','fevereiro',...] no idioma ativo. */
export const meses = () =>
  Array.from({ length: 12 }, (_, i) => mesesFmt(i, { month: 'long' }));

/** ['Janeiro',...] no idioma ativo. */
export const mesesCap = () => meses().map(cap);

/** ['Jan','Fev',...] no idioma ativo. */
export const mesesAbrevCap = () => mesesCurtos().map(cap);

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

/** Rótulo do intervalo da semana. PT: "22 jun - 28 jun" · EN: "Jun 22 - Jun 28". */
export function getWeekRangeLabel(date) {
  const mon = getMonday(date);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const m = mesesCurtos();
  const emIngles = getLang() === 'en';
  const fmt = d => (emIngles
    ? `${cap(m[d.getMonth()])} ${d.getDate()}`   // Jun 22
    : `${d.getDate()} ${m[d.getMonth()]}`);      // 22 jun
  return `${fmt(mon)} - ${fmt(sun)}`;
}

/** Data do dia. PT: "23, dezembro, 2026" · EN: "December 23, 2026". */
export function formatTodayLabel(date = new Date()) {
  const nome = meses()[date.getMonth()];
  const texto = getLang() === 'en'
    ? `${cap(nome)} ${date.getDate()}, ${date.getFullYear()}`
    : `${date.getDate()}, ${nome}, ${date.getFullYear()}`;
  // Passa pelo anim() porque o texto é montado aqui, não vem do dicionário:
  // sem isso o cabeçalho ficaria parado enquanto a tela toda embaralha.
  return anim(texto);
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
