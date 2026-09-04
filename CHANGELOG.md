# Changelog

Todas as mudanças notáveis deste projeto estão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).
Versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [Unreleased]

---

## [1.7.0] - 2026-09-04

### Adicionado
- feat: menu avisa OTA desatualizada + botão "Atualizar agora" — checa versão nova ao abrir e mostra "desatualizado" em amarelo; baixa e reabre com overlay "Atualizando…" (cachorro) em fade antes do reload

### Modificado
- update: prompt de pré-lembretes entende lista com a unidade só no fim ("30, 40 e 45 minutos antes" vira um aviso por número), e deixa claro que pré-lembrete é aviso ANTES do lembrete real
- update: splash escura no reload casa com o overlay — sem flash ao aplicar OTA (nativo, vale no build)

---

## [1.6.2] - 2026-08-17

### Fixed
- Notificação de **"lembrete criado" chegava dobrada** com o app fechado: o push do backend + uma notificação local do frontend (do background-fetch). Agora fechado/em background quem avisa é só o push; o frontend só notifica em foreground (banner in-app).
- O **título do push** vinha fixo em português ("Lembrete criado") mesmo com o inglês selecionado. Agora o app manda o idioma e o push monta o título no idioma certo ("Reminder created" / "Lembrete criado").

---

## [1.6.1] - 2026-08-13

### Added
- **Push do backend**: quando o backend cria um lembrete a partir de uma mensagem, ele mesmo dispara um push (Expo Push) — a notificação de "lembrete criado" chega mesmo com o app **fechado/matado**. Em foreground o push é suprimido (o feedback in-app cobre). Exige a entitlement `aps-environment` (vale a partir do build).
- **Adiar 30 min** na notificação — agora são três opções (5 / 10 / 30).

### Fixed
- **Lembrete duplicado ao enviar-e-sair**: a requisição chegava no servidor mas a resposta se perdia no background; o app reenfileirava e o backend recriava o lembrete. Agora cada mensagem carrega um `client_message_id` idempotente e o reenvio devolve o resultado já processado, sem duplicar.
- Lembrete **"em X segundos"** ia parar no dia seguinte (o horário truncado no minuto caía no passado e o alinhamento rolava um dia inteiro). Agora, se passou há pouco, dispara logo em seguida.

### Documentação
- README: push do backend implementado (não mais scaffolding).

---

## [1.6.0] - 2026-08-10

### Added
- **Notificações do chat dentro e fora do app**: qualquer resposta da IA (inclusive a pergunta de horário e a ambígua) avisa quando você não está vendo a conversa. Fora do app vira notificação real do iOS com som de "criado" (diferente do alarme de disparo); com o app aberto em outra tela, um **banner simulado** estilo iOS — desliza de cima, some sozinho, fecha no swipe pra cima e vai pro Chat ao tocar.
- **Enviar e sair do app** na hora ainda cria o lembrete e dispara a notificação de "criado" de fora (reenvio na janela de graça do iOS ou pelo background-fetch), sem o falso erro de offline.
- **Entrada do app sem piscar**: ao abrir por widget/notificação, um overlay (splash) segura até a tela-objetivo montar de fato; no launch normal o splash tem tempo mínimo e sai com fade.
- **Recorrência por minutos** no intervalo (além de horas e dias).
- **Versão OTA** no rodapé do menu ("OTA #N · atualizado/build") pra confirmar no device que o bundle novo baixou.
- Tocar na **aba já ativa** rola a lista pro topo.
- Widget de lista mostra **mais lembretes** (13 no grande, 5 no médio).

### Fixed
- Notificações locais não disparavam por causa do limite de 64 pendentes do iOS — agora agenda os 58 mais próximos por ordem de horário, e um re-sync em background cancela os "fantasmas" de lembretes desativados.
- Sem mais o **som dobrado** quando o lembrete chega com o app aberto, nem o som atrasado ao voltar pro app.
- Banner in-app aparece junto com o som, sem o atraso das chamadas de rede.

### Changed
- Enter no chat quebra linha; envio só pelo botão. Input do chat cresce animado a cada linha.
- Menu hamburguer fecha ao arrastar da esquerda pra direita, com a tela de trás inativa a toques enquanto aberto.
- Notificações separadas por tipo (lembrete/pré-aviso/ação/resumo) via thread do iOS.

---

## [1.5.0] - 2026-07-16

### Added
- App **bilíngue (português / inglês)**: idioma da interface escolhido por um toggle no menu, sem traduzir o conteúdo do usuário (título de lembrete/tarefa) nem o chat (a IA responde em português). O formato de hora (12h/24h) continua vindo do aparelho, não do idioma. A troca de idioma embaralha as letras (scramble) na transição.
- **Widgets nativos** (WidgetKit via `@bacons/apple-targets`): atalho "Criar lembrete", próximo lembrete na tela de bloqueio e a lista de próximos (em azul ou neutro), lendo os dados via App Group que o app grava a cada sync. Deep links dedicados por widget.
- **Notificações ricas** via extensão nativa: o resumo diário/semanal (pontuais e recorrentes separados) e o lembrete expandido com a dica de adiar discreta.
- **Pré-avisos ("me avise antes")** separados dos disparos reais no `/reminders/sync` (`pre_executions` com `at`/`target`/`lead_seconds`), cada um com notificação própria ("é daqui a X, às HH:MM").

### Fixed
- **Descrição de tarefa** não salvava ao ser esvaziada (o backend ignorava `notes: null`) nem refletia ao reabrir o modal na mesma sessão (buffer do `TextInput` multiline e closure congelado do `PanResponder`).

### Changed
- **Transição de tema** com cortina contínua — acaba o flash preto/branco e o engasgo do re-render. Alcança também os modais abertos.
- `AnimatedExpand` mede a altura real do conteúdo em vez de estimar; combobox/seções abrem e fecham sem pipocar.
- **Input do chat** sobe colado no teclado (padding único animado). Rolete de horário volta ao nativo, centralizado.
- **Tab bar** em cápsula (cantos 100% redondos, mais recuo) com ripple de gradiente contínuo (sombra nativa) e listas correndo até o fim da tela.
- `runtimeVersion` **fixo** (`'1.0.0'`), desamarrado da `version`, para bumpar a versão sem invalidar o OTA. Migração para `babel-preset-expo` (exigido pelo SDK 54).

---

## [1.4.0] - 2026-06-22

### Added
- Aba de **Tarefas** no app iOS: tarefas semanais por usuário (backend feature `tasks` em `/api/v1/tasks`), com prioridades (alta/média/baixa), anotações, conclusão e **carry-over** de pendentes entre semanas. Navegação de semanas com setas, swipe e picker ano → mês → semana (com destaque do dia/semana atuais).
- **Reordenação por arraste** das tarefas (segurar) dentro da mesma prioridade, com o espaço abrindo em tempo real e persistência via `order_index`.
- **Integração cruzada**: segure uma tarefa para criar um lembrete (com o nome da tarefa) e segure um lembrete para criar uma tarefa (com o nome do lembrete). Modal de lembrete extraído (`ReminderFormModal`) e reutilizado.
- Tab bar **liquid glass** (blur nativo via `expo-blur`) com pílula laranja, **ripple** no toque (luz contínua ao segurar, expande ao soltar), **squash** na transição e **swipe** na própria barra pra trocar de aba.
- **Data do dia** no topo do Chat e dos Lembretes; menu hambúrguer em **cards de vidro**.
- Animações: entrada **direcional** ao trocar de aba, conclusão (a tarefa desliza pra baixo) e exclusão (some com colapso) em tarefas e lembretes.

### Changed
- App abre sempre na aba **Chat**.
- No Lembrete, **segurar** passou a **criar tarefa** (antes abria menu de editar/excluir). Editar continua por toque; excluir pelo ✕.
- Dependências nativas novas: `expo-blur`, `expo-linear-gradient` (exigem novo build).

### Fixed
- Os modais de criar/editar (tarefa e lembrete) não quebram mais ao abrir data/hora **com o teclado aberto** — a altura do sheet passa a respeitar o espaço acima do teclado e o conteúdo rola por dentro.

---

## [1.3.0] - 2026-05-31

### Added
- Sons novos no chat: `normal-message.mp3` (toca quando a saudação inicial aparece) e `fah.mp3` (toca em qualquer mensagem com `isError`, centralizado no `addMessage`).
- Banner nativo em ações de lembrete: ao criar/editar/deletar pelo chat, dispara um `displayLocalNotification` silencioso ("Lembrete criado", "Lembrete editado", "Lembrete removido"). Funciona em foreground graças ao `foregroundPresentationOptions` no iOS. Vale tanto no envio direto quanto no drain da fila offline.
- Hint "segure para adiar" concatenado no body das notificações de lembrete (`scheduleFromSync`, `scheduleSnoozeNotification`, `scheduleServerReminderNotification`), pra deixar visível que há ações no long-press.
- Fade overlay no fim do scroll horizontal das pills de Recorrência (5 bands com opacity progressiva), sinalizando mais opções e dando acabamento na borda direita.
- Pull-to-refresh em Lembretes usando o `LoadingDog` (cachorrinho) como overlay no topo da lista — o `RefreshControl` nativo mantém o gesto, só fica com spinner invisível.

### Changed
- `SplashScreen` reestilizado no padrão do financas: fundo laranja `#FF8234` (era preto) com o cachorrinho branco dimensionado por `min(width * 0.6, 240)`.
- Transição entre as abas Chat ↔ Lembretes mais fluida: `lazy: false`, `freezeOnBlur: false` e `sceneContainerStyle` no Tab.Navigator + `useFocusEntrance` agora é uma entrada bem mais sutil (`opacity 0.85 → 1` em 140ms, era spring de 0).
- Drain da fila offline também roda quando o app volta pro foreground (listener de `AppState 'active'`), cobrindo o caso em que o NetInfo não dispara mudança porque a rede já estava ativa.
- Removida a menção a "Critical Alerts" na tela de Notificações — o app já usa Time-Sensitive Notifications, o aviso virou ruído.
- Removidos os emojis 📡 e ⏳ das mensagens "Sem conexão agora" e "enviado da fila" no chat.

### Fixed
- Erro `useNativeDriver` no toggle de tema do menu hamburguer: o `fadeAnim` virou `useNativeDriver: true` (opacity suporta nativamente) — antes era JS-driven e gerava `node moved to native earlier` por conflitar com o `slideAnim` nativo do drawer.

---

## [1.2.0] - 2026-05-29

### Added
- Edição de recorrência direto no app: ao alterar um lembrete dá pra escolher o tipo (único, diário, dias da semana, semanal, mensal, intervalo), tornar um pontual em recorrente ou remover a recorrência. O backend (`PATCH /reminders/{id}`) passa a aceitar `recurrence`, `days_of_week` e `interval_seconds` e recalcula a próxima execução.
- Animações no modal de editar lembrete: feedback de toque nas pílulas, tons distintos por setor, transição suave ao trocar de tipo, e calendário com abertura fluida + slide direcional ao passar os meses.

### Changed
- Cálculo de recorrência feito em horário de Brasília (UTC-3): corrige "seg a sex" começar na terça e faz o lembrete disparar hoje quando o horário ainda não passou.
- Notificação sempre toca o som do app — removida a opção de usar o som padrão do sistema. Mantida a notificação prioritária (furar modos de Foco).
- Campo de texto do chat continua editável durante o envio (só o botão de enviar fica inativo).

### Fixed
- Bottom sheet de editar lembrete agora fecha arrastando a barrinha pra baixo (gesto sensível, área de toque maior).
- Arrastar as pílulas dentro do modal não troca mais de tela (swipe pro Chat bloqueado com overlay aberto).
- Require cycle entre `AuthContext` e `client` resolvido extraindo o storage MMKV pra módulo próprio.

---

## [1.1.0] - 2026-05-26

### Added
- Recorrência por dias da semana (`weekly_days`): lembretes em vários dias ou em faixas — "de segunda a sexta", "terça e quinta", "dias úteis", "fim de semana" — interpretados pela IA e agendados em todos os dias do conjunto (nova coluna `days_of_week` com migração idempotente).
- Esclarecimento de horário no formato 12h: quando o horário é ambíguo (ex: "às 9h" sem manhã/noite), a IA pergunta se é de manhã ou à noite antes de criar o lembrete; o app envia o `hour_format` do usuário.
- Scaffolding de push notifications: tabela `push_tokens`, endpoint `POST /push/register` e telas/serviços de notificação no app (o envio de push fica para a fase 2).
- Endpoint `POST /reminders` para criar lembretes diretamente (usado pelo "adiar" de lembretes pontuais).
- Suíte de QA (testes de ponta a ponta da API) e script de auditoria de lembretes no banco.

### Changed
- Bot do Telegram reescrito como cliente do backend FastAPI: passa a usar a mesma IA, a mesma lógica de recorrência (incl. dias da semana) e o mesmo banco do app, em vez de IA, banco e agendamento próprios. Dependências enxugadas (remove `google-generativeai`, `sqlalchemy` e `number-parser`; adiciona `httpx`).
- Listagem de lembretes com `limit` alto para casar a aba com o `/sync`, corrigindo o caso "dispara mas não aparece na lista".

---

## [1.0.0] - 2026-05-08

Primeira versão estável do **Quase Nada Lembretes** para iOS.

### Changed
- Cadeia de fallback de modelos Gemini ampliada de 6 para 11 modelos, incluindo `gemini-3.1-flash-lite` (500 RPD) e `gemma-3-27b-it` / `gemma-3-12b-it` como reserva de emergência (14.4K RPD)
- Prompt de classificação de intenção reestruturado: prefixo estático separado do sufixo dinâmico, ativando o implicit caching automático do Gemini a partir da segunda requisição
- Timeout de 8s por chamada à API (SDK) + 10s de hard limit via `asyncio.wait_for` — modelos lentos não travam a fila
- `retry=None` no SDK do Gemini: erros 429 propagam imediatamente sem backoff interno, passando direto para o próximo modelo da cadeia
- Adicionados exemplos few-shot para `CHAT_GERAL`, `LISTAR_LEMBRETES` e `DELETAR_LEMBRETE` no prompt de classificação

### Known Issues
- App expira em 7 dias se instalado via Sideloadly com conta gratuita Apple

---

## [0.6.0] - 2026-05-07

### Added
- Hub de contas na autenticação, com contas salvas localmente, login rápido por conta e remoção de conta da lista
- Endpoint `DELETE /api/v1/auth/account` e fluxo de exclusão definitiva de conta no app
- Seletor visual de cor do avatar na tela Conta, persistido por conta salva
- Componentes `CalendarPicker`, `TimePicker`, `TimePickerNative` e `utils/timeFormat.js` para edição visual de data/hora
- Suporte a `@react-native-community/datetimepicker` no frontend iOS

### Changed
- LoadingDog padronizado comoMover as variáveis pro final é a mudança de 2 minutos que ativa o cache automático em todas as requisições único loading do app, incluindo botões, splash, tela de lembretes e indicador de IA processando
- Tela de edição de lembrete trocou inputs manuais de data/hora por calendário e seletor de horário com animação expansível
- ActionSheet passou a abrir como menu contextual ancorado no toque longo de mensagens e lembretes
- ConfirmDialog recebeu animação customizada de fade/scale e overlay clicável
- Auth stack agora inicia no hub de contas e respeita o tema atual no fundo da navegação
- Telas de Login, Register e AccountHub usam controles superiores consistentes para voltar e alternar tema
- Chat envia `client_timestamp` com offset local explícito e aumenta timeout de mensagens para 90s
- Cliente Gemini passou a usar chamadas assíncronas, fallback com cache de quota por modelo e menor limite de tokens para chat geral
- Processamento de mensagens inicia resposta de chat geral de forma especulativa enquanto classifica intenção

### Fixed
- LoadingDog não para mais após uma volta no web e mantém cachorro e arco com a mesma cor
- Swipe lateral do Chat não é acionado enquanto o campo de mensagem está focado
- Senhas em Login, Register e Alterar senha removem emojis antes do envio
- Toggle de tema em telas de autenticação mantém fade consistente no web
- Sincronização silenciosa após falha de rede no Chat evita mensagem duplicada quando o servidor processou a ação
- Formatação de horário respeita relógio 12h/24h do dispositivo em mensagens e lembretes

---

## [0.5.0] - 2026-05-06

### Added
- Endpoint `PATCH /api/v1/reminders/{id}` para editar título e data/hora de lembretes existentes
- `EditReminderModal` em RemindersScreen com hint "clique para editar"
- Componente `LoadingDog` (apenas-cachorro.png + anel animado) substituindo `ActivityIndicator` nos loadings de tela
- `EyeIcon` com risco diagonal em Login e Register (visível = sem risco, oculto = com risco)
- Tab Bar footer garantido em toda a navegação; swipe `PanResponder` em Chat (←Lembretes) e Reminders (→Chat)
- Novos componentes: `ActionSheet`, `ConfirmDialog`, `HamburgerMenu`, `PressableScale`, `ChevronIcon`
- Sons de envio e recebimento de mensagens no Chat (`sounds.js`)
- `hooks/useFocusEntrance.js` para animações de entrada
- Refresh tokens com rotação automática — access token expira em 60 min, refresh token em 90 dias (hash SHA-256 no banco)
- Interceptor axios que renova o access token silenciosamente e enfileira requests concorrentes durante o refresh
- Web preview local do app iOS via `expo start --web` (`npm run web`)
- `webpack.config.js` com aliases para stubs de libs nativas (@notifee, react-native-mmkv) no bundle web
- `src/stubs/notifee.web.js` — stub no-op para @notifee/react-native
- `src/stubs/mmkv.web.js` — MMKV via localStorage para persistência de tokens na web
- `src/services/notifications.web.js` — toast DOM visual simulando notificações locais no browser

### Changed
- Frontend inclui `react-native-web`, `react-dom` e `@expo/webpack-config` (compatíveis com Expo SDK 51)
- `Alert.alert` com opção `userInterfaceStyle` agora condicionado a `Platform.OS === 'ios'`
- RemindersScreen migrado para `useTheme()`

### Fixed
- Bug de 401 que não redirecionava para Login por conflito entre estado React e navegação
- Bolha de erro vermelha, fuso local e recuperação de rede no Chat
- Grace period no sync e normalização de timestamps BRT para UTC
- `next_execution` avança em loop no scheduler para não travar em lembretes recorrentes
- Race condition e fuso horário na confirmação de lembrete criado

---

## [0.4.0] - 2026-04-27

### Added
- Navegação por swipe entre as abas Chat e Lembretes
- Toggle de tema (sol/lua) no menu hamburguer
- Ícone de conta e botão de visualizar senha nas telas de autenticação

### Changed
- Menu hamburguer compartilhado entre Chat e Lembretes
- Frontend preparado para uso de `@react-navigation/material-top-tabs` e `react-native-pager-view`

### Fixed
- Scheduler backend com timezone UTC explícito (`AsyncIOScheduler(timezone=pytz.utc)`)
- Dependência `pytz` adicionada ao backend para suporte consistente de timezone
- Ajustes de tema em componentes de mensagens e tela de lembretes

---

## [0.3.0] - 2026-04-24

### Added
- Tema claro/escuro com persistencia local no app
- Menu hamburguer com Conta, Alterar Senha e Sair
- Endpoint `PUT /api/v1/auth/password` para troca de senha autenticada
- Setup de Docker + CI/CD + deploy Oracle via SSH documentado

### Changed
- Mensagem de lembrete criado com destaque visual no chat
- Labels de recorrencia mais legiveis (`Unico`, `A cada 4h`, etc.)
- Prompt de IA reforcado para distinguir lembretes unicos vs recorrentes

### Fixed
- BUG-01: lista atualiza apos deletar sem reiniciar app
- BUG-02: cor das mensagens do usuario ajustada para `#FF8234`
- BUG-03: logo reduzida em Login/Register
- BUG-04: IA para de classificar lembrete unico como recorrente
- BUG-05: correcao de fuso horario usando `client_timestamp`

---

## [0.2.0] - 2026-04-23

### Added
- Aba de Lembretes (Bottom Tab Navigator) — lista todos os lembretes ativos agrupados em "Próximos" (uma vez) e "Recorrentes", com pull-to-refresh e delete por item com confirmação
- Saudação personalizada no Chat — bom dia/tarde/noite/madrugada com nome do usuário baseada no horário atual, exibida a cada abertura do chat
- Logo do Quase Nada nas telas de Login e Cadastro — responsivo (40% da tela, max 160px), PNG com fundo transparente

### Changed
- Rebranding de cor: `#7C3AED` (roxo) → `#FF8234` (laranja) em toda a UI — LoginScreen, RegisterScreen, ChatScreen, AppNavigator
- Dependência adicionada: `@react-navigation/bottom-tabs ^6.5.0`

### Fixed
- **BUG-FE-01:** Login com senha errada causava redirecionamento silencioso para a tela de login em vez de exibir mensagem de erro — interceptor axios corrigido para não chamar `logout()` em rotas `/auth/`
- **BUG-FE-02:** Campo de texto do chat não limpava após envio no iOS — `inputRef.current?.clear()` adicionado para sincronizar o buffer nativo do TextInput multiline
- **BUG-FE-03:** Campo de senha não limpava após erro de login — `setPassword('')` adicionado no catch de LoginScreen
- **BUG-BE-01:** Lembretes `once` com horário vencido permaneciam com `is_active=1` no banco, causando spam de notificações ao fazer login — `sync_reminders` agora desativa esses lembretes via `UPDATE` antes do `SELECT`

---

## [0.1.0] - 2026-04-17

Primeira versão do **iOS App** conectando ao servidor de produção (Oracle Cloud, Ubuntu 24.04).
O app substitui a interface do Telegram por um chat nativo no iPhone com notificações locais.

### Added
- App iOS com React Native 0.74 + Expo SDK 51
- Tela de cadastro e login com JWT (token válido por 7 dias)
- Tela de chat com IA (Gemini) para criar, listar e deletar lembretes via linguagem natural
- Notificações locais via `@notifee/react-native` agendadas no próprio dispositivo
- Botão de logout no header do chat
- `ErrorBanner` com botão "ver logs" em todas as telas de erro — exibe código HTTP, URL chamada e corpo da resposta para diagnóstico
- Backend FastAPI deployado como systemd service (`quase-nada-ios.service`) no servidor de produção
- Estrutura separada no servidor: `quase_nada_lembretes/telegram/` e `quase_nada_lembretes/ios_app/`

### Fixed
- `API_BASE_URL` não era injetada no build EAS (variável `undefined` em todas as requisições) — corrigido via `env` no `eas.json`
- iOS bloqueava requisições HTTP por padrão (ATS) — corrigido com `NSAllowsArbitraryLoads: true` no `infoPlist`
- `expo-modules-core@55.x` incompatível com Expo SDK 51 — removido das dependências diretas
- Versões desatualizadas de `react-native-gesture-handler`, `react-native-screens`, `react-native-safe-area-context` — corrigidas para versões compatíveis com Expo 51
- `cancelAllNotifications()` não cancelava notificações agendadas (trigger) no @notifee v9 — substituído por `cancelAllTriggerNotifications()` + `cancelAllNotifications()`
- `UIBackgroundModes` duplicado no `app.json`
- `.expo/` não estava no `.gitignore`, causando falha no `expo doctor` durante o build

### Infrastructure
- Servidor de produção: Oracle Cloud `147.15.7.119` (Ubuntu 24.04, Python 3.12)
- Backend disponível em `http://147.15.7.119:8000`
- Builds iOS via EAS Build (Expo Application Services) — plano gratuito
- Distribuição interna via QR code (Ad Hoc provisioning, Apple Developer Program)

---

## [0.0.x] — Telegram Bot (histórico anterior)

Versão original do projeto — bot no Telegram para gerenciamento de lembretes via linguagem natural.

### Features implementadas
- Interpretação de linguagem natural via Google Gemini para criação de lembretes
- Agendamento com APScheduler — notificações via Telegram no horário definido
- Suporte a recorrência: diária, semanal, mensal, por dia do mês, intervalo customizado
- Comando `/listar` para ver lembretes ativos
- Comando `/cancelar` para remover lembretes
- Histórico persistido em SQLite
- Correções de fuso horário (America/São_Paulo)
- Normalização de títulos para busca e deduplicação
- Rotação automática de modelos Gemini em caso de quota esgotada
