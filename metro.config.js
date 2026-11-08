// Metro setup for PowerSync, from PowerSync's React Native Web guide:
// the web build uses @powersync/web and the Android/iOS builds use
// @powersync/react-native, so each build swaps the other for an empty module.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;
// Expo drops the react-native export condition on web, but @powersync/web needs it.
config.resolver.unstable_conditionsByPlatform.web.push('react-native-web');

const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === '@powersync/react-native') return { type: 'empty' };
  if (platform !== 'web' && moduleName === '@powersync/web') return { type: 'empty' };
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
