import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const SettingsScreen = () => {
  const { isDarkMode, theme, colors, colorPalettes, currentColorPalette, toggleTheme, changeColorPalette } = useTheme();

  const renderColorOption = (paletteKey, palette) => {
    const isSelected = currentColorPalette === paletteKey;
    
    return (
      <TouchableOpacity
        key={paletteKey}
        style={[
          styles.colorOption,
          { 
            backgroundColor: theme.surface,
            borderColor: isSelected ? colors.primary : theme.border,
            borderWidth: isSelected ? 3 : 1
          }
        ]}
        onPress={() => changeColorPalette(paletteKey)}
      >
        <View style={[styles.colorPreview, { backgroundColor: palette.primary }]} />
        <View style={styles.colorInfo}>
          <Text style={[styles.colorName, { color: theme.text }]}>{palette.name}</Text>
          <View style={styles.colorSwatch}>
            <View style={[styles.colorDot, { backgroundColor: palette.primary }]} />
            <View style={[styles.colorDot, { backgroundColor: palette.secondary }]} />
            <View style={[styles.colorDot, { backgroundColor: palette.accent }]} />
          </View>
        </View>
        {isSelected && (
          <View style={[styles.selectedIndicator, { backgroundColor: colors.primary }]}>
            <Text style={styles.checkmark}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>Settings</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Customize your app experience
        </Text>
      </View>

      <View style={styles.content}>
        {/* Theme Toggle Section */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Appearance</Text>
          </View>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>Dark Mode</Text>
              <Text style={[styles.settingDescription, { color: theme.textSecondary }]}>
                {isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              </Text>
            </View>
            <Switch
              value={isDarkMode}
              onValueChange={toggleTheme}
              trackColor={{ 
                false: theme.border, 
                true: colors.primary 
              }}
              thumbColor={isDarkMode ? colors.accent : '#f4f3f4'}
              ios_backgroundColor={theme.border}
            />
          </View>
        </View>

        {/* Color Palette Section */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Color Theme</Text>
            <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
              Choose your preferred color scheme
            </Text>
          </View>
          
          <View style={styles.colorGrid}>
            {Object.entries(colorPalettes).map(([key, palette]) => 
              renderColorOption(key, palette)
            )}
          </View>
        </View>

        {/* Preview Section */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Preview</Text>
            <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
              See how your theme looks
            </Text>
          </View>
          
          <View style={[styles.previewCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <View style={[styles.previewHeader, { backgroundColor: colors.primary }]}>
              <Text style={styles.previewHeaderText}>Sample Header</Text>
            </View>
            <View style={styles.previewContent}>
              <Text style={[styles.previewTitle, { color: theme.text }]}>Sample Title</Text>
              <Text style={[styles.previewText, { color: theme.textSecondary }]}>
                This is how text will appear in your chosen theme.
              </Text>
              <TouchableOpacity style={[styles.previewButton, { backgroundColor: colors.accent }]}>
                <Text style={styles.previewButtonText}>Sample Button</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 20,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
  },
  colorGrid: {
    padding: 16,
  },
  colorOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
    position: 'relative',
  },
  colorPreview: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  colorInfo: {
    flex: 1,
  },
  colorName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  colorSwatch: {
    flexDirection: 'row',
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 4,
  },
  selectedIndicator: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  previewCard: {
    margin: 16,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  previewHeader: {
    padding: 12,
    alignItems: 'center',
  },
  previewHeaderText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  previewContent: {
    padding: 16,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  previewText: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  previewButton: {
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  previewButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default SettingsScreen;
