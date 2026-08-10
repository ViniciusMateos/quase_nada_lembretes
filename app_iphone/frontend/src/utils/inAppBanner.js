// Barramento da "notificação simulada" dentro do app. Quando um lembrete é
// criado/editado com o app aberto mas o usuário NÃO está na tela de Chat (ex.:
// mandou a mensagem e foi pra aba Lembretes), o iOS não mostra notificação de
// verdade (app em foreground) — então a gente simula uma, com a mesma pegada.
//
// O componente InAppNotificationBanner (montado na raiz do App) se inscreve; a
// tela que detecta a ação chama showInAppBanner({ title, body }).

let listener = null;

export function showInAppBanner(payload) {
  if (payload && listener) listener(payload);
}

export function onInAppBanner(fn) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}
