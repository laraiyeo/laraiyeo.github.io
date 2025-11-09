#!/bin/bash
set -e

echo "🔧 Running post-install hook: ensuring Podfile is patched"

# Check if ios directory and Podfile exist after prebuild
if [ -d "ios" ] && [ -f "ios/Podfile" ]; then
    echo "📄 Podfile found, applying Firebase static linking patches..."
    node ./scripts/patch-podfile.js
    echo "✅ Post-install Podfile patching completed"
else
    echo "⚠️ No Podfile found in post-install hook (this shouldn't happen)"
fi

echo "🎯 Post-install hook completed"