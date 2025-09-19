#!/usr/bin/env python3
"""
Script to revert the broken changes from the previous script.
This will remove the incorrectly placed allowFontScaling={false} attributes.
"""

import os
import glob
from typing import List

def find_js_files(screens_dir: str) -> List[str]:
    """Find all JavaScript/TypeScript files in the screens directory."""
    patterns = ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx']
    js_files = []
    
    for pattern in patterns:
        files = glob.glob(os.path.join(screens_dir, pattern), recursive=True)
        js_files.extend(files)
    
    return js_files

def revert_broken_changes(content: str) -> str:
    """Revert the broken allowFontScaling attributes that were added incorrectly."""
    
    # Remove the incorrectly placed allowFontScaling={false} that appear after other attributes
    # This will find patterns like: style={...} allowFontScaling={false}> 
    # and revert them back to: style={...}>
    
    import re
    
    # Pattern to find allowFontScaling={false} that appears after other attributes/props
    # This matches: (any chars) allowFontScaling={false}(optional space)>
    pattern = r'(\S+.*?)\s+allowFontScaling=\{false\}(\s*>)'
    
    # Replace with just the original content and closing >
    modified_content = re.sub(pattern, r'\1\2', content)
    
    return modified_content

def revert_file(file_path: str) -> int:
    """Revert a single file and return the number of changes made."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            original_content = f.read()
        
        # Skip files that don't contain allowFontScaling
        if 'allowFontScaling={false}' not in original_content:
            return 0
        
        reverted_content = revert_broken_changes(original_content)
        
        changes_made = original_content.count('allowFontScaling={false}') - reverted_content.count('allowFontScaling={false}')
        
        if changes_made > 0:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(reverted_content)
            print(f"✅ Reverted {file_path}: {changes_made} broken allowFontScaling attributes removed")
        else:
            print(f"ℹ️  {file_path}: No broken attributes found")
        
        return changes_made
    
    except Exception as e:
        print(f"❌ Error processing {file_path}: {e}")
        return 0

def main():
    """Main function to revert all broken changes."""
    screens_dir = r'c:\live-sports-tracker\SportsTrackerExpo\src\screens'
    
    if not os.path.exists(screens_dir):
        print(f"❌ Directory not found: {screens_dir}")
        return
    
    print(f"🔄 Reverting broken changes in: {screens_dir}")
    
    js_files = find_js_files(screens_dir)
    
    if not js_files:
        print("❌ No JavaScript files found")
        return
    
    print(f"📁 Found {len(js_files)} JavaScript files")
    print("=" * 60)
    
    total_reverted = 0
    files_reverted = 0
    
    for file_path in js_files:
        reverted = revert_file(file_path)
        total_reverted += reverted
        if reverted > 0:
            files_reverted += 1
    
    print("=" * 60)
    print(f"✅ Revert complete!")
    print(f"📊 Files processed: {len(js_files)}")
    print(f"📝 Files reverted: {files_reverted}")
    print(f"🔧 Total broken attributes removed: {total_reverted}")

if __name__ == "__main__":
    main()