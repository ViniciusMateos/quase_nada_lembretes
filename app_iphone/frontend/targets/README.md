# Targets nativos — ativar tudo num build só

Aqui ficam os **targets nativos iOS** que exigem build (não recarregam por Metro).
Estão isolados de propósito pra não quebrar o build principal. Ative **os dois de
uma vez** no próximo build pra não gastar builds à toa.

Targets:
- `lembrete-widget/` — widget "clique para ser lembrado" (tela de bloqueio/início).
- `resumo-notif/` — UI custom da notificação-resumo expandida (branded).

## Passo a passo (um build pros dois)

1. Instalar o plugin de targets nativos:
   ```
   npx expo install @bacons/apple-targets
   ```

2. Adicionar no `app.config.js`, dentro de `plugins`:
   ```js
   plugins: [
     // ...os existentes...
     '@bacons/apple-targets',
   ],
   ```
   Ele descobre sozinho os targets em `targets/*/expo-target.config.js`.

3. Rebuildar (dev ou preview):
   ```
   eas build --profile development --platform ios
   ```

4. Conferir no build:
   - **Widget:** segurar na tela de bloqueio/início → adicionar widget → "Quase Nada".
   - **Notificação-resumo:** o `resumo-notif` precisa que o Info.plist do target tenha
     `UNNotificationExtensionCategory = "resumo"` (casa com o `categoryId: 'resumo'`
     setado em `src/services/notifications.js`). Se o @bacons/apple-targets não colocar
     isso sozinho, ajustar o Info.plist do target. Sem isso, o resumo mostra o layout
     padrão do iOS (ainda funciona, só não custom).

## OTA (expo-updates) — já configurado

`expo-updates` já está no `app.config.js` (`runtimeVersion: appVersion` + `updates.url`)
e nos canais do `eas.json` (development/preview/production). **Ativa a partir do próximo
build** (o build atual não tem o módulo). Depois de buildar um **preview**, dá pra
empurrar JS sem rebuildar:
```
eas update --branch preview -m "ajuste tal"
```
O app preview instalado baixa o update no próximo open (enquanto a versão do app não muda).

## Notas
- Ambos os targets são Swift/UIKit/SwiftUI e **não dá pra validar no Windows** — é aqui
  que a gente itera no build se algo não bater.
- `lembrete-widget/WIDGET.md` tem detalhes específicos do widget.
