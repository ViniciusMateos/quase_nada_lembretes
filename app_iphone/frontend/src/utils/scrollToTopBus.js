// Bus mínimo pra "tocar na aba já ativa → rolar a lista pro topo".
//
// Cada tela registra seu handler de scroll-to-top por NOME de rota; o tab bar,
// ao detectar toque numa aba que já está focada, chama o handler daquela rota.
// Módulo simples de propósito: não precisa de contexto nem re-render.
const handlers = {};

export function registerScrollToTop(routeName, fn) {
  handlers[routeName] = fn;
  return () => {
    if (handlers[routeName] === fn) delete handlers[routeName];
  };
}

export function scrollToTop(routeName) {
  handlers[routeName]?.();
}
