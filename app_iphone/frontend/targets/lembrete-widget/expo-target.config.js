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
  deploymentTarget: '17.0',
};
