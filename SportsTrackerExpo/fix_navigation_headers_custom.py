#!/usr/bin/env python3
"""
Script to replace headerTitleStyle with custom headerTitle components that disable font scaling.
React Navigation doesn't support allowFontScaling in headerTitleStyle, so we need custom components.
"""

import os
import re

def create_header_title_component(content: str) -> str:
    """
    Add a custom HeaderTitle component and replace headerTitleStyle with headerTitle.
    """
    
    # First, add the custom HeaderTitle component import and definition after other imports
    import_pattern = r"(import { useTheme } from './src/context/ThemeContext';)"
    
    header_component = '''
// Custom header title component that disables font scaling
const HeaderTitle = ({ children, style }) => {
  const { colors } = useTheme();
  return (
    <Text 
      allowFontScaling={false} 
      style={[
        {
          fontSize: 17,
          fontWeight: 'bold',
          color: '#fff'
        },
        style
      ]}
    >
      {children}
    </Text>
  );
};'''
    
    # Add the component after ThemeContext import
    modified_content = re.sub(
        import_pattern,
        r'\1' + header_component,
        content
    )
    
    # Replace headerTitleStyle with headerTitle using custom component
    # Match patterns like:
    # headerTitleStyle: {
    #   allowFontScaling: false,
    #   fontWeight: 'bold',
    # },
    
    header_style_pattern = r'headerTitleStyle:\s*\{\s*allowFontScaling:\s*false,\s*fontWeight:\s*[\'"]bold[\'"],?\s*\},'
    
    def replace_with_header_title(match):
        return 'headerTitle: (props) => <HeaderTitle {...props} />,'
    
    modified_content = re.sub(header_style_pattern, replace_with_header_title, modified_content, flags=re.MULTILINE | re.DOTALL)
    
    # Also handle cases where there might be other properties in headerTitleStyle
    complex_pattern = r'headerTitleStyle:\s*\{[^}]*allowFontScaling:\s*false[^}]*\},'
    modified_content = re.sub(complex_pattern, replace_with_header_title, modified_content, flags=re.MULTILINE | re.DOTALL)
    
    return modified_content

def main():
    """Fix navigation headers in App.js using custom headerTitle components"""
    app_js_path = os.path.join(os.path.dirname(__file__), 'App.js')
    
    try:
        with open(app_js_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        modified_content = create_header_title_component(content)
        
        if modified_content != original_content:
            with open(app_js_path, 'w', encoding='utf-8') as f:
                f.write(modified_content)
            
            changes = len(re.findall(r'headerTitle: \(props\) => <HeaderTitle', modified_content))
            print(f"✅ Fixed App.js: Replaced headerTitleStyle with custom HeaderTitle component")
            print(f"📝 Modified {changes} navigation headers to use custom component")
            print("💡 Navigation headers now use Text component with allowFontScaling={false}!")
        else:
            print("ℹ️  No changes needed - custom HeaderTitle already implemented or no patterns found")
        
    except Exception as e:
        print(f"❌ Error processing App.js: {e}")

if __name__ == "__main__":
    main()