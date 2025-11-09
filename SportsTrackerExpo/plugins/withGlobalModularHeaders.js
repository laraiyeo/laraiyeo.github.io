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

    // Add post_install hook to handle Firebase warning suppressions
    const firebaseWarningFix = `
  # Firebase modular header warning suppressions
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      if target.name.start_with?('RNFB') || target.name == 'Firebase' || target.name.start_with?('Firebase')
        config.build_settings['WARNING_CFLAGS'] = '-Wno-non-modular-include-in-framework-module'
        config.build_settings['GCC_TREAT_WARNINGS_AS_ERRORS'] = 'NO'
        config.build_settings['CLANG_WARN_NON_MODULAR_INCLUDE_IN_FRAMEWORK_MODULE'] = 'NO'
      end
    end
  end`;

    if (contents.includes("post_install do |installer|")) {
      // Insert our fix at the end of the existing post_install block
      contents = contents.replace(
        /(post_install do \|installer\|[^]*?)(  end)/m,
        `$1${firebaseWarningFix}\n$2`
      );
    } else {
      // Add a new post_install block before the final 'end'
      const lastEndIndex = contents.lastIndexOf("end");
      if (lastEndIndex > -1) {
        const newPostInstall = `
post_install do |installer|${firebaseWarningFix}
end

`;
        contents = contents.slice(0, lastEndIndex) + newPostInstall + contents.slice(lastEndIndex);
      }
    }

    config.modResults.contents = contents;
    return config;
  });
};