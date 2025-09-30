import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, TextInput, Modal } from 'react-native';
import { useFavorites } from '../context/FavoritesContext';
import { useTheme } from '../context/ThemeContext';
import { useChat } from '../context/ChatContext';

const SettingsScreen = ({ navigation }) => {
  const { isDarkMode, theme, colors, colorPalettes, currentColorPalette, toggleTheme, changeColorPalette } = useTheme();
  const { favorites, removeFavorite, getFavoriteTeams, clearAllFavorites } = useFavorites();
  const { userName, userColor, updateUserName, updateUserColor, nameColors } = useChat();
  
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [tempUsername, setTempUsername] = useState(userName);
  const [colorModalVisible, setColorModalVisible] = useState(false);

  const renderColorOption = (paletteKey, palette) => {
    const isSelected = currentColorPalette === paletteKey;
    
    return (
      <TouchableOpacity
        key={paletteKey}
        style={[
          styles.colorOption1,
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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
    <ScrollView style={{ flex: 1 }}>
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
          
          <View style={styles.colorGrid1}>
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

        {/* Chat Settings Section */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.sectionHeader}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>Chat Settings</Text>
            <Text allowFontScaling={false} style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
              Customize your chat appearance
            </Text>
          </View>
          
          {/* Username Setting */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text allowFontScaling={false} style={[styles.settingLabel, { color: theme.text }]}>
                Username
              </Text>
              <Text allowFontScaling={false} style={[styles.settingDescription, { color: theme.textSecondary }]}>
                Your display name in chat: {userName}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.openSettingsButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                setTempUsername(userName);
                setIsEditingUsername(true);
              }}
              activeOpacity={0.7}
            >
              <Text allowFontScaling={false} style={styles.openSettingsButtonText}>
                Edit
              </Text>
            </TouchableOpacity>
          </View>

          {/* Name Color Setting */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text allowFontScaling={false} style={[styles.settingLabel, { color: theme.text }]}>
                Name Color
              </Text>
              <Text allowFontScaling={false} style={[styles.settingDescription, { color: theme.textSecondary }]}>
                Choose your name color in chat
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.colorPreviewButton, { backgroundColor: userColor }]}
              onPress={() => setColorModalVisible(true)}
              activeOpacity={0.7}
            >
              <View style={[styles.colorDot, { backgroundColor: userColor }]} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Favorites Section */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.sectionHeader}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>Favorites</Text>
            <Text allowFontScaling={false} style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
              Manage your favorite teams
            </Text>
          </View>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text allowFontScaling={false} style={[styles.settingLabel, { color: theme.text }]}>
                Favorite Teams
              </Text>
              <Text allowFontScaling={false} style={[styles.settingDescription, { color: theme.textSecondary }]}>
                {getFavoriteTeams().length === 0 
                  ? 'No favorite teams yet' 
                  : `${getFavoriteTeams().length} favorite team${getFavoriteTeams().length !== 1 ? 's' : ''}`
                }
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.openSettingsButton, { backgroundColor: colors.primary }]}
              onPress={() => navigation.navigate('FavoritesManagement')}
              activeOpacity={0.7}
            >
              <Text allowFontScaling={false} style={styles.openSettingsButtonText}>
                Open Settings
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>

      {/* Username Edit Modal */}
      <Modal
        visible={isEditingUsername}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsEditingUsername(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <Text allowFontScaling={false} style={[styles.modalTitle, { color: theme.text }]}>
              Edit Username
            </Text>
            
            <TextInput
              style={[
                styles.usernameInput,
                { 
                  backgroundColor: theme.background,
                  color: theme.text,
                  borderColor: theme.border 
                }
              ]}
              value={tempUsername}
              onChangeText={setTempUsername}
              placeholder="Enter username"
              placeholderTextColor={theme.textSecondary}
              maxLength={20}
              autoFocus={true}
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.border }]}
                onPress={() => setIsEditingUsername(false)}
              >
                <Text allowFontScaling={false} style={[styles.modalButtonText, { color: theme.text }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={() => {
                  if (tempUsername.trim()) {
                    updateUserName(tempUsername.trim());
                  }
                  setIsEditingUsername(false);
                }}
              >
                <Text allowFontScaling={false} style={[styles.modalButtonText, { color: '#fff' }]}>
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Color Selection Modal */}
      <Modal
        visible={colorModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setColorModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <Text allowFontScaling={false} style={[styles.modalTitle, { color: theme.text }]}>
              Choose Name Color
            </Text>
            
            <View style={styles.colorGrid}>
              {nameColors.map((color, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.colorOption,
                    { 
                      backgroundColor: color,
                      borderColor: userColor === color ? '#fff' : 'transparent',
                      borderWidth: userColor === color ? 3 : 0
                    }
                  ]}
                  onPress={() => {
                    updateUserColor(color);
                    setColorModalVisible(false);
                  }}
                >
                  {userColor === color && (
                    <Text allowFontScaling={false} style={styles.selectedColorCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            
            <TouchableOpacity
              style={[styles.colorModalCloseButton, { backgroundColor: theme.border, alignSelf: 'center' }]}
              onPress={() => setColorModalVisible(false)}
            >
              <Text allowFontScaling={false} style={[styles.modalButtonText, { color: theme.text }]}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
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
  colorGrid1: {
    padding: 16,
  },
  colorOption1: {
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
  openSettingsButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openSettingsButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  colorPreviewButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  usernameInput: {
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 20,
  },
  colorOption: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 8,
  },
  
  /* Close button in color modal should be compact and centered */
  colorModalCloseButton: {
    height: 44,
    minWidth: 120,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  selectedColorCheck: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
});

export default SettingsScreen;
