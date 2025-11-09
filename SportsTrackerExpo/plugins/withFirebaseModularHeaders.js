const { withPodfile } = require("@expo/config-plugins");

module.exports = function withFirebaseModularHeaders(config) {
  return withPodfile(config, (config) => {
    let contents = config.modResults.contents;

    // Check if we've already applied this patch
    if (contents.includes("FIREBASE_MODULAR_HEADERS_APPLIED")) {
      return config;
    }

    // Add Firebase analytics setting if not present
    if (!contents.includes("$RNFirebaseAnalyticsWithoutAdIdSupport")) {
      const platformMatch = contents.match(/platform :ios, ['"][^'"]+['"]/);
      if (platformMatch) {
        contents = contents.replace(
          platformMatch[0],
          `${platformMatch[0]}\n$RNFirebaseAnalyticsWithoutAdIdSupport = true`
        );
      }
    }

    // Add post_install hook if it doesn't exist, or modify existing one
    const modularHeadersFix = `
  # FIREBASE_MODULAR_HEADERS_APPLIED - Enable modular headers for Firebase dependencies
  installer.pods_project.targets.each do |target|
    # Only apply to regular targets, not aggregate targets
    next unless target.respond_to?(:build_configurations)
    
    target.build_configurations.each do |config|
      # Enable modular headers for Firebase and Google dependencies
      if ['GoogleUtilities', 'FirebaseCore', 'FirebaseCoreInternal', 'Firebase', 'GoogleAppMeasurement'].include?(target.name)
        config.build_settings['DEFINES_MODULE'] = 'YES'
        config.build_settings['CLANG_ENABLE_MODULES'] = 'YES'
      end
      
      # Firebase warning suppressions
      if target.name.start_with?('RNFB') || target.name.start_with?('Firebase') || target.name.start_with?('Google')
        config.build_settings['WARNING_CFLAGS'] = '-Wno-non-modular-include-in-framework-module'
        config.build_settings['GCC_WARN_INHIBIT_ALL_WARNINGS'] = 'YES'
      end
    end
  end`;

    if (contents.includes("post_install do |installer|")) {
      // Insert our fix at the end of the existing post_install block
      contents = contents.replace(
        /(post_install do \|installer\|[^]*?)(  end)/m,
        `$1${modularHeadersFix}\n$2`
      );
    } else {
      // Add a new post_install block before the final 'end'
      const lastEndIndex = contents.lastIndexOf("end");
      if (lastEndIndex > -1) {
        const newPostInstall = `
post_install do |installer|${modularHeadersFix}
end

`;
        contents = contents.slice(0, lastEndIndex) + newPostInstall + contents.slice(lastEndIndex);
      }
    }

    config.modResults.contents = contents;
    return config;
  });
};