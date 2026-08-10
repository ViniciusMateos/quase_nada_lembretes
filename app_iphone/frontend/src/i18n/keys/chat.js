// Casca do chat: cabeçalho, input, banners, menu e rótulos das abas.
// As MENSAGENS (texto do usuário e resposta da IA) não passam por aqui — a IA
// responde em português de propósito.
export default {
  pt: {
    'chat.tab.tasks': 'Tarefas',
    'chat.tab.chat': 'Chat',
    'chat.tab.reminders': 'Lembretes',

    'chat.inputPlaceholder': 'Digite uma mensagem...',
    'chat.inputA11y': 'Campo de mensagem',
    'chat.sendA11y': 'Enviar mensagem',
    'chat.menuA11y': 'Menu',

    'chat.greeting': '{period}, {name}! O que você deseja se lembrar?',
    'chat.greeting.you': 'você',
    'chat.greeting.dawn': 'Boa madrugada',
    'chat.greeting.morning': 'Bom dia',
    'chat.greeting.afternoon': 'Boa tarde',
    'chat.greeting.evening': 'Boa noite',

    'chat.banner.created': 'Lembrete criado',
    'chat.banner.updated': 'Lembrete editado',
    'chat.banner.deleted': 'Lembrete removido',
    'chat.banner.fallback': 'Lembrete',

    'chat.queuedNote': 'enviado da fila (você estava sem conexão)',
    'chat.error.notConfirmed': 'Não consegui confirmar esse lembrete na sua lista. Pode tentar de novo?',
    'chat.error.offline': 'Sem conexão agora.\nVou enviar assim que a internet voltar.',
    'chat.error.server': 'Não consegui me conectar ao servidor.\n{err}\nTente novamente.',
    'chat.error.status': 'ERRO {status}',
    'chat.error.unknown': 'ERRO DESCONHECIDO',
    'chat.deleteOk': 'Lembrete deletado com sucesso!',
    'chat.deleteFail': 'Não consegui deletar o lembrete. Tente novamente.',

    'chat.copyText': 'Copiar texto',
    'chat.reminderCreated': 'Lembrete criado!',
    'chat.reminderCreatedRecurring': 'Lembrete recorrente criado!',
    'chat.reminderFrom': 'a partir de',
    'chat.reminderDate': 'data',

    'chat.menu.title': 'Configurações',
    'chat.menu.theme': 'Alterar tema',
    'chat.menu.notifications': 'Notificações',
    'chat.menu.otaUpdated': 'atualizado',
    'chat.menu.otaEmbedded': 'build',
  },
  en: {
    'chat.tab.tasks': 'Tasks',
    'chat.tab.chat': 'Chat',
    'chat.tab.reminders': 'Reminders',

    'chat.inputPlaceholder': 'Type a message...',
    'chat.inputA11y': 'Message field',
    'chat.sendA11y': 'Send message',
    'chat.menuA11y': 'Menu',

    'chat.greeting': '{period}, {name}! What would you like to be reminded of?',
    'chat.greeting.you': 'there',
    'chat.greeting.dawn': 'Good night',
    'chat.greeting.morning': 'Good morning',
    'chat.greeting.afternoon': 'Good afternoon',
    'chat.greeting.evening': 'Good evening',

    'chat.banner.created': 'Reminder created',
    'chat.banner.updated': 'Reminder updated',
    'chat.banner.deleted': 'Reminder removed',
    'chat.banner.fallback': 'Reminder',

    'chat.queuedNote': 'sent from the queue (you were offline)',
    'chat.error.notConfirmed': "I couldn't confirm that reminder in your list. Want to try again?",
    'chat.error.offline': "You're offline right now.\nI'll send it as soon as the connection is back.",
    'chat.error.server': "I couldn't reach the server.\n{err}\nPlease try again.",
    'chat.error.status': 'ERROR {status}',
    'chat.error.unknown': 'UNKNOWN ERROR',
    'chat.deleteOk': 'Reminder deleted successfully!',
    'chat.deleteFail': "I couldn't delete the reminder. Please try again.",

    'chat.copyText': 'Copy text',
    'chat.reminderCreated': 'Reminder created!',
    'chat.reminderCreatedRecurring': 'Recurring reminder created!',
    'chat.reminderFrom': 'starting',
    'chat.reminderDate': 'date',

    'chat.menu.title': 'Settings',
    'chat.menu.theme': 'Change theme',
    'chat.menu.notifications': 'Notifications',
    'chat.menu.otaUpdated': 'updated',
    'chat.menu.otaEmbedded': 'build',
  },
};
