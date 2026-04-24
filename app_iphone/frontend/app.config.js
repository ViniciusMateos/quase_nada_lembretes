const IS_DEV = process.env.APP_VARIANT === 'development';

export default {
  expo: {
    name: IS_DEV ? 'QN Lembretes DEV' : 'Quase Nada Lembretes',
    slug: 'quase-nada-lembretes',
    version: '1.0.0',
    orientation: 'portrait',
    icon: IS_DEV ? './assets/icon-dev.png' : './assets/icon-prod.png',
    userInterfaceStyle: 'dark',
    ios: {
      bundleIdentifier: IS_DEV
        ? 'com.quasenada.lembretes.dev'
        : 'com.quasenada.lembretes',
      supportsTablet: false,
      infoPlist: {
        UIBackgroundModes: ['fetch', 'remote-notification'],
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
    plugins: ['expo-dev-client'],
    extra: {
      eas: {
        projectId: '1f724db0-72ef-4a9a-9ca4-6026fec5a1a1',
      },
    },
  },
};
