const IS_DEV = process.env.APP_VARIANT === 'development';

export default {
  expo: {
    name: IS_DEV ? 'QN Lembretes DEV' : 'Quase Nada Lembretes',
    slug: 'quase-nada-lembretes',
    version: '1.4.0',
    orientation: 'portrait',
    icon: IS_DEV ? './assets/icon-dev.png' : './assets/icon-prod.png',
    userInterfaceStyle: 'dark',
    ios: {
      bundleIdentifier: IS_DEV
        ? 'com.quasenada.lembretes.dev'
        : 'com.quasenada.lembretes',
      supportsTablet: false,
      entitlements: {
        // Time-Sensitive Notifications: fura modos de Foco sem depender do
        // Critical Alerts (que exigiria aprovação manual da Apple).
        'com.apple.developer.usernotifications.time-sensitive': true,
      },
      infoPlist: {
        UIBackgroundModes: ['fetch', 'processing', 'remote-notification'],
        NSUserNotificationUsageDescription:
          'Usado para enviar lembretes no horário agendado.',
        ITSAppUsesNonExemptEncryption: false,
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
        },
      },
    },
    android: {
      package: IS_DEV
        ? 'com.quasenada.lembretes.dev'
        : 'com.quasenada.lembretes',
    },
    plugins: [
      'expo-dev-client',
      'expo-av',
      // Empacota o som de lembrete no bundle nativo (iOS e Android res/raw),
      // para o Notifee tocar o som próprio em vez do padrão do sistema.
      ['expo-notifications', { sounds: ['./assets/sound-reminder.wav'] }],
    ],
    extra: {
      eas: {
        projectId: '1f724db0-72ef-4a9a-9ca4-6026fec5a1a1',
      },
    },
  },
};
