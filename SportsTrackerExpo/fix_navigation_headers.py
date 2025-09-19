#!/usr/bin/env python3
"""
Script to add allowFontScaling: false to all headerTitleStyle objects in App.js
"""

import os
import re

def fix_header_title_styles(content: str) -> str:
    """
    Add allowFontScaling: false to all headerTitleStyle objects.
    """
    # Pattern to match headerTitleStyle: { with content until the closing }
    # We need to handle nested objects carefully
    
    # First approach: find headerTitleStyle: { and add allowFontScaling: false after the opening brace
    pattern = r'(headerTitleStyle:\s*\{)'
    
    def add_font_scaling(match):
        opening = match.group(1)
        return opening + '\n            allowFontScaling: false,'
    
    modified_content = re.sub(pattern, add_font_scaling, content)
    return modified_content

def main():
    """Fix navigation headers in App.js"""
    app_js_path = r'c:\live-sports-tracker\SportsTrackerExpo\App.js'
    
    if not os.path.exists(app_js_path):
        print(f"❌ App.js not found at: {app_js_path}")
        return
    
    print(f"🔍 Processing App.js: {app_js_path}")
    
    try:
        with open(app_js_path, 'r', encoding='utf-8') as f:
            original_content = f.read()
        
        # Count existing headerTitleStyle occurrences
        header_count = original_content.count('headerTitleStyle:')
        
        if header_count == 0:
            print("ℹ️  No headerTitleStyle found in App.js")
            return
        
        # Apply the fix
        fixed_content = fix_header_title_styles(original_content)
        
        # Write back the fixed content
        with open(app_js_path, 'w', encoding='utf-8') as f:
            f.write(fixed_content)
        
        print(f"✅ Fixed App.js: Added allowFontScaling: false to {header_count} headerTitleStyle objects")
        print("💡 Navigation headers should now ignore dynamic text scaling!")
        
    except Exception as e:
        print(f"❌ Error processing App.js: {e}")

if __name__ == "__main__":
    main()