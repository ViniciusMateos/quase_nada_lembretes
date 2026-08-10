// Sinal de "compor um novo lembrete" — disparado por deep link (widget "Criar
// lembrete") ou toque em notificação. A ChatScreen se inscreve e foca o input
// (abre o teclado) quando isso dispara.
//
// É "pegajoso": no cold start o deep link chega ANTES da ChatScreen montar, e um
// sinal sem ouvinte se perderia. Guardamos como pendente; quando a Chat assina,
// consome na hora. Isso mata o delay fixo que existia pra "esperar" a tela.
let listener = null;
let pending = false;

export function requestCompose() {
  if (listener) listener();
  else pending = true;
}

export function onCompose(fn) {
  listener = fn;
  if (pending) {
    pending = false;
    fn();
  }
  return () => {
    if (listener === fn) listener = null;
  };
}
