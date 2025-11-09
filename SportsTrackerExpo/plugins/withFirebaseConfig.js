const { withPodfile } = require("@expo/config-plugins");

module.exports = function withFirebaseConfig(config) {
  return withPodfile(config, (config) => {
    let contents = config.modResults.contents;

    // Check if we've already patched this file
    if (contents.includes("FIREBASE_STATIC_PATCH_APPLIED")) {
      return config;
    }

    // Ensure we have static frameworks
    if (!contents.includes("use_frameworks! :linkage => :static")) {
      contents = contents.replace(
        /platform :ios, ['"][^'"]+['"]/,
        (match) => `${match}\nuse_frameworks! :linkage => :static`
      );
    }

    // Add Firebase analytics configuration
    if (!contents.includes("$RNFirebaseAnalyticsWithoutAdIdSupport")) {
      contents = contents.replace(
        /use_frameworks! :linkage => :static/,
        `use_frameworks! :linkage => :static
$RNFirebaseAnalyticsWithoutAdIdSupport = true`
      );
    }

    // Add pre_install block for Firebase static linking
    const preInstallFix = `
# FIREBASE_STATIC_PATCH_APPLIED - Firebase static linking fixes
pre_install do |installer|
  Pod::Installer::Xcode::TargetValidator.send(:define_method, :verify_no_static_framework_transitive_dependencies) {}
  installer.pod_targets.each do |pod|
    if pod.name.start_with?('RNFB') || pod.name.start_with?('Firebase') || pod.name.start_with?('Google')
      def pod.build_type; Pod::BuildType.static_library; end
    end
  end
end`;

    // Add the pre_install block before any existing post_install
    if (contents.includes("post_install")) {
      contents = contents.replace(
        /post_install/,
        preInstallFix + "\n\npost_install"
      );
    } else {
      // Add before the last 'end'
      const lastEndIndex = contents.lastIndexOf("end");
      if (lastEndIndex > -1) {
        contents =
          contents.slice(0, lastEndIndex) +
          preInstallFix +
          "\n" +
          contents.slice(lastEndIndex);
      } else {
        contents += preInstallFix;
      }
    }

    // Enhance the existing post_install block with Firebase warning suppressions
    if (contents.includes("post_install do |installer|")) {
      const firebasePostInstallFix = `
  # Firebase modular header warning suppressions
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      if target.name.start_with?('RNFB') || target.name.start_with?('Firebase') || target.name.start_with?('Google')
        config.build_settings['WARNING_CFLAGS'] = '-Wno-non-modular-include-in-framework-module'
        config.build_settings['GCC_WARN_INHIBIT_ALL_WARNINGS'] = 'YES'
      end
      if config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < 12.0
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '12.0'
      end
    end
  end`;

      // Insert Firebase fixes before the closing 'end' of post_install
      contents = contents.replace(
        /(post_install do \|installer\|[^]*?)(end)/m,
        `$1${firebasePostInstallFix}\n  $2`
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};
