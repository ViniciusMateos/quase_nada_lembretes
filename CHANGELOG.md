# Changelog

Todas as mudanças notáveis deste projeto estão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).
Versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [Unreleased]

### Known Issues
- Interface do chat ainda sem feedback visual de lembretes criados
- Sem tela de listagem dedicada para lembretes ativos
- Sem opção de editar lembretes existentes
- App expira em 7 dias se instalado via Sideloadly com conta gratuita Apple

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
