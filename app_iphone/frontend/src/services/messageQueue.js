/**
 * Fila offline (outbox) de mensagens do chat, persistida em MMKV.
 * Quando não há conexão (ou a requisição falha por rede), a mensagem é
 * enfileirada e reenviada automaticamente ao reconectar.
 */
import { MMKV } from 'react-native-mmkv';
import { sendMessage } from '../api/messages.api';

const storage = new MMKV();
const KEY = 'msg_queue';

function readQueue() {
  try {
    const raw = storage.getString(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  storage.set(KEY, JSON.stringify(items));
}

export function enqueueMessage({ content, client_timestamp, hour_format }) {
  const items = readQueue();
  const item = {
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    content,
    client_timestamp,
    hour_format,
    enqueued_at: new Date().toISOString(),
  };
  items.push(item);
  writeQueue(items);
  return item;
}

export function queueLength() {
  return readQueue().length;
}

let isDraining = false;

/**
 * Reenvia os itens da fila em ordem.
 * - sucesso: remove o item e chama onSuccess(item, result)
 * - erro de rede (sem response): para o drain e mantém o item (tenta depois)
 * - erro do servidor (4xx/5xx com response): descarta o item e segue
 * Retorna o número de itens enviados com sucesso.
 */
export async function drainQueue(onSuccess) {
  if (isDraining) return 0;
  isDraining = true;
  let sent = 0;
  try {
    let items = readQueue();
    while (items.length > 0) {
      const item = items[0];
      try {
        const result = await sendMessage({
          content: item.content,
          client_timestamp: item.client_timestamp,
        });
        items = readQueue().filter(i => i.id !== item.id);
        writeQueue(items);
        sent += 1;
        if (onSuccess) {
          try { await onSuccess(item, result); } catch { /* ignora callback */ }
        }
      } catch (error) {
        if (!error?.response) {
          // ainda sem conexão — para e mantém a fila
          break;
        }
        // erro do servidor: descarta o item problemático e continua
        items = readQueue().filter(i => i.id !== item.id);
        writeQueue(items);
      }
    }
  } finally {
    isDraining = false;
  }
  return sent;
}
