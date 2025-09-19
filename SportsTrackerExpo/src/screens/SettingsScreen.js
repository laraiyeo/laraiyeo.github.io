import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, FlatList } from 'react-native';
import { useFavorites } from '../context/FavoritesContext';
import { useTheme } from '../context/ThemeContext';

const SettingsScreen = () => {
  const { isDarkMode, theme, colors, colorPalettes, currentColorPalette, toggleTheme, changeColorPalette } = useTheme();
  const { favorites, removeFavorite, getFavoriteTeams, clearAllFavorites } = useFavorites();

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
          <Text allowFontScaling={false} style={[styles.colorName, { color: theme.text }]}>{palette.name}</Text>
          <View style={styles.colorSwatch}>
            <View style={[styles.colorDot, { backgroundColor: palette.primary }]} />
            <View style={[styles.colorDot, { backgroundColor: palette.secondary }]} />
            <View style={[styles.colorDot, { backgroundColor: palette.accent }]} />
          </View>
        </View>
        {isSelected && (
          <View style={[styles.selectedIndicator, { backgroundColor: colors.primary }]}>
            <Text allowFontScaling={false} style={styles.checkmark}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Text allowFontScaling={false} style={[styles.title, { color: theme.text }]}>Settings</Text>
        <Text allowFontScaling={false} style={[styles.subtitle, { color: theme.textSecondary }]}>
          Customize your app experience
        </Text>
      </View>

      <View style={styles.content}>
        {/* Theme Toggle Section */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.sectionHeader}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>Appearance</Text>
          </View>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text allowFontScaling={false} style={[styles.settingLabel, { color: theme.text }]}>Dark Mode</Text>
              <Text allowFontScaling={false} style={[styles.settingDescription, { color: theme.textSecondary }]}>
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
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>Color Theme</Text>
            <Text allowFontScaling={false} style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
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
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>Preview</Text>
            <Text allowFontScaling={false} style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
              See how your theme looks
            </Text>
          </View>
          
          <View style={[styles.previewCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <View style={[styles.previewHeader, { backgroundColor: colors.primary }]}>
              <Text allowFontScaling={false} style={styles.previewHeaderText}>Sample Header</Text>
            </View>
            <View style={styles.previewContent}>
              <Text allowFontScaling={false} style={[styles.previewTitle, { color: theme.text }]}>Sample Title</Text>
              <Text allowFontScaling={false} style={[styles.previewText, { color: theme.textSecondary }]}>
                This is how text will appear in your chosen theme.
              </Text>
              <TouchableOpacity style={[styles.previewButton, { backgroundColor: colors.accent }]}>
                <Text allowFontScaling={false} style={styles.previewButtonText}>Sample Button</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Favorites Section */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.sectionHeader}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>Favorites</Text>
            <Text allowFontScaling={false} style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>Your Favorite Teams</Text>
          </View>
          <View style={{ padding: 12 }}>
            <FlatList
              data={getFavoriteTeams()}
              keyExtractor={(item) => item.teamId ? String(item.teamId) : (item.displayName || item.teamName || Math.random()).toString()}
              numColumns={2}
              columnWrapperStyle={{ justifyContent: 'space-between', marginBottom: 6 }}
              renderItem={({ item }) => (
                <View style={[styles.favoriteTile, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text allowFontScaling={false} style={[styles.favoriteText, { color: theme.text }]} numberOfLines={1}>
                    {item.displayName || item.teamName || 'Unnamed Team'}
                  </Text>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={async () => {
                      if (item.teamId) await removeFavorite(item.teamId);
                    }}
                  >
                    <Text allowFontScaling={false} style={styles.deleteButtonText}>×</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={() => (
                <Text allowFontScaling={false} style={[styles.previewText, { color: theme.textSecondary }]}>No favorite teams yet.</Text>
              )}
            />

            <TouchableOpacity
              style={[styles.resetButton, { backgroundColor: colors.primary, opacity: (favorites && favorites.length > 0) ? 1 : 0.5 }]}
              disabled={!(favorites && favorites.length > 0)}
              onPress={async () => {
                await clearAllFavorites();
              }}
            >
              <Text allowFontScaling={false} style={styles.resetButtonText}>Reset Favorites</Text>
            </TouchableOpacity>
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
  favoriteTile: {
    flex: 1,
    minWidth: '48%',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 6,
    justifyContent: 'center',
    position: 'relative',
  },
  favoriteText: {
    fontSize: 14,
  },
  resetButton: {
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  resetButtonText: {
    color: 'white',
    fontWeight: '700',
  },
  deleteButton: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ff4d4f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: 'white',
    fontWeight: '700',
    lineHeight: 18,
    fontSize: 14,
  },
});

export default SettingsScreen;
