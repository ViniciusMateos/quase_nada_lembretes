/**
 * Stub web do @notifee/react-native.
 * Todas as chamadas sao no-op silenciosos; o stub apenas satisfaz o bundler Metro.
 * A logica de feedback visual de notificacoes na web esta em
 * src/services/notifications.web.js (resolvido automaticamente pelo Expo web).
 */

const TriggerType = { TIMESTAMP: 0, INTERVAL: 1 };
const AndroidImportance = { HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1 };
const AuthorizationStatus = {
  AUTHORIZED: 1,
  PROVISIONAL: 2,
  DENIED: 0,
  NOT_DETERMINED: -1,
};

const notifee = {
  createChannel: async () => 'web-channel',
  requestPermission: async () => ({
    authorizationStatus: AuthorizationStatus.AUTHORIZED,
  }),
  getNotificationSettings: async () => ({
    authorizationStatus: AuthorizationStatus.AUTHORIZED,
  }),
  createTriggerNotification: async () => 'web-notif-id',
  cancelAllTriggerNotifications: async () => {},
  cancelAllNotifications: async () => {},
  onForegroundEvent: () => () => {},
  onBackgroundEvent: () => {},
};

export default notifee;
export { TriggerType, AndroidImportance, AuthorizationStatus };
