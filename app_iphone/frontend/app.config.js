const IS_DEV = process.env.APP_VARIANT === 'development';

export default {
  expo: {
    name: IS_DEV ? 'QN Lembretes DEV' : 'Quase Nada Lembretes',
    slug: 'quase-nada-lembretes',
    version: '1.5.0',
    // URL scheme p/ deep link (widget "clique para ser lembrado" → abre o Chat).
    scheme: 'quasenadalembretes',
    orientation: 'portrait',
    icon: IS_DEV ? './assets/icon-dev.png' : './assets/icon-prod.png',
    userInterfaceStyle: 'dark',
    // SDK 54: New Architecture (exigida pelo react-native-mmkv v3).
    newArchEnabled: true,
    // OTA updates (expo-updates): recarrega o JS de um build já instalado sem
    // precisar de novo build. runtimeVersion FIXO (não policy:appVersion) de
    // propósito: desamarra a versão de marketing (`version`) da camada nativa.
    // Assim dá pra bumpar `version` à vontade e o OTA continua chegando. Só
    // MUDAR este número quando o código NATIVO mudar (widget, dependência nativa,
    // entitlement) — senão um app antigo baixaria um JS que espera algo que ele
    // não tem. Canal definido por perfil no eas.json.
    runtimeVersion: '1.0.0',
    updates: { url: 'https://u.expo.dev/1f724db0-72ef-4a9a-9ca4-6026fec5a1a1' },
    ios: {
      bundleIdentifier: IS_DEV
        ? 'com.quasenada.lembretes.dev'
        : 'com.quasenada.lembretes',
      // Team ID da conta Apple. Os targets nativos (widget/extensão) precisam
      // dele pra assinar o App Group.
      appleTeamId: '4F7QHTY86S',
      supportsTablet: false,
      entitlements: {
        // Time-Sensitive Notifications: fura modos de Foco sem depender do
        // Critical Alerts (que exigiria aprovação manual da Apple).
        'com.apple.developer.usernotifications.time-sensitive': true,
        // App Group: área compartilhada entre o app e os widgets. O app grava os
        // próximos lembretes aqui (ExtensionStorage) e o widget de lista lê.
        'com.apple.security.application-groups': ['group.com.quasenada.lembretes'],
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
      // SDK 54 pediu o plugin explícito do datetimepicker.
      '@react-native-community/datetimepicker',
      // Targets nativos iOS (widget de tela de bloqueio + UI custom da
      // notificação-resumo). Ele descobre sozinho os targets pelos
      // targets/*/expo-target.config.js. Só entra em vigor no build.
      '@bacons/apple-targets',
    ],
    extra: {
      eas: {
        projectId: '1f724db0-72ef-4a9a-9ca4-6026fec5a1a1',
      },
    },
  },
};
