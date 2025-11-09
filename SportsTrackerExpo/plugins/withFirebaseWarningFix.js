const { withPodfile } = require("@expo/config-plugins");

module.exports = function withFirebaseWarningFix(config) {
  return withPodfile(config, (config) => {
    let contents = config.modResults.contents;

    // Check if we've already applied this patch
    if (contents.includes("FIREBASE_WARNING_FIX_APPLIED")) {
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

    // Simple post_install hook to suppress Firebase warnings only
    const firebaseWarningFix = `
  # FIREBASE_WARNING_FIX_APPLIED - Suppress Firebase modular header warnings
  installer.pods_project.targets.each do |target|
    if target.name.start_with?('RNFB')
      target.build_configurations.each do |config|
        config.build_settings['WARNING_CFLAGS'] = '$(inherited) -Wno-non-modular-include-in-framework-module'
        config.build_settings['GCC_TREAT_WARNINGS_AS_ERRORS'] = 'NO'
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