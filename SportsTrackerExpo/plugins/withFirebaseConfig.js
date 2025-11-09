const { withPodfile } = require('@expo/config-plugins');

module.exports = function withFirebaseConfig(config) {
  return withPodfile(config, (config) => {
    let contents = config.modResults.contents;

    console.log("🔧 [Expo Plugin] Applying Firebase modular header fixes...");

    // Check if we've already patched this file
    if (contents.includes("🔧 FIREBASE STATIC LINKING PATCH")) {
      console.log("✅ [Expo Plugin] Podfile already patched, skipping.");
      return config;
    }

    // Add static frameworks declaration if not present
    if (!contents.includes("use_frameworks! :linkage => :static")) {
      contents = contents.replace(
        /platform :ios, ['"][^'"]+['"]/,
        (match) => `${match}\nuse_frameworks! :linkage => :static`
      );
      console.log("✅ [Expo Plugin] Added static frameworks declaration");
    }

    // Add Firebase analytics configuration
    if (!contents.includes("$RNFirebaseAnalyticsWithoutAdIdSupport")) {
      contents = contents.replace(
        /use_frameworks! :linkage => :static/,
        `use_frameworks! :linkage => :static
$RNFirebaseAnalyticsWithoutAdIdSupport = true`
      );
      console.log("✅ [Expo Plugin] Added Firebase Analytics without Ad ID support");
    }

    // Add our comprehensive Firebase fixes
    const firebasePatch = `

# 🔧 FIREBASE STATIC LINKING PATCH - Auto-applied by plugins/withFirebaseConfig.js
# This prevents Firebase modular header conflicts with React Native New Architecture

pre_install do |installer|
  # Disable static framework transitive dependency validation
  Pod::Installer::Xcode::TargetValidator.send(:define_method, :verify_no_static_framework_transitive_dependencies) {}

  installer.pod_targets.each do |pod|
    if pod.name.start_with?('RNFB') ||
       pod.name.start_with?('Firebase') ||
       pod.name.start_with?('Google') ||
       pod.name.start_with?('GTMSessionFetcher')
      puts "🔧 [Firebase Patch] Forcing #{pod.name} to static_library"
      def pod.build_type
        Pod::BuildType.static_library
      end
    end
  end
end

post_install do |installer|
  # Apply React Native post install configurations
  react_native_post_install(installer, :mac_catalyst_enabled => false)

  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      # Suppress modular header warnings for Firebase modules
      if target.name.start_with?('RNFB') ||
         target.name.start_with?('Firebase') ||
         target.name.start_with?('Google')
        
        config.build_settings['WARNING_CFLAGS'] = [
          '-Wno-non-modular-include-in-framework-module',
          '-Wno-module-import-in-extern-c'
        ].join(' ')
        
        config.build_settings['GCC_WARN_INHIBIT_ALL_WARNINGS'] = 'YES'
        puts "🔧 [Firebase Patch] Applied warning suppressions to #{target.name}"
      end

      # Ensure iOS deployment target compatibility
      if config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < 12.0
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '12.0'
      end
    end
  end
  
  puts "✅ [Firebase Patch] All Firebase modular header fixes applied successfully"
end`;

    // Add the patch before the existing end statement
    if (contents.includes('end')) {
      const lastEndIndex = contents.lastIndexOf('end');
      contents = contents.slice(0, lastEndIndex) + firebasePatch + '\n' + contents.slice(lastEndIndex);
    } else {
      contents += firebasePatch;
    }

    config.modResults.contents = contents;
    console.log("✅ [Expo Plugin] Firebase modular header patch applied successfully");
    
    return config;
  });
};