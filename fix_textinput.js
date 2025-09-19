const fs = require('fs');
const path = require('path');

// Function to recursively find all JS files
function findJSFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      findJSFiles(fullPath, files);
    } else if (item.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Function to fix TextInput issues in a file
function fixTextInputInFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Fix the specific typo: Text allowFontScaling={false}Input -> TextInput
    content = content.replace(
      /<Text allowFontScaling=\{false\}Input/g,
      '<TextInput'
    );
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Fixed: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return false;
  }
}

// Main execution
const projectDir = './SportsTrackerExpo/src';
const jsFiles = findJSFiles(projectDir);
let fixedCount = 0;

console.log(`Found ${jsFiles.length} JS files to check...`);

for (const file of jsFiles) {
  if (fixTextInputInFile(file)) {
    fixedCount++;
  }
}

console.log(`Fixed ${fixedCount} files with TextInput issues.`);