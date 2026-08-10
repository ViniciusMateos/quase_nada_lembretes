// Strings da área de Lembretes: tela, formulário (criar/editar), pré-lembretes,
// calendário e navegador de semanas.
//
// Conteúdo do usuário (título do lembrete) NÃO aparece aqui: é dele, não é
// interface. O mesmo vale pro `recurrence_str`, que vem pronto do backend.
export default {
  pt: {
    // Tela
    'reminders.title': 'Meus Lembretes',
    'reminders.editHint': 'Clique para editar · segure para criar tarefa',
    'reminders.releaseToCreateTask': 'Soltar para criar tarefa',
    'reminders.empty': 'Nenhum lembrete criado ainda.',
    'reminders.emptySubtext': 'Peça ao chat para criar um!',
    'reminders.loadError': 'Erro ao carregar lembretes. Puxe para atualizar.',
    'reminders.deleteA11y': 'Deletar lembrete {title}',

    // Exclusão
    'reminders.deleteTitle': 'Excluir lembrete',
    'reminders.deleteMessage': 'Deseja excluir "{title}"?',

    // Alertas
    'reminders.errorTitle': 'Erro',
    'reminders.deleteFailed': 'Não foi possível deletar o lembrete.',
    'reminders.updateFailed': 'Não foi possível atualizar o lembrete.',
    'reminders.taskFailed': 'Não foi possível criar a tarefa.',
    'reminders.taskDoneTitle': 'Pronto',
    'reminders.taskDoneMessage': 'Tarefa criada a partir do lembrete!',

    // Buckets da lista
    'reminders.bucket.nextWeek': 'Semana que vem',
    'reminders.bucket.inWeeks': 'Daqui {n} semanas',
    'reminders.bucket.nextMonth': 'Mês que vem',
    'reminders.bucket.noDate': 'Sem data',
    'reminders.section.recurring': 'Recorrentes',

    // Formulário
    'reminders.form.newTitle': 'Novo lembrete',
    'reminders.form.editTitle': 'Editar lembrete',
    'reminders.form.titleLabel': 'Título',
    'reminders.form.titlePlaceholder': 'Nome do lembrete',
    'reminders.form.recurrenceLabel': 'Recorrência',
    'reminders.form.weekdaysLabel': 'Dias da semana',
    'reminders.form.everyLabel': 'A cada',
    'reminders.form.dateLabel': 'Data',
    'reminders.form.startingLabel': 'A partir de',
    'reminders.form.selectDate': 'Selecionar data',
    'reminders.form.timeLabel': 'Horário',
    'reminders.form.preLabel': 'Me avise antes (opcional)',
    'reminders.form.preCountOne': '1 aviso antes',
    'reminders.form.preCountMany': '{n} avisos antes',

    // Erros de validação
    'reminders.error.titleRequired': 'Título é obrigatório',
    'reminders.error.pickDay': 'Selecione ao menos um dia',
    'reminders.error.pickDate': 'Selecione uma data',
    'reminders.error.interval': 'Informe um intervalo válido',

    // Unidades do intervalo
    'reminders.unit.minutes': 'minutos',
    'reminders.unit.hours': 'horas',
    'reminders.unit.days': 'dias',

    // Tipos de recorrência
    'reminders.recurrence.once': 'Único',
    'reminders.recurrence.daily': 'Todo dia',
    'reminders.recurrence.weeklyDays': 'Dias da semana',
    'reminders.recurrence.weekly': 'Toda semana',
    'reminders.recurrence.monthly': 'Todo mês',
    'reminders.recurrence.interval': 'Intervalo',

    // Rótulo do card (tom adverbial), diferente dos botões do formulário acima.
    'reminders.recurrence.weeklyLabel': 'Semanalmente',
    'reminders.recurrence.monthlyLabel': 'Mensalmente',
    'reminders.recurrence.dayOfMonth': 'Todo mês neste dia',
    'reminders.every.day': 'A cada dia',
    'reminders.every.days': 'A cada {n} dias',
    'reminders.every.hours': 'A cada {n}h',
    'reminders.every.minutes': 'A cada {n}min',
    'reminders.every.seconds': 'A cada {n}s',

    // Presets de dias
    'reminders.dayPreset.weekdays': 'Dias úteis',
    'reminders.dayPreset.weekend': 'Fim de semana',
    'reminders.dayPreset.everyDay': 'Todo dia',

    // Pré-lembretes
    'reminders.pre.quick': 'Rápidos',
    'reminders.pre.added': 'Adicionados',
    'reminders.pre.custom': 'Outro tempo antes',
    'reminders.pre.fixedDay': 'Num dia antes, em horário fixo',
    'reminders.pre.daysBeforeAt': 'dia(s) antes, às',
    'reminders.pre.add': 'Adicionar',
    'reminders.pre.preset.30min': '30 min',
    'reminders.pre.preset.1h': '1 h',
    'reminders.pre.preset.3h': '3 h',
    'reminders.pre.preset.1day': '1 dia',
    'reminders.pre.preset.1week': '1 sem',
    'reminders.pre.unit.min': 'min',
    'reminders.pre.unit.h': 'h',
    'reminders.pre.unit.d': 'dias',
    'reminders.pre.label.weeks': '{n} sem antes',
    'reminders.pre.label.dayOne': '1 dia antes',
    'reminders.pre.label.days': '{n} dias antes',
    'reminders.pre.label.hours': '{n} h antes',
    'reminders.pre.label.minutes': '{n} min antes',
    'reminders.pre.label.dayAtOne': '1 dia antes · {time}',
    'reminders.pre.label.dayAt': '{n} dias antes · {time}',

    // Calendário — iniciais dos dias, começando no domingo
    'reminders.cal.weekDayInitials': 'D,S,T,Q,Q,S,S',

    // Navegador de semanas
    'reminders.week.selectYear': 'Selecione o ano',
    'reminders.week.selectMonth': 'Selecione o mês',
    'reminders.week.n': 'Semana {n}',
    'reminders.week.todayTag': 'hoje',
    'reminders.week.previous': 'Semana anterior',
    'reminders.week.next': 'Próxima semana',
    'reminders.week.choose': 'Escolher semana',
  },
  en: {
    // Tela
    'reminders.title': 'My Reminders',
    'reminders.editHint': 'Tap to edit · hold to create a task',
    'reminders.releaseToCreateTask': 'Release to create a task',
    'reminders.empty': 'No reminders yet.',
    'reminders.emptySubtext': 'Ask the chat to create one!',
    'reminders.loadError': 'Could not load reminders. Pull to refresh.',
    'reminders.deleteA11y': 'Delete reminder {title}',

    // Exclusão
    'reminders.deleteTitle': 'Delete reminder',
    'reminders.deleteMessage': 'Delete "{title}"?',

    // Alertas
    'reminders.errorTitle': 'Error',
    'reminders.deleteFailed': 'Could not delete the reminder.',
    'reminders.updateFailed': 'Could not update the reminder.',
    'reminders.taskFailed': 'Could not create the task.',
    'reminders.taskDoneTitle': 'Done',
    'reminders.taskDoneMessage': 'Task created from the reminder!',

    // Buckets da lista
    'reminders.bucket.nextWeek': 'Next week',
    'reminders.bucket.inWeeks': 'In {n} weeks',
    'reminders.bucket.nextMonth': 'Next month',
    'reminders.bucket.noDate': 'No date',
    'reminders.section.recurring': 'Recurring',

    // Formulário
    'reminders.form.newTitle': 'New reminder',
    'reminders.form.editTitle': 'Edit reminder',
    'reminders.form.titleLabel': 'Title',
    'reminders.form.titlePlaceholder': 'Reminder name',
    'reminders.form.recurrenceLabel': 'Repeat',
    'reminders.form.weekdaysLabel': 'Days of the week',
    'reminders.form.everyLabel': 'Every',
    'reminders.form.dateLabel': 'Date',
    'reminders.form.startingLabel': 'Starting on',
    'reminders.form.selectDate': 'Select a date',
    'reminders.form.timeLabel': 'Time',
    'reminders.form.preLabel': 'Remind me before (optional)',
    'reminders.form.preCountOne': '1 alert before',
    'reminders.form.preCountMany': '{n} alerts before',

    // Erros de validação
    'reminders.error.titleRequired': 'Title is required',
    'reminders.error.pickDay': 'Pick at least one day',
    'reminders.error.pickDate': 'Pick a date',
    'reminders.error.interval': 'Enter a valid interval',

    // Unidades do intervalo
    'reminders.unit.minutes': 'minutes',
    'reminders.unit.hours': 'hours',
    'reminders.unit.days': 'days',

    // Tipos de recorrência
    'reminders.recurrence.once': 'One-time',
    'reminders.recurrence.daily': 'Daily',
    'reminders.recurrence.weeklyDays': 'Days of week',
    'reminders.recurrence.weekly': 'Weekly',
    'reminders.recurrence.monthly': 'Monthly',

    // Rótulo do card (tom adverbial), diferente dos botões do formulário acima.
    'reminders.recurrence.weeklyLabel': 'Every week',
    'reminders.recurrence.monthlyLabel': 'Every month',
    'reminders.recurrence.dayOfMonth': 'Monthly on this day',
    'reminders.every.day': 'Every day',
    'reminders.every.days': 'Every {n} days',
    'reminders.every.hours': 'Every {n}h',
    'reminders.every.minutes': 'Every {n}min',
    'reminders.every.seconds': 'Every {n}s',
    'reminders.recurrence.interval': 'Interval',

    // Presets de dias
    'reminders.dayPreset.weekdays': 'Weekdays',
    'reminders.dayPreset.weekend': 'Weekend',
    'reminders.dayPreset.everyDay': 'Every day',

    // Pré-lembretes
    'reminders.pre.quick': 'Quick',
    'reminders.pre.added': 'Added',
    'reminders.pre.custom': 'Another time before',
    'reminders.pre.fixedDay': 'A day before, at a fixed time',
    'reminders.pre.daysBeforeAt': 'day(s) before, at',
    'reminders.pre.add': 'Add',
    'reminders.pre.preset.30min': '30 min',
    'reminders.pre.preset.1h': '1 h',
    'reminders.pre.preset.3h': '3 h',
    'reminders.pre.preset.1day': '1 day',
    'reminders.pre.preset.1week': '1 wk',
    'reminders.pre.unit.min': 'min',
    'reminders.pre.unit.h': 'h',
    'reminders.pre.unit.d': 'days',
    'reminders.pre.label.weeks': '{n} wk before',
    'reminders.pre.label.dayOne': '1 day before',
    'reminders.pre.label.days': '{n} days before',
    'reminders.pre.label.hours': '{n} h before',
    'reminders.pre.label.minutes': '{n} min before',
    'reminders.pre.label.dayAtOne': '1 day before · {time}',
    'reminders.pre.label.dayAt': '{n} days before · {time}',

    // Calendário — iniciais dos dias, começando no domingo
    'reminders.cal.weekDayInitials': 'S,M,T,W,T,F,S',

    // Navegador de semanas
    'reminders.week.selectYear': 'Select the year',
    'reminders.week.selectMonth': 'Select the month',
    'reminders.week.n': 'Week {n}',
    'reminders.week.todayTag': 'today',
    'reminders.week.previous': 'Previous week',
    'reminders.week.next': 'Next week',
    'reminders.week.choose': 'Choose week',
  },
};
