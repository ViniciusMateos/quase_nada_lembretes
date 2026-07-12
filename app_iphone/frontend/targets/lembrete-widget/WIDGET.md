# Widget "clique para ser lembrado" (WidgetKit)

Este target **não está ativo** no build por padrão — de propósito. É a única parte
que não dá pra validar sem buildar no iOS (Swift/WidgetKit), então fica isolado
pra não arriscar quebrar o EAS build das outras features.

O lado **JS já está pronto e funcionando**: URL scheme `quasenadalembretes://`
(`app.config.js`), handler de deep link (`App.js`) e foco do input do Chat
(`src/utils/composeIntent.js` + `ChatScreen.js`). Ou seja, qualquer deep link
`quasenadalembretes://novo` já abre o Chat com o teclado aberto. Falta só o
widget nativo em si disparar esse link.

## Como ativar (quando for buildar o widget)

1. Instalar o plugin de targets nativos (o Brechó já usa):
   ```
   npx expo install @bacons/apple-targets
   ```

2. Adicionar o plugin no `app.config.js`, dentro de `plugins`:
   ```js
   plugins: [
     // ...os existentes...
     '@bacons/apple-targets',
   ],
   ```
   Ele descobre sozinho os targets em `targets/*/expo-target.config.js`.

3. Rebuildar o dev build (o widget é nativo, não recarrega por Metro):
   ```
   eas build --profile development --platform ios
   ```

4. No iPhone: segurar na tela de bloqueio (ou início) → adicionar widget →
   "Quase Nada" → "Novo lembrete".

## Arquivos

- `expo-target.config.js` — config do target (tipo widget, cor de acento, ícone).
- `index.swift` — o widget: famílias de tela de bloqueio (`accessory*`) e
  `systemSmall` (tela inicial). Toque = `widgetURL(quasenadalembretes://novo)`.

## Notas / possíveis ajustes no build

- Usa **SF Symbols** (`bell.badge.fill`) em vez do logo bitmap, porque na tela
  de bloqueio o iOS renderiza os accessory widgets em monocromático — um PNG
  fica ruim. Se quiser o logo de verdade na `systemSmall`, dá pra adicionar o
  asset ao target e trocar o `Image(systemName:)`.
- `deploymentTarget: 17.0` no config; ajustar se precisar de iOS mais antigo.
- Se o EAS build reclamar do target, é aqui que a gente itera (é o esperado por
  ser a parte nativa não testável no Windows).
