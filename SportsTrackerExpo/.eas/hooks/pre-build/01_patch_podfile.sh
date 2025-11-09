#!/bin/bash
set -e

echo "🛠️ Running custom pre-build hook: patch Podfile for Firebase"
echo "📍 Current working directory: $(pwd)"
echo "📂 Checking project structure..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found, are we in the right directory?"
    exit 1
fi

# Check if patch script exists
if [ ! -f "scripts/patch-podfile.js" ]; then
    echo "❌ scripts/patch-podfile.js not found"
    exit 1
fi

# Check if ios directory and Podfile exist
if [ -d "ios" ] && [ -f "ios/Podfile" ]; then
    echo "📄 Found existing iOS project and Podfile"
    echo "🔧 Applying Firebase static linking patches..."
    node ./scripts/patch-podfile.js
    echo "✅ Podfile patching completed"
elif [ -d "ios" ]; then
    echo "📁 iOS directory exists but no Podfile found"
    echo "⏳ Will patch after expo prebuild creates Podfile"
else
    echo "📁 No iOS directory found yet"
    echo "⏳ Will patch after expo prebuild creates iOS project"
fi

echo "🎯 Pre-build hook completed successfully"