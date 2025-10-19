const { withPodfile } = require('@expo/config-plugins');

module.exports = function withFirebaseConfig(config) {
  return withPodfile(config, (config) => {
    config.modResults.contents = config.modResults.contents.replace(
      /use_frameworks! :linkage => :static/g,
      `use_frameworks! :linkage => :static
$RNFirebaseAnalyticsWithoutAdIdSupport = true`
    );
    
    return config;
  });
};