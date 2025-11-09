const { withProjectBuildGradle } = require('@expo/config-plugins');

const withSimpleFirebase = (config) => {
  return withProjectBuildGradle(config, (config) => {
    // Simple Firebase setup without complex modular header modifications
    config.modResults.contents = config.modResults.contents.replace(
      /allprojects\s*{[\s\S]*?repositories\s*{/,
      `allprojects {
    repositories {
        google()
        mavenCentral()
        maven { url "https://www.jitpack.io" }
`
    );

    return config;
  });
};

module.exports = withSimpleFirebase;