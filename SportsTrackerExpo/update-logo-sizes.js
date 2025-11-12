#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration
const SEARCH_PATTERN = 'png&w=200&h=200';
const REPLACE_PATTERN = 'png&w=200&h=200';
const FILE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.json'];

// Check if dry run mode
const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');

console.log('Starting logo size replacement...');
console.log(`Search pattern: ${SEARCH_PATTERN}`);
console.log(`Replace pattern: ${REPLACE_PATTERN}`);
console.log(`Dry run mode: ${isDryRun}`);
console.log('');

let filesModified = 0;
let totalReplacements = 0;

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            // Skip node_modules and .git directories
            if (file !== 'node_modules' && file !== '.git' && !file.startsWith('.')) {
                walkDir(filePath);
            }
        } else {
            const ext = path.extname(file);
            if (FILE_EXTENSIONS.includes(ext)) {
                processFile(filePath);
            }
        }
    });
}

function processFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        if (content.includes(SEARCH_PATTERN)) {
            const matches = (content.match(new RegExp(escapeRegex(SEARCH_PATTERN), 'g')) || []).length;
            
            console.log(`Processing: ${path.relative(process.cwd(), filePath)}`);
            console.log(`  Found ${matches} occurrence(s)`);
            
            if (!isDryRun) {
                const newContent = content.replace(new RegExp(escapeRegex(SEARCH_PATTERN), 'g'), REPLACE_PATTERN);
                fs.writeFileSync(filePath, newContent, 'utf8');
                console.log('  ✓ Updated');
            } else {
                console.log('  [DRY RUN] Would update');
            }
            
            filesModified++;
            totalReplacements += matches;
            console.log('');
        }
    } catch (error) {
        console.error(`Error processing ${filePath}: ${error.message}`);
    }
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Start processing from current directory
try {
    walkDir(process.cwd());
    
    console.log('============================================');
    console.log('Summary:');
    console.log(`Files modified: ${filesModified}`);
    console.log(`Total replacements: ${totalReplacements}`);
    
    if (isDryRun) {
        console.log('');
        console.log('DRY RUN - No files were modified');
        console.log('Run without --dry-run to apply changes:');
        console.log('node update-logo-sizes.js');
    } else {
        console.log('');
        console.log('Logo size replacement completed!');
    }
    
} catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
}