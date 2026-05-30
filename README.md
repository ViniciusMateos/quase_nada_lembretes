# Quase Nada Lembretes

Assistente pessoal de lembretes com inteligência artificial. Você escreve em linguagem natural — "me lembra de ligar pro médico amanhã às 10h" — e o app interpreta, agenda e dispara a notificação no horário certo.

O projeto existe em duas versões:

| Versão | Descrição | Stack |
|--------|-----------|-------|
| **Telegram Bot** | Cliente do backend do app — mesma IA, recorrência e banco | python-telegram-bot + httpx |
| **App iOS** | Versão atual em desenvolvimento | React Native + FastAPI + Gemini AI + SQLite |

---

## Sumário

- [Pré-requisitos](#pré-requisitos)
- [Telegram Bot — Quickstart](#telegram-bot--quickstart)
- [App iOS — Quickstart](#app-ios--quickstart)
  - [Backend (FastAPI)](#backend-fastapi)
  - [Frontend (React Native)](#frontend-react-native)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Referência da API](#referência-da-api)
- [Arquitetura](#arquitetura)
- [Troubleshooting](#troubleshooting)

---

## Pré-requisitos

### Para o Telegram Bot

- Python 3.10+
- Uma conta no Telegram
- Token de bot obtido via [@BotFather](https://t.me/botfather)
- O **backend do app iOS rodando** (o bot é um cliente dele — veja [Backend (FastAPI)](#backend-fastapi)). A chave do Gemini fica no backend, não no bot.

### Para o App iOS

- Python 3.10+ (backend)
- Node.js 18+ (frontend)
- Conta na [Expo](https://expo.dev) (build na nuvem)
- Conta no [Apple Developer Program](https://developer.apple.com/programs/) — necessária para distribuição no iPhone
- Chave de API do [Google Gemini](https://aistudio.google.com/app/apikey)

---

## Telegram Bot — Quickstart

```bash
# 1. Clone o repositório
git clone <url-do-repo>
cd quase_nada_lembretes

# 2. Crie e ative o ambiente virtual
python -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate  # Linux/Mac

# 3. Instale as dependências
pip install -r requirements.txt

# 4. Configure as variáveis de ambiente
# Crie um arquivo .env na raiz com o conteúdo:
# TELEGRAM_TOKEN=seu_token_aqui
# BACKEND_URL=http://127.0.0.1:8000   # base do backend FastAPI (padrão)

# 5. Suba o backend do app (em outra aba) — o bot depende dele
#    (veja a seção "Backend (FastAPI)" abaixo)

# 6. Execute o bot
python quase_nada_lembretes.py
```

O bot estará online. No Telegram, envie `/start` para começar.

> O bot não tem mais IA, banco nem agendamento próprios: cada chat vira um usuário no backend (registro/login automáticos, sessões em `tg_sessions.json`), as mensagens vão para `POST /messages` e os lembretes são disparados consultando `/reminders/sync` periodicamente.

**Comandos disponíveis no bot:**

| Comando / Mensagem | Ação |
|--------------------|------|
| `/start` | Apresenta o bot |
| Texto livre | A IA do backend interpreta e agenda / lista / edita / cancela o lembrete |
| Áudio | Não suportado — o bot responde pedindo texto |

---

## App iOS — Quickstart

O app iOS tem dois componentes independentes: backend e frontend. Ambos precisam estar rodando para o app funcionar.

### Backend (FastAPI)

```bash
# 1. Entre na pasta do backend
cd app_iphone/backend

# 2. Crie e ative o ambiente virtual
python -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate  # Linux/Mac

# 3. Instale as dependências
pip install -r requirements.txt

# 4. Configure as variáveis de ambiente
# Copie o exemplo e preencha os valores:
# DATABASE_URL=sqlite+aiosqlite:///./lembretes.db
# JWT_SECRET=gere-uma-string-aleatoria-de-32-chars-ou-mais
# GOOGLE_API_KEY=sua_chave_gemini_aqui

# 5. Inicialize o banco de dados
python init_db.py

# 6. Inicie o servidor
uvicorn src.main:app --reload --port 8000
```

O servidor estará disponível em `http://localhost:8000`.
Documentação interativa (Swagger): `http://localhost:8000/docs`

**Para gerar um JWT_SECRET seguro:**
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### Frontend (React Native)

```bash
# 1. Entre na pasta do frontend
cd app_iphone/frontend

# 2. Instale as dependências
npm install

# 3. Faça login na Expo CLI
npx eas login

# 4. Compile e instale no iPhone (requer Apple Developer Program)
eas build --platform ios --profile preview
```

### Web Preview local (browser)

Use este fluxo para visualizar o app iOS no navegador antes de gerar um build EAS.

```bash
# Terminal 1 - backend
cd app_iphone/backend
venv\Scripts\activate
python init_db.py
uvicorn src.main:app --reload --port 8000

# Terminal 2 - frontend web
cd app_iphone/frontend
npm install
npm run web
```

Configure o backend local para aceitar as portas do Expo web:

```env
CORS_ORIGINS=http://localhost:8081,http://localhost:19006,http://127.0.0.1:8081,http://127.0.0.1:19006
```

Configure o frontend local para chamar o backend:

```env
API_BASE_URL=http://147.15.7.119:8000
```

`API_BASE_URL` e usado pelo app iOS/Android, pelos builds EAS e pela preview web local.

A preview web usa `metro.config.js` para trocar bibliotecas nativas por stubs apenas em `platform === 'web'`:

- `react-native-mmkv` -> `src/stubs/mmkv.web.js`
- `@notifee/react-native` -> `src/stubs/notifee.web.js`
- notificacoes locais -> `src/services/notifications.web.js` com toast visual

Para validar o bundle web sem abrir servidor interativo:

```bash
npx expo export --platform web --output-dir dist-web-qa
```

`dist-web-qa/` e apenas artefato temporario de QA e pode ser removido apos a validacao.

### Regras de release (Expo/Metro)

- `npx expo start` e Metro cobrem desenvolvimento local e mudanças JavaScript.
- `eas update` (OTA) deve ser usado apenas para mudanças sem dependências nativas.
- Quando entrar dependência nativa (ex.: `react-native-pager-view`), é obrigatório gerar novo build iOS com `eas build`.

Após o build (~15 minutos), a Expo disponibilizará um link para download do arquivo `.ipa`. Instale no iPhone com [Sideloadly](https://sideloadly.io/) (Windows/Mac).

**Instalando com Sideloadly:**
1. Conecte o iPhone ao computador via USB
2. Abra o Sideloadly, arraste o `.ipa` para a janela
3. Insira seu Apple ID e clique em **Start**
4. No iPhone: Ajustes → Geral → VPN e Gerenciamento de Dispositivo → confie no certificado

---

## Variáveis de Ambiente

### Telegram Bot (`.env` na raiz)

| Variável | Obrigatório | Descrição |
|----------|:-----------:|-----------|
| `TELEGRAM_TOKEN` | ✅ | Token do bot obtido via @BotFather |
| `BACKEND_URL` | ❌ | Base do backend FastAPI que o bot consome (padrão: `http://127.0.0.1:8000`) |

### Backend iOS (`app_iphone/backend/.env`)

| Variável | Obrigatório | Exemplo | Descrição |
|----------|:-----------:|---------|-----------|
| `DATABASE_URL` | ✅ | `sqlite+aiosqlite:///./lembretes.db` | URL do banco de dados (SQLAlchemy async) |
| `JWT_SECRET` | ✅ | `5a037c6a04dfcf4647...` | Segredo para assinar tokens JWT (mín. 32 chars) |
| `GOOGLE_API_KEY` | ✅ | `AIzaSyD...` | Chave da API Google Gemini |
| `JWT_ALGORITHM` | ❌ | `HS256` | Algoritmo de assinatura JWT (padrão: HS256) |
| `JWT_EXPIRE_DAYS` | ❌ | `7` | Validade do token em dias (padrão: 7) |
| `CORS_ORIGINS` | ❌ | `*` | Origens CORS permitidas. Em produção, especifique explicitamente |
| `APP_ENV` | ❌ | `production` | Ambiente da aplicação |

---

## Referência da API

Base URL local: `http://localhost:8000`
Autenticação: Bearer Token (JWT) — obtido via `POST /auth/login`

Todos os endpoints autenticados exigem o header:
```
Authorization: Bearer <seu_token_jwt>
```

---

### Autenticação

#### `POST /auth/register` — Cadastrar usuário

**Request:**
```json
{
  "email": "usuario@exemplo.com",
  "password": "minhasenha123",
  "name": "Vinicius"
}
```

**Response 201:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 604800,
  "user": {
    "id": "usr_01HXYZ...",
    "email": "usuario@exemplo.com",
    "name": "Vinicius",
    "created_at": "2026-04-15T10:00:00Z"
  }
}
```

**Response 409** (e-mail já cadastrado):
```json
{ "detail": "Email already registered." }
```

---

#### `POST /auth/login` — Autenticar usuário

**Request:**
```json
{
  "email": "usuario@exemplo.com",
  "password": "minhasenha123"
}
```

**Response 200:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 604800,
  "user": {
    "id": "usr_01HXYZ...",
    "email": "usuario@exemplo.com",
    "name": "Vinicius",
    "created_at": "2026-04-15T10:00:00Z"
  }
}
```

**Response 401** (credenciais inválidas):
```json
{ "detail": "Invalid credentials." }
```

---

### Mensagens (Chat com IA)

#### `POST /messages` — Enviar mensagem para o assistente

Envia uma mensagem em linguagem natural. A IA interpreta a intenção (`reminder`, `list`, `delete`, `chat`) e executa a ação correspondente.

**Request:**
```json
{
  "content": "me lembra de ligar pro dentista amanhã às 9h",
  "client_timestamp": "2026-04-15T22:00:00-03:00",
  "hour_format": "24h"
}
```

`hour_format` (`"12h"` ou `"24h"`, padrão `"24h"`) indica o formato de hora do usuário. Quando é `"12h"` e o horário é ambíguo (ex.: "às 9h" sem manhã/noite), a resposta vem com `action.type = "needs_time_clarification"` e o app pergunta se é de manhã ou à noite antes de criar o lembrete.

**Response 200:**
```json
{
  "message_id": "msg_01HXYZ...",
  "response": "Lembrete criado! Vou te lembrar de 'Ligar pro dentista' amanhã às 09:00.",
  "intent": "reminder",
  "action": {
    "type": "reminder_created",
    "reminder_id": "rem_01HABC...",
    "title": "Ligar pro dentista",
    "next_execution": "2026-04-16T09:00:00-03:00"
  },
  "model_used": "gemini-1.5-flash"
}
```

**Intents possíveis retornados:**

| `intent` | Descrição |
|----------|-----------|
| `reminder` | IA criou ou atualizou um lembrete |
| `list` | IA listou os lembretes do usuário |
| `delete` | IA cancelou um lembrete |
| `chat` | Conversa geral, sem ação de lembrete |

---

### Lembretes

#### `GET /reminders` — Listar lembretes

**Query params (todos opcionais):**

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `limit` | int | 500 | Máximo de itens retornados (1–500) |
| `offset` | int | 0 | Paginação — itens a pular |
| `active_only` | bool | true | Filtrar apenas lembretes ativos |

**Response 200:**
```json
{
  "reminders": [
    {
      "id": "rem_01HABC...",
      "title": "Bater ponto",
      "next_execution": "2026-04-27T09:00:00-03:00",
      "recurrence": "weekly_days",
      "recurrence_str": null,
      "days_of_week": [0, 1, 2, 3, 4],
      "end_date": null,
      "is_active": true,
      "created_at": "2026-04-15T22:00:00Z"
    }
  ],
  "total": 1,
  "limit": 500,
  "offset": 0
}
```

---

#### `POST /reminders` — Criar lembrete diretamente

Cria um lembrete sem passar pela IA (usado, por exemplo, pelo "adiar" de lembretes pontuais).

**Request:**
```json
{
  "title": "Reunião",
  "scheduled_time": "2026-04-16T15:00:00-03:00",
  "recurrence": "once",
  "days_of_week": null
}
```

`recurrence` aceita: `once`, `daily`, `weekly`, `weekly_days`, `monthly`, `day_of_month`, `interval_seconds`. Para `weekly_days`, informe `days_of_week` (lista de inteiros, Seg=0 … Dom=6).

---

#### `PATCH /reminders/{id}` — Editar lembrete

Edita título, horário e/ou recorrência. Permite tornar um lembrete pontual em recorrente, trocar o tipo de recorrência ou remover a recorrência (enviando `recurrence: "once"`). A próxima execução é recalculada **em horário de Brasília** (dispara hoje se o horário ainda não passou e o dia é válido; senão vai pra próxima ocorrência).

**Request (todos os campos opcionais — só o que vier é alterado):**
```json
{
  "title": "Bater ponto",
  "scheduled_time": "2026-04-27T09:00:00-03:00",
  "recurrence": "weekly_days",
  "days_of_week": [0, 1, 2, 3, 4],
  "interval_seconds": null
}
```

`recurrence` aceita os mesmos valores do `POST`. Para `weekly_days`, informe `days_of_week`; para `interval_seconds`, informe `interval_seconds`.

**Response 200:** o lembrete atualizado (mesmo formato do item de `GET /reminders`).

---

#### `DELETE /reminders/{id}` — Deletar lembrete

**Response 200:**
```json
{
  "id": "rem_01HABC...",
  "title": "Ligar pro dentista",
  "deleted": true
}
```

**Response 404** (lembrete não encontrado):
```json
{ "detail": "Reminder not found." }
```

---

#### `GET /reminders/sync` — Sincronizar agendamentos

Retorna os próximos horários de execução de cada lembrete ativo. Usado pelo frontend para manter as notificações locais sincronizadas.

**Response 200:**
```json
{
  "synced_at": "2026-04-15T22:30:00Z",
  "reminders": [
    {
      "id": "rem_01HABC...",
      "title": "Ligar pro dentista",
      "recurrence_str": null,
      "is_active": true,
      "scheduled_executions": ["2026-04-16T09:00:00-03:00"]
    }
  ]
}
```

---

### Push Notifications

> Scaffolding — o **envio** de push é fase 2. Por enquanto a API só registra o token do dispositivo.

#### `POST /push/register` — Registrar token de push

**Request:**
```json
{
  "token": "ExponentPushToken[xxxxxxxx]",
  "platform": "ios"
}
```

**Response 204** (sem corpo). Se o token já existir, é reassociado ao usuário atual.

---

## Arquitetura

### Telegram Bot

```
Usuário (Telegram)
       │
       ▼
python-telegram-bot (cliente, httpx)
       │   auth por chat_id · sessões em tg_sessions.json
       ▼
Backend FastAPI ──► Google Gemini AI + SQLite (compartilhados com o app)
       │
       ├── POST /messages       → IA interpreta e cria / lista / edita / deleta
       └── GET  /reminders/sync → bot agenda e dispara no Telegram no horário
```

### App iOS

```
iPhone (React Native)
       │
       ├── Tela de Chat → POST /messages
       │                       │
       │                       ▼
       │               Google Gemini AI
       │               (interpreta intenção)
       │                       │
       │              ┌────────┴────────┐
       │              │                 │
       │         Cria lembrete    Responde chat
       │              │
       │         APScheduler
       │         (dispara no horário)
       │              │
       └── @notifee ◄─┘
         (notificação local no iPhone)
```

**Banco de dados (backend):**

```
users
  ├── id (PK)
  ├── email (unique)
  ├── name
  ├── password_hash
  └── is_active

reminders
  ├── id (PK)
  ├── user_id (FK → users)
  ├── title
  ├── next_execution
  ├── interval_seconds
  ├── recurrence
  ├── recurrence_str
  ├── days_of_week        # CSV "0,1,2,3,4" p/ recurrence="weekly_days"
  ├── end_date
  └── is_active

chat_history
  ├── id (PK)
  ├── user_id (FK → users)
  ├── role (user | assistant)
  ├── content
  ├── intent
  └── model_used

push_tokens               # scaffolding (envio = fase 2)
  ├── id (PK)
  ├── user_id (FK → users)
  ├── token (unique)
  ├── platform (ios | android)
  ├── created_at
  └── updated_at
```

---

## Troubleshooting

### `ModuleNotFoundError: No module named 'email_validator'`

O pydantic usa `EmailStr` que exige o pacote `email-validator`.

```bash
pip install email-validator==2.2.0
```

---

### `AttributeError: module 'bcrypt' has no attribute '__about__'`

O `passlib 1.7.4` é incompatível com `bcrypt 4.1+`. O `requirements.txt` já fixa `bcrypt==4.0.1`, mas se o problema ocorrer:

```bash
pip install bcrypt==4.0.1
```

---

### `npm` ou `eas` não reconhecido no terminal do VS Code

O VS Code não herda o PATH do sistema quando o Node é instalado depois que o editor já estava aberto. Solução já aplicada no `.vscode/settings.json`:

```json
{
  "terminal.integrated.env.windows": {
    "PATH": "C:\\Program Files\\nodejs;C:\\Users\\<seu-usuario>\\AppData\\Roaming\\npm;${env:PATH}"
  }
}
```

Abrir um novo terminal no VS Code após salvar o arquivo. Alternativa: usar `cmd.exe` diretamente (Win+R → `cmd`).

---

### `Unable to resolve a valid config plugin for @notifee/react-native`

O `@notifee/react-native v9` não possui plugin Expo. Remover da lista de plugins no `app.json`:

```json
"plugins": []
```

As permissões iOS ficam em `infoPlist` (já configurado):
```json
"infoPlist": {
  "UIBackgroundModes": ["fetch", "remote-notification"],
  "NSUserNotificationUsageDescription": "Usado para enviar lembretes no horário agendado."
}
```

---

### `You have no team associated with your Apple account`

Indica que a conta Apple não está inscrita no Apple Developer Program (conta gratuita). O EAS Build para distribuição interna (`.ipa`) requer a conta paga de **$99/ano**.

Inscrição: [developer.apple.com/programs](https://developer.apple.com/programs/)

---

### Backend sobe mas APScheduler não dispara lembretes

Verifique se o banco foi inicializado antes de subir o servidor:

```bash
python init_db.py
uvicorn src.main:app --reload --port 8000
```

O scheduler roda a cada 60 segundos. Cheque os logs da aplicação — deve aparecer a linha `APScheduler started` na inicialização.

---

### `ValueError: password cannot be longer than 72 bytes`

Mesmo erro de versão do `bcrypt`. Solução acima se aplica.

---

## Estrutura de Pastas

```
quase_nada_lembretes/
├── quase_nada_lembretes.py   # Telegram Bot (versão original)
├── requirements.txt           # Dependências do bot
│
└── app_iphone/
    ├── backend/
    │   ├── init_db.py         # Script para criar tabelas no banco
    │   ├── requirements.txt   # Dependências do backend
    │   └── src/
    │       ├── main.py        # Ponto de entrada FastAPI
    │       ├── ai/            # Integração com Gemini AI
    │       ├── core/          # Config, banco, segurança, rate limiter
    │       ├── features/
    │       │   ├── auth/      # Registro e login
    │       │   ├── messages/  # Chat com a IA
    │       │   ├── reminders/ # CRUD de lembretes (incl. recorrência por dias da semana)
    │       │   └── push/      # Registro de tokens de push (scaffolding)
    │       ├── middleware/    # Tratamento global de erros
    │       └── models/        # Modelos SQLAlchemy (User, Reminder, ChatHistory, PushToken)
    │
    └── frontend/
        ├── index.js           # Ponto de entrada (registra o root component)
        ├── App.js             # Componente raiz React Native
        ├── app.config.js      # Configuração Expo
        ├── eas.json           # Configuração EAS Build
        └── src/
            ├── api/           # Chamadas HTTP para o backend (client com refresh)
            ├── components/    # Componentes reutilizáveis (PressableScale, CalendarPicker, ...)
            ├── context/       # AuthContext, NotificationSettingsContext, ThemeContext
            ├── lib/           # storage MMKV (instância única, sem ciclo de import)
            ├── navigation/    # AppNavigator (rotas)
            ├── screens/       # Chat, Lembretes, Login, Register, NotificationSettings
            ├── services/      # Notificações, fila de mensagens e tarefas em background
            └── utils/         # Formatação de hora (12h/24h)
```
