/**
 * Notification Content Extension — UI custom da notificação-resumo expandida.
 * Casa com o categoryId "resumo" setado nas notificações-resumo (notifications.js).
 * NÃO ativo por padrão (ver README.md). Isolado de propósito pra não quebrar o build.
 *
 * IMPORTANTE: o Info.plist da extensão precisa ter, dentro de
 * NSExtension.NSExtensionAttributes:
 *   UNNotificationExtensionCategory = "resumo"
 *   UNNotificationExtensionInitialContentSizeRatio = 0.6
 * O @bacons/apple-targets gera o Info.plist do target — confira/ajuste esses
 * campos ao ativar (ver README.md).
 */
module.exports = {
  type: 'notification-content',
  name: 'ResumoNotif',
  deploymentTarget: '17.0',
  // Gera o Assets.xcassets da extensão — vira UIImage(named: "logo") no Swift.
  images: {
    logo: '../../assets/logo.png',
  },
  // A categoria da extensão (UNNotificationExtensionCategory) NÃO é configurável
  // por aqui: o plugin ignora `infoPlist` e só escreve o Info.plist do template
  // se ele não existir. Por isso o Info.plist mora ao lado deste arquivo, escrito
  // à mão, com as categorias 'lembrete' e 'resumo'. Não recriar via config.
};
