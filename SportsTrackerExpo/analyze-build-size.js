const fs = require('fs');
const path = require('path');

// Build Size Analysis Script for Windows/Node.js
console.log('🔍 Analyzing Build Size Components...');

// Function to get directory size
function getDirectorySize(dirPath) {
  try {
    let totalSize = 0;
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        totalSize += getDirectorySize(filePath);
      } else {
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
      }
    }
    return totalSize;
  } catch (error) {
    return 0;
  }
}

// Function to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Analyze node_modules
console.log('\n📦 Node Modules Analysis:');
if (fs.existsSync('node_modules')) {
  const nodeModulesSize = getDirectorySize('node_modules');
  console.log(`Total node_modules size: ${formatBytes(nodeModulesSize)}`);
  
  // Get top level packages
  const packages = fs.readdirSync('node_modules')
    .filter(name => !name.startsWith('.'))
    .map(name => {
      const packagePath = path.join('node_modules', name);
      const size = getDirectorySize(packagePath);
      return { name, size };
    })
    .sort((a, b) => b.size - a.size)
    .slice(0, 10);
    
  console.log('\nTop 10 largest packages:');
  packages.forEach(pkg => {
    console.log(`${pkg.name}: ${formatBytes(pkg.size)}`);
  });
} else {
  console.log('node_modules directory not found');
}

// Analyze assets
console.log('\n📱 Assets Analysis:');
if (fs.existsSync('assets')) {
  const assetsSize = getDirectorySize('assets');
  console.log(`Total assets size: ${formatBytes(assetsSize)}`);
  
  // Analyze asset files
  function analyzeAssets(dirPath, prefix = '') {
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    const assetFiles = [];
    
    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        assetFiles.push(...analyzeAssets(filePath, prefix + file.name + '/'));
      } else {
        const stats = fs.statSync(filePath);
        assetFiles.push({
          name: prefix + file.name,
          size: stats.size
        });
      }
    }
    return assetFiles;
  }
  
  const assetFiles = analyzeAssets('assets')
    .sort((a, b) => b.size - a.size)
    .slice(0, 10);
    
  console.log('\nLargest asset files:');
  assetFiles.forEach(file => {
    console.log(`${file.name}: ${formatBytes(file.size)}`);
  });
} else {
  console.log('assets directory not found');
}

// Check package.json for large dependencies
console.log('\n🔬 Large Dependencies Analysis:');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  const largeDeps = [
    '@react-native-firebase',
    'react-native-svg',
    'react-native-reanimated',
    'react-native-gesture-handler',
    'expo-av',
    'expo-camera',
    'react-native-video',
    'react-native-maps',
    '@expo/vector-icons'
  ];
  
  console.log('Potentially large dependencies detected:');
  largeDeps.forEach(dep => {
    if (dependencies[dep] || Object.keys(dependencies).some(key => key.includes(dep))) {
      console.log(`⚠️  ${dep}`);
    }
  });
} catch (error) {
  console.log('Unable to analyze package.json');
}

console.log('\n📋 Recommendations to reduce size:');
console.log('1. Remove unused dependencies with "npx depcheck"');
console.log('2. Optimize images - compress and use WebP format');
console.log('3. Use dynamic imports for large features');
console.log('4. Check for duplicate dependencies with "npx npm-check-duplicates"');
console.log('5. Consider removing unused Expo modules');
console.log('6. Use bundle analyzer: "npx react-native-bundle-visualizer"');