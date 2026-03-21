#!/bin/bash

# Build Size Analysis Script for React Native/Expo Apps

echo "🔍 Analyzing Build Size Components..."

# Check node_modules size
echo "📦 Node Modules Analysis:"
if [ -d "node_modules" ]; then
    echo "Total node_modules size:"
    du -sh node_modules 2>/dev/null || echo "Unable to calculate node_modules size"
    
    echo ""
    echo "Top 10 largest packages in node_modules:"
    du -sh node_modules/* 2>/dev/null | sort -hr | head -10
else
    echo "node_modules directory not found"
fi

echo ""
echo "📱 Assets Analysis:"
if [ -d "assets" ]; then
    echo "Total assets size:"
    du -sh assets 2>/dev/null || echo "Unable to calculate assets size"
    
    echo ""
    echo "Asset breakdown:"
    find assets -type f -exec du -sh {} \; 2>/dev/null | sort -hr | head -10
else
    echo "assets directory not found"
fi

echo ""
echo "📊 Bundle Analysis (if available):"
if [ -f "metro.config.js" ]; then
    echo "Metro config found. You can run 'npx @rnx-kit/metro-serializer-esbuild analyze' for detailed bundle analysis"
fi

echo ""
echo "🔬 Large Dependencies Analysis:"
echo "Checking package.json for potentially large dependencies..."

# Check for common large dependencies
large_deps=("@react-native-firebase" "react-native-svg" "react-native-reanimated" "react-native-gesture-handler" "expo-camera" "react-native-video")

for dep in "${large_deps[@]}"; do
    if npm list "$dep" >/dev/null 2>&1; then
        echo "⚠️  Large dependency detected: $dep"
    fi
done

echo ""
echo "📋 Recommendations to reduce size:"
echo "1. Remove unused dependencies with 'npx depcheck'"
echo "2. Use Metro's tree-shaking by enabling 'unstable_enablePackageExports: true'"
echo "3. Optimize images - compress and use appropriate formats"
echo "4. Consider code splitting for large features"
echo "5. Use bundle-analyzer tools like 'react-native-bundle-visualizer'"