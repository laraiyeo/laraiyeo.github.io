# Build Size Optimization Script

echo "🧹 Removing unused dependencies to reduce build size..."

# Remove unused dependencies identified by depcheck
npm uninstall @react-navigation/material-top-tabs
npm uninstall expo-application  
npm uninstall expo-status-bar
npm uninstall react-dom
npm uninstall react-native-pager-view
npm uninstall react-native-tab-view
npm uninstall react-native-worklets

echo "📦 Cleaning up dev dependencies..."
npm uninstall @babel/core --save-dev

echo "🎯 Installing lighter alternatives if needed..."
# Note: Some of these might be required by other packages, so check before removing

echo "✅ Dependencies cleaned up!"

# Show final analysis
echo "📊 Final package analysis:"
node analyze-build-size.js