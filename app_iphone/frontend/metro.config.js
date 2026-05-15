const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;

const webAliases = {
  'react-native-mmkv': path.resolve(__dirname, 'src/stubs/mmkv.web.js'),
  '@notifee/react-native': path.resolve(__dirname, 'src/stubs/notifee.web.js'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && webAliases[moduleName]) {
    return {
      type: 'sourceFile',
      filePath: webAliases[moduleName],
    };
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
