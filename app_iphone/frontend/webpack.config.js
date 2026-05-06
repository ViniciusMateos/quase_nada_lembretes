const createExpoWebpackConfigAsync = require('@expo/webpack-config');
const path = require('path');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);

  config.resolve.alias = {
    ...config.resolve.alias,
    '@notifee/react-native': path.resolve(__dirname, 'src/stubs/notifee.web.js'),
    'react-native-mmkv': path.resolve(__dirname, 'src/stubs/mmkv.web.js'),
  };

  return config;
};
