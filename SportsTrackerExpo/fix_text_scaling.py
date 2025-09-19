#!/usr/bin/env python3
"""
Script to add allowFontScaling={false} to all Text components in React Native screens.
This script will find all <Text elements and ensure they have allowFontScaling={false}.
"""

import os
import re
import glob
from typing import List, Tuple

def find_js_files(screens_dir: str) -> List[str]:
    """Find all JavaScript/TypeScript files in the screens directory."""
    patterns = ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx']
    js_files = []
    
    for pattern in patterns:
        files = glob.glob(os.path.join(screens_dir, pattern), recursive=True)
        js_files.extend(files)
    
    return js_files

def process_text_components(content: str) -> Tuple[str, int]:
    """
    Process the file content to add allowFontScaling={false} to Text components.
    Returns the modified content and the number of changes made.
    """
    changes_made = 0
    
    # First, find all <Text tags that don't already have allowFontScaling
    lines = content.split('\n')
    modified_lines = []
    
    for line in lines:
        original_line = line
        
        # Skip lines that already have allowFontScaling
        if 'allowFontScaling' in line:
            modified_lines.append(line)
            continue
        
        # Look for <Text patterns
        import re
        text_matches = re.finditer(r'<Text(\s+[^>]*?)?(>|$)', line)
        
        for match in text_matches:
            start_pos = match.start()
            attrs = match.group(1) if match.group(1) else ''
            ending = match.group(2)
            
            # Build the replacement
            if attrs and attrs.strip():
                # Add allowFontScaling to existing attributes
                replacement = f'<Text{attrs} allowFontScaling={{false}}{ending}'
            else:
                # No existing attributes
                replacement = f'<Text allowFontScaling={{false}}{ending}'
            
            # Replace in the line
            line = line[:start_pos] + replacement + line[match.end():]
            changes_made += 1
            break  # Only process first match per line to avoid issues
        
        modified_lines.append(line)
    
    return '\n'.join(modified_lines), changes_made

def update_file(file_path: str) -> int:
    """Update a single file and return the number of changes made."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            original_content = f.read()
        
        # Skip files that don't contain <Text
        if '<Text' not in original_content:
            return 0
        
        modified_content, changes_made = process_text_components(original_content)
        
        if changes_made > 0:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(modified_content)
            print(f"✅ Updated {file_path}: {changes_made} Text components modified")
        else:
            print(f"ℹ️  {file_path}: No changes needed (allowFontScaling already present or no Text components)")
        
        return changes_made
    
    except Exception as e:
        print(f"❌ Error processing {file_path}: {e}")
        return 0

def main():
    """Main function to process all files."""
    # Define the screens directory path
    screens_dir = r'c:\live-sports-tracker\SportsTrackerExpo\src\screens'
    
    # Check if directory exists
    if not os.path.exists(screens_dir):
        print(f"❌ Directory not found: {screens_dir}")
        return
    
    print(f"🔍 Searching for JavaScript files in: {screens_dir}")
    
    # Find all JS files
    js_files = find_js_files(screens_dir)
    
    if not js_files:
        print("❌ No JavaScript files found in the screens directory")
        return
    
    print(f"📁 Found {len(js_files)} JavaScript files")
    print("=" * 60)
    
    total_changes = 0
    files_modified = 0
    
    # Process each file
    for file_path in js_files:
        changes = update_file(file_path)
        total_changes += changes
        if changes > 0:
            files_modified += 1
    
    print("=" * 60)
    print(f"✅ Processing complete!")
    print(f"📊 Files processed: {len(js_files)}")
    print(f"📝 Files modified: {files_modified}")
    print(f"🔧 Total Text components updated: {total_changes}")
    
    if total_changes > 0:
        print("\n🎉 Successfully added allowFontScaling={false} to all Text components!")
        print("💡 Restart your Expo server to see the changes take effect.")
    else:
        print("\n💡 All Text components already have allowFontScaling properly configured.")

if __name__ == "__main__":
    main()