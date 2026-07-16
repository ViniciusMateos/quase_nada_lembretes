// SDK 54 exige o babel-preset-expo. Com o preset puro do React Native, os
// polyfills que o Expo injeta (web-streams, etc.) saíam compilados com helpers
// em require("@babel/runtime/..."), e polyfill roda ANTES do sistema de módulos
// existir — daí o "Property 'require' doesn't exist" logo no boot.
module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
    ['transform-inline-environment-variables', {
      include: ['API_BASE_URL'],
    }],
  ],
};
