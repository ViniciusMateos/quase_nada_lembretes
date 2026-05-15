let _is12h = null;

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

export function formatHour(date, opts = {}) {
  const is12h = detectIs12h();
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: is12h,
    ...opts,
  }).format(date);
}
