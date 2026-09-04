// Número da versão OTA do JS.
//
// REGRA DO PROJETO: incrementar +1 a CADA `eas update` publicado (qualquer OTA
// no canal preview). É isto que aparece no rodapé do menu hamburguer, então o
// número na tela é a prova de que o bundle novo de fato baixou e está rodando:
// se o device ainda mostra o número antigo, o update ainda não pegou.
//
// Não confundir com:
//   - `version` (1.5.0) no package.json/app.config → versão de marketing do app
//   - `runtimeVersion` (1.0.0) fixo → compatibilidade OTA×nativo (só muda em build)
export const OTA_VERSION = 23;
