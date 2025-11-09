const { withPodfile } = require("@expo/config-plugins");

module.exports = function withGlobalModularHeaders(config) {
  return withPodfile(config, (config) => {
    let contents = config.modResults.contents;

    // Check if we've already applied this patch
    if (contents.includes("GLOBAL_MODULAR_HEADERS_APPLIED")) {
      return config;
    }

    // Add global modular headers right after the platform declaration
    const platformMatch = contents.match(/platform :ios, ['"][^'"]+['"]/);
    if (platformMatch) {
      contents = contents.replace(
        platformMatch[0],
        `${platformMatch[0]}
# GLOBAL_MODULAR_HEADERS_APPLIED - Fix Firebase Swift dependencies
use_modular_headers!
$RNFirebaseAnalyticsWithoutAdIdSupport = true`
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};