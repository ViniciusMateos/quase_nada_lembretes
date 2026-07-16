import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { storage } from '../lib/storage';

import common from './keys/common';
import auth from './keys/auth';
import reminders from './keys/reminders';
import tasks from './keys/tasks';
import chat from './keys/chat';
import notifications from './keys/notifications';

// Idioma da INTERFACE. Não confundir com formato de hora: 12h/24h continua
// vindo do aparelho (detectIs12h), porque o usuário pode querer o app em inglês
// e o relógio em 24h — que é o caso do Vinicius.
//
// Conteúdo do usuário (título de lembrete, tarefa) e as respostas da IA no chat
// NÃO são traduzidos: seguem como a pessoa escreveu / como o Gemini responde.

const PACKS = [common, auth, reminders, tasks, chat, notifications];

const DICTS = {
  pt: Object.assign({}, ...PACKS.map(p => p.pt)),
  en: Object.assign({}, ...PACKS.map(p => p.en)),
};

export const LANGS = [
  { code: 'pt', label: 'Português' },
  { code: 'en', label: 'English' },
];

const STORAGE_KEY = 'app_language';
const FALLBACK = 'pt';

// Estado no módulo: serviços que não são componentes (notifications.js, utils de
// data) precisam traduzir sem estar dentro de um Provider.
let current = (() => {
  try {
    const saved = storage.getString(STORAGE_KEY);
    return DICTS[saved] ? saved : FALLBACK;
  } catch {
    return FALLBACK;
  }
})();

export function getLang() {
  return current;
}

// ---------------------------------------------------------------------------
// Transição de idioma: as letras se embaralham e vão se resolvendo no idioma
// novo, da esquerda pra direita.
//
// O progresso mora no MÓDULO (e não só no estado do React) porque quem traduz a
// maior parte da tela são helpers fora de componente — os buckets da lista de
// lembretes, o rótulo de recorrência, os nomes de dia. Se só o `t` do contexto
// animasse, esses trocariam de idioma num estalo enquanto o resto embaralhava.
// ---------------------------------------------------------------------------

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const DIGITOS = '0123456789';
const SINAIS = '/:.-,';
const DURACAO = 460;
const PASSO = 32; // ~14 quadros

// O progresso é DERIVADO DO RELÓGIO, não guardado.
//
// A versão anterior mantinha `progressoAtual` numa variável que só o timer sabia
// zerar. Toques rápidos no toggle criavam corrida entre timers, um matava o
// outro, e a variável ficava presa num valor intermediário — texto embaralhado
// pra sempre, no app inteiro. Estado que depende de um timer chegar ao fim pra
// ser limpo é uma bomba.
//
// Agora só guardamos QUANDO a animação termina. Cada chamada de `t()` calcula o
// progresso a partir do relógio: passou do fim, devolve texto limpo — não
// importa o que aconteceu com o timer. É impossível travar embaralhado.
let fimEm = 0; // timestamp do fim; 0 = sem transição

function progressoAgora() {
  if (!fimEm) return null;
  const restante = fimEm - Date.now();
  if (restante <= 0) {
    fimEm = 0;
    return null;
  }
  return 1 - restante / DURACAO;
}

const sorteia = alfabeto => alfabeto[Math.floor(Math.random() * alfabeto.length)];

// Cada caractere é trocado por outro DA MESMA CLASSE: letra vira letra, dígito
// vira dígito, barra/dois-pontos viram outro sinal. Isso mantém a silhueta do
// texto (uma data continua parecendo uma data enquanto embaralha) — trocar tudo
// por letras aleatórias viraria ruído.
function embaralharChar(c) {
  if (/[0-9]/.test(c)) return sorteia(DIGITOS);
  if (/[a-zA-ZÀ-ÿ]/.test(c)) return sorteia(LETRAS);
  if (SINAIS.includes(c)) return sorteia(SINAIS);
  return c; // espaço e o resto ficam parados
}

