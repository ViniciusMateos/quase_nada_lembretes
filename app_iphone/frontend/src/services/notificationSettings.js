/**
 * Armazenamento das preferências de notificação (MMKV).
 * Usado tanto pelo serviço de notificações (notifications.js) quanto pelo
 * NotificationSettingsContext. Defaults LIGADOS na primeira abertura do app.
 */
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();

const KEY_PRIORITY = 'notif_priority';      // Time-Sensitive: fura modos de Foco
const KEY_CUSTOM_SOUND = 'notif_custom_sound'; // som próprio em vez do padrão do sistema

function getBool(key, fallback = true) {
  const v = storage.getBoolean(key);
  return v === undefined ? fallback : v;
}

export function getPriorityEnabled() {
  return getBool(KEY_PRIORITY, true);
}

export function setPriorityEnabled(value) {
  storage.set(KEY_PRIORITY, !!value);
}

export function getCustomSoundEnabled() {
  return getBool(KEY_CUSTOM_SOUND, true);
}

export function setCustomSoundEnabled(value) {
  storage.set(KEY_CUSTOM_SOUND, !!value);
}
