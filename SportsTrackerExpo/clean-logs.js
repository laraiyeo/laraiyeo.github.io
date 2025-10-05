const fs = require('fs');
const path = require('path');

// Function to remove console.log statements from a file
function removeConsoleLogs(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Remove various console log patterns
  const cleanedContent = content
    // Remove simple console.log statements
    .replace(/^\s*console\.log\([^;]*\);\s*$/gm, '')
    // Remove console.log with method chaining
    .replace(/^\s*console\.log\([^;]*\);?\s*$/gm, '')
    // Remove console statements that span multiple lines (basic cases)
    .replace(/console\.log\(\s*[^)]*\s*\);\s*/g, '')
    // Remove other console methods
    .replace(/^\s*console\.(warn|error|info|debug)\([^;]*\);\s*$/gm, '')
    // Clean up empty lines that might be left behind (max 2 consecutive empty lines)
    .replace(/\n\s*\n\s*\n/g, '\n\n');
  
  fs.writeFileSync(filePath, cleanedContent);
  console.log(`Cleaned console logs from: ${filePath}`);
}

// Function to recursively find JavaScript files
function findJSFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Skip node_modules and other build directories
      if (!['node_modules', '.expo', 'dist', 'build', '.git'].includes(item)) {
        findJSFiles(fullPath, files);
      }
    } else if (item.endsWith('.js') || item.endsWith('.jsx') || item.endsWith('.ts') || item.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Main execution
const projectRoot = path.join(__dirname, 'src');
console.log(`Cleaning console logs from: ${projectRoot}`);

try {
  const jsFiles = findJSFiles(projectRoot);
  console.log(`Found ${jsFiles.length} files to process`);
  
  jsFiles.forEach(removeConsoleLogs);
  
  console.log('Console log cleanup completed!');
} catch (error) {
  console.error('Error during cleanup:', error);
}