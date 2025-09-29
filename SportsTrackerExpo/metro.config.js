const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ensure SVGs are handled by react-native-svg-transformer while keeping Expo's
// default asset/resolver settings which avoid the 'missing-asset-registry-path' error.
config.transformer = config.transformer || {};
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer');

config.resolver = config.resolver || {};
config.resolver.assetExts = config.resolver.assetExts.filter(ext => ext !== 'svg');
config.resolver.sourceExts = Array.from(new Set([...(config.resolver.sourceExts || []), 'svg']));

module.exports = config;