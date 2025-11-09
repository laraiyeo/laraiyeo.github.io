const { withPodfile } = require('@expo/config-plugins');

module.exports = function withFirebaseStaticLinking(config) {
  return withPodfile(config, (config) => {
    let contents = config.modResults.contents;

    // Only add if not already present
    if (contents.includes("RNFirebaseAnalyticsWithoutAdIdSupport")) {
      return config;
    }

    // Add Firebase analytics without ad id support
    contents = contents.replace(
      /platform :ios, ['"][^'"]+['"]/,
      `platform :ios, '12.0'
$RNFirebaseAnalyticsWithoutAdIdSupport = true`
    );

    config.modResults.contents = contents;
    return config;
  });
};