# Quase Nada Lembretes — App iPhone (frontend)

Instruções específicas do app RN/Expo. Herda as regras globais do Vinicius
(commits, sem emojis, teclado, etc.) — aqui ficam só as convenções deste projeto.

## Versionamento OTA (REGRA)

Toda vez que publicar um OTA (`eas update --branch preview`), **incrementar +1**
a constante `OTA_VERSION` em [src/constants/otaVersion.js](src/constants/otaVersion.js)
**antes** de publicar. Sem exceção.

- O número aparece no rodapé do menu hamburguer (`OTA #N · atualizado|build`).
- Serve pra confirmar no device que o bundle novo de fato baixou: se a tela
  ainda mostra o número antigo, o update ainda não pegou.
- `atualizado` = rodando de um OTA · `build` = rodando do JS embutido no build.
- Não confundir com `version` (marketing, package.json/app.config) nem com
  `runtimeVersion` (1.0.0 fixo, compatibilidade OTA×nativo — só muda em build).

Fluxo de cada OTA: bump `OTA_VERSION` → bundle-check → `eas update`.

## Publicar OTA

```
EAS_NO_VCS=1 eas update --branch preview --message "<descrição>"
```

Runtime fixo `1.0.0`. Só mudança nativa (splash/ícone/config/deps nativas) exige
`eas build`; JS puro vai por OTA.
