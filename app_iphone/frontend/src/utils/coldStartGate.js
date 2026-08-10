// Portão de cold-start: quando o app abre POR um widget ou notificação, a gente
// segura um overlay (o mesmo splash azul + LoadingDog) por cima de tudo até a
// tela-OBJETIVO daquele atalho estar pronta. Sem isso, o usuário via o app
// piscar pelas telas intermediárias (splash → aba Chat → navega → alvo carrega).
//
// Fluxo: o roteador de deep link "arma" o portão com o alvo; a tela-objetivo,
// quando termina de montar (teclado aberto, modal de edição pronto, etc.),
// chama markColdStartReady() e o overlay some suave. Uma trava de segurança
// libera sozinha depois de alguns segundos, pro portão nunca prender o app.

let alvo = null;   // 'compose' | 'chat' | 'edit' | 'lembretes' | null
let pronto = false;
let subs = [];

export function armColdStart(target) {
  alvo = target;
}

export function getColdStartTarget() {
  return alvo;
}

// Marca pronto SÓ se o alvo bater (ou se for chamado sem alvo, o genérico).
// Idempotente e seguro de chamar de qualquer tela — fora do cold start, é no-op.
export function markColdStartReady(paraAlvo) {
  if (pronto) return;
  if (paraAlvo && alvo && paraAlvo !== alvo) return; // não é a tela-objetivo
  pronto = true;
  subs.forEach(f => f());
  subs = [];
}

export function onColdStartReady(fn) {
  if (pronto) { fn(); return () => {}; }
  subs.push(fn);
  return () => { subs = subs.filter(x => x !== fn); };
}

export function isColdStartReady() {
  return pronto;
}
