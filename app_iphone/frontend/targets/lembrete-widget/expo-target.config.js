/**
 * Target do widget (WidgetKit) via @bacons/apple-targets.
 * NÃO está ativo por padrão — ver targets/lembrete-widget/WIDGET.md pra ligar.
 * Deixado isolado de propósito: um target nativo malformado faria o EAS build
 * inteiro falhar, então ele só entra quando você for buildar o widget.
 */
module.exports = {
  type: 'widget',
  name: 'LembreteWidget',
  icon: '../../assets/icon-prod.png',
  colors: {
    $accent: '#0A84FF',
  },
  // Gera o Assets.xcassets do target — vira Image("logo") no Swift.
  // É a logo oficial (cachorro no círculo), não o apenas-cachorro do LoadingDog.
  images: {
    logo: '../../assets/logo.png',
  },
  // Mesmo App Group do app: é por aqui que o widget de lista lê os próximos
  // lembretes que o app gravou (via ExtensionStorage no JS).
  entitlements: {
    'com.apple.security.application-groups': ['group.com.quasenada.lembretes'],
  },
  deploymentTarget: '17.0',
};
