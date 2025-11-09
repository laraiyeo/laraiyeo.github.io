const { withProjectBuildGradle, withPodfile } = require("@expo/config-plugins");

const withSimpleFirebase = (config) => {
  // Configure Android
  config = withProjectBuildGradle(config, (config) => {
    // Ensure Google services are available
    if (!config.modResults.contents.includes('google-services')) {
      config.modResults.contents = config.modResults.contents.replace(
        /dependencies\s*{/,
        `dependencies {
        classpath 'com.google.gms:google-services:4.3.15'`
      );
    }

    return config;
  });

  // Configure iOS Podfile
  config = withPodfile(config, (config) => {
    // Add Firebase pods without trying to modify AppDelegate
    const podfileContent = config.modResults.contents;
    
    if (!podfileContent.includes('Firebase/Analytics')) {
      config.modResults.contents = podfileContent.replace(
        /use_react_native!/,
        `use_react_native!
  
  # Firebase pods
  pod 'Firebase/Analytics'
  pod 'Firebase/Database'`
      );
    }

    return config;
  });

  return config;
};

module.exports = withSimpleFirebase;
