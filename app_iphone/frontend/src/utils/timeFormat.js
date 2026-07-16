import { anim, getLocale } from '../i18n';

let _is12h = null;

/**
 * 12h ou 24h — SEMPRE do aparelho, nunca do idioma escolhido no app.
 * O usuário pode querer a interface em inglês e o relógio em 24h (é o caso do
 * iPhone do Vinicius). Amarrar o formato de hora ao idioma quebraria isso.
 */
export function detectIs12h() {
  if (_is12h !== null) return _is12h;
  try {
    const formatted = new Intl.DateTimeFormat([], { hour: 'numeric' }).format(new Date(2020, 0, 1, 13));
    _is12h = /am|pm/i.test(formatted);
  } catch {
    _is12h = false;
  }
  return _is12h;
}

/** Palavras no idioma do app; relógio no formato do aparelho. */
export function formatHour(date, opts = {}) {
  return anim(new Intl.DateTimeFormat(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: detectIs12h(),
    ...opts,
  }).format(date));
}
