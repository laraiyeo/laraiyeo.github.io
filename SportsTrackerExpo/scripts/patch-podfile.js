const fs = require('fs');
const path = require('path');

console.log('🔧 Starting Podfile patching for Firebase modular header fix...');

const podfile = path.join(__dirname, '..', 'ios', 'Podfile');
if (!fs.existsSync(podfile)) {
  console.log('❌ Podfile not found, skipping patch.');
  process.exit(0);
}

let contents = fs.readFileSync(podfile, 'utf8');
console.log('📄 Found Podfile, applying Firebase static linking patches...');

// Check if we've already patched this file
if (contents.includes('🔧 FIREBASE STATIC LINKING PATCH')) {
  console.log('✅ Podfile already patched, skipping.');
  process.exit(0);
}

// Add static frameworks declaration
if (!contents.includes('use_frameworks! :linkage => :static')) {
  contents = contents.replace(
    /platform :ios, ['"][^'"]+['"]/,
    (match) => `${match}\nuse_frameworks! :linkage => :static`
  );
  console.log('✅ Added static frameworks declaration');
}

// Add our comprehensive Firebase fixes
const firebasePatch = `

# 🔧 FIREBASE STATIC LINKING PATCH - Auto-applied by scripts/patch-podfile.js
# This prevents Firebase modular header conflicts with React Native New Architecture

pre_install do |installer|
  Pod::Installer::Xcode::TargetValidator.send(:define_method, :verify_no_static_framework_transitive_dependencies) {}

  installer.pod_targets.each do |pod|
    if pod.name.start_with?('RNFB') ||
       pod.name.start_with?('Firebase') ||
       pod.name.start_with?('Google') ||
       pod.name.start_with?('GTMSessionFetcher')
      puts "🔧 Auto-patch: Forcing #{pod.name} to static_library"
      def pod.build_type
        Pod::BuildType.static_library
      end
    end
  end
end

post_install do |installer|
  # Apply React Native post_install first
  react_native_post_install(
    installer,
    config[:reactNativePath],
    :mac_catalyst_enabled => false
  )

  # Project-level settings to prevent modular header conflicts
  installer.pods_project.build_configurations.each do |config|
    config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
    config.build_settings['CLANG_WARN_NON_MODULAR_INCLUDE_IN_FRAMEWORK_MODULE'] = 'NO'
    config.build_settings['GCC_TREAT_WARNINGS_AS_ERRORS'] = 'NO'
    config.build_settings['OTHER_CFLAGS'] = ['-Wno-error', '-Wno-non-modular-include-in-framework-module']
  end

  # Target-specific settings for Firebase pods
  installer.pods_project.targets.each do |target|
    if target.name.start_with?('RNFB') || target.name.start_with?('Firebase') || target.name.start_with?('Google')
      target.build_configurations.each do |config|
        config.build_settings['DEFINES_MODULE'] = 'NO'
        config.build_settings['CLANG_ENABLE_MODULES'] = 'NO'
        config.build_settings['BUILD_LIBRARY_FOR_DISTRIBUTION'] = 'NO'
        config.build_settings['GCC_TREAT_WARNINGS_AS_ERRORS'] = 'NO'
        config.build_settings['CLANG_WARN_NON_MODULAR_INCLUDE_IN_FRAMEWORK_MODULE'] = 'NO'
      end
    end
  end
  
  puts "✅ Applied Firebase static linking patches to prevent modular header conflicts"
end

# End of Firebase static linking patch
`;

// Find the target block and inject our patches
const targetMatch = contents.match(/(target\s+['"][^'"]+['"]\s+do.*?end)/s);
if (targetMatch) {
  // Insert our patches before the target block ends
  contents = contents.replace(
    /(\s+)(end\s*)$/,
    `$1${firebasePatch}$1$2`
  );
} else {
  // If we can't find the target block, append to the end
  contents += firebasePatch;
}

// Write the patched Podfile
fs.writeFileSync(podfile, contents);
console.log('✅ Successfully patched Podfile with Firebase static linking fixes');
console.log('🎯 This should resolve modular header conflicts while maintaining New Architecture support');