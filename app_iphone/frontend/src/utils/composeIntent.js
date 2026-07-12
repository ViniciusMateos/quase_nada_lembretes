// Sinal de "compor um novo lembrete" — disparado por deep link (widget da tela
// de bloqueio "clique para ser lembrado") ou por toque em notificação. A
// ChatScreen se inscreve e foca o input (abre o teclado) quando isso dispara.
let listener = null;

export function requestCompose() {
  if (listener) listener();
}

export function onCompose(fn) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}