function embaralhar(texto, progresso) {
  if (!texto) return texto;
  const revelados = Math.floor(texto.length * progresso);
  let saida = '';
  for (let i = 0; i < texto.length; i++) {
    saida += i < revelados ? texto[i] : embaralharChar(texto[i]);
  }
  return saida;
}

/**
 * Aplica a animação de troca de idioma a um texto que NÃO veio do dicionário —
 * tipicamente saída do Intl: "sexta-feira", "14/07/2026, 10:00".
 *
 * Sem isso, tudo que é formatado por data ficaria parado enquanto o resto da
 * tela embaralha, e a transição parece quebrada. Fora da transição, devolve o
 * texto intacto (custo zero).
 */
export function anim(texto) {
  const p = progressoAgora();
  return p == null ? texto : embaralhar(texto, p);
}

// Locale pro Intl (datas, meses, dias da semana).
export function getLocale() {
  return current === 'en' ? 'en-US' : 'pt-BR';
}

/**
 * Tradução CRUA, sem a animação de embaralhar. É o que os serviços devem usar
 * (agendador de notificações, por exemplo): uma notificação agendada no meio da
 * troca de idioma sairia com o texto embaralhado se usasse o `t` animado.
 */
export function tRaw(key, params) {
  const dict = DICTS[current] || DICTS[FALLBACK];
  let str = dict[key];
  if (str == null) str = DICTS[FALLBACK][key];
  if (str == null) return key;
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? String(params[k]) : `{${k}}`));
}

/**
 * Traduz o que vai PRA TELA. Durante a troca de idioma, devolve o texto com as
 * letras ainda não reveladas embaralhadas — ver `embaralhar` abaixo.
 *
 * É module-level de propósito: helpers fora de componente (buckets da lista,
 * rótulo de recorrência, nomes de dia) chamam `t` direto, e sem isso eles
 * trocariam de idioma num estalo enquanto o resto da tela anima.
 */
export function t(key, params) {
  return anim(tRaw(key, params));
}

/** Plural simples: t2('reminder', 'reminders', n). */
export function plural(singularKey, pluralKey, n) {
  return t(n === 1 ? singularKey : pluralKey);
}

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(current);
  const [progresso, setProgresso] = useState(null); // null = sem transição
  const timerRef = useRef(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const setLang = useCallback(code => {
    if (!DICTS[code] || code === current) return;
    current = code;
    try {
      storage.set(STORAGE_KEY, code);
    } catch {}
    setLangState(code); // já troca o texto-alvo; o embaralho o revela aos poucos

    clearInterval(timerRef.current);
    fimEm = Date.now() + DURACAO;
    setProgresso(0);

    // O timer NÃO é dono do progresso — quem manda é o relógio (progressoAgora).
    // Ele só existe pra forçar re-render a cada quadro. Se morrer no meio, o pior
    // que acontece é a animação ficar sem quadros; o texto já sai limpo no
    // próximo render, porque o relógio diz que acabou.
    const meuId = setInterval(() => {
      const p = progressoAgora();
      setProgresso(p == null ? null : p);
      if (p == null) {
        clearInterval(meuId);
        if (timerRef.current === meuId) timerRef.current = null;
      }
    }, PASSO);
    timerRef.current = meuId;

    // Rede de segurança: garante um último render depois do fim, mesmo que o
    // timer tenha sido morto por uma troca simultânea.
    setTimeout(() => setProgresso(null), DURACAO + 80);
  }, []);

  const value = useMemo(
    // `progresso` na dependência: cada quadro cria um objeto novo, e é isso que
    // faz os consumidores do contexto re-renderizarem durante a animação — daí
    // o `t` do módulo é chamado de novo e devolve o próximo quadro do embaralho.
    () => ({ lang, setLang, t, locale: getLocale(), embaralhando: progresso != null, progresso }),
    [lang, setLang, progresso],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useI18n deve ser usado dentro de LanguageProvider');
  return ctx;
}
