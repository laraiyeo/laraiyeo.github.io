import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Image, Animated, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFavorites } from '../context/FavoritesContext';
import { useTheme } from '../context/ThemeContext';
import { useChat } from '../context/ChatContext';
import UpdateService from '../services/UpdateService';

const SettingsScreen = ({ navigation }) => {
  const { isDarkMode, theme, colors, colorPalettes, currentColorPalette, toggleTheme, changeColorPalette, getCurrentAppIcon } = useTheme();
  const { favorites, removeFavorite, getFavoriteTeams, clearAllFavorites } = useFavorites();
  const { userName, userColor, updateUserName, updateUserColor, nameColors } = useChat();
  
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [tempUsername, setTempUsername] = useState(userName);
  const [colorModalVisible, setColorModalVisible] = useState(false);

  // Username change restriction state
  const [lastUsernameChange, setLastUsernameChange] = useState(null);
  const [canChangeUsername, setCanChangeUsername] = useState(true);
  const [daysUntilNextChange, setDaysUntilNextChange] = useState(0);

  // Streaming code state
  const [streamingCode, setStreamingCode] = useState('');
  const [isStreamingUnlocked, setIsStreamingUnlocked] = useState(false);
  const [confirmClickCount, setConfirmClickCount] = useState(0);
  const [bannerAnimation] = useState(new Animated.Value(-100));
  const [showBanner, setShowBanner] = useState(false);
  const [bannerMessage, setBannerMessage] = useState('');
  const [bannerType, setBannerType] = useState('success'); // 'success' or 'error'

  // Update check state
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);

  // Manual update check function
  const handleCheckForUpdates = async () => {
    setIsCheckingForUpdates(true);
    
    try {
      await UpdateService.checkForUpdatesManually(
        // onUpdateAvailable
        () => {
          Alert.alert(
            'Update Available',
            'A new version of the app has been downloaded. Restart the app to apply the update?',
            [
              { text: 'Later', style: 'cancel' },
              { 
                text: 'Restart Now', 
                onPress: () => UpdateService.restartApp()
              }
            ]
          );
        },
        // onNoUpdate
        () => {
          showBannerMessage('You have the latest version!', 'success');
        },
        // onError
        (error) => {
          showBannerMessage('Failed to check for updates', 'error');
          console.error('Update check error:', error);
        }
      );
    } catch (error) {
      showBannerMessage('Failed to check for updates', 'error');
      console.error('Update check failed:', error);
    } finally {
      setIsCheckingForUpdates(false);
    }
  };

  // Function to get the current app icon image source
  const getCurrentAppIconSource = () => {
    const theme = isDarkMode ? 'dark' : 'light';
    const iconMap = {
      'dark-blue': require('../../assets/dark/blue.png'),
      'dark-red': require('../../assets/dark/red.png'),
      'dark-green': require('../../assets/dark/green.png'),
      'dark-purple': require('../../assets/dark/purple.png'),
      'dark-gold': require('../../assets/dark/gold.png'),
      'light-blue': require('../../assets/light/blue.png'),
      'light-red': require('../../assets/light/red.png'),
      'light-green': require('../../assets/light/green.png'),
      'light-purple': require('../../assets/light/purple.png'),
      'light-gold': require('../../assets/light/gold.png'),
    };
    
    const iconKey = `${theme}-${currentColorPalette}`;
    return iconMap[iconKey] || iconMap['dark-red']; // fallback to default
  };

  // Check streaming unlock status on component mount
  useEffect(() => {
    checkStreamingUnlockStatus();
    checkUsernameChangeRestriction();
  }, []);

  const checkStreamingUnlockStatus = async () => {
    try {
      const unlocked = await AsyncStorage.getItem('streamingUnlocked');
      setIsStreamingUnlocked(unlocked === 'true');
    } catch (error) {
      console.error('Error checking streaming unlock status:', error);
    }
  };

  const checkUsernameChangeRestriction = async () => {
    try {
      const lastChange = await AsyncStorage.getItem('lastUsernameChange');
      if (lastChange) {
        const lastChangeDate = new Date(lastChange);
        const currentDate = new Date();
        const daysDifference = Math.floor((currentDate - lastChangeDate) / (1000 * 60 * 60 * 24));
        const daysRemaining = 30 - daysDifference;
        
        if (daysRemaining > 0) {
          setCanChangeUsername(false);
          setDaysUntilNextChange(daysRemaining);
        } else {
          setCanChangeUsername(true);
          setDaysUntilNextChange(0);
        }
        setLastUsernameChange(lastChangeDate);
      } else {
        setCanChangeUsername(true);
        setDaysUntilNextChange(0);
      }
    } catch (error) {
      console.error('Error checking username change restriction:', error);
    }
  };

  const handleUsernameChange = async (newUsername) => {
    if (!canChangeUsername) {
      showBannerMessage(`You can change your username in ${daysUntilNextChange} days`, 'error');
      return;
    }

    try {
      const currentDate = new Date().toISOString();
      await AsyncStorage.setItem('lastUsernameChange', currentDate);
      updateUserName(newUsername);
      setCanChangeUsername(false);
      setDaysUntilNextChange(30);
      setLastUsernameChange(new Date(currentDate));
      showBannerMessage('Username changed successfully!', 'success');
    } catch (error) {
      console.error('Error saving username change date:', error);
      showBannerMessage('Error updating username', 'error');
    }
  };

  const showBannerMessage = (message, type = 'success') => {
    setBannerMessage(message);
    setBannerType(type);
    setShowBanner(true);
    
    // Animate banner down
    Animated.timing(bannerAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Hide banner after 3 seconds
    setTimeout(() => {
      Animated.timing(bannerAnimation, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setShowBanner(false);
      });
    }, 3000);
  };

  const handleStreamingCodeSubmit = async () => {
    // If text input is not yet unlocked, increment click count
    if (confirmClickCount < 3) {
      const newClickCount = confirmClickCount + 1;
      setConfirmClickCount(newClickCount);
    }

    // Original code submission logic (only runs when text input is unlocked)
    const correctCode = '20250417';
    
    if (streamingCode === correctCode) {
      try {
        await AsyncStorage.setItem('streamingUnlocked', 'true');
        setIsStreamingUnlocked(true);
        setStreamingCode('');
        showBannerMessage('Success! Streaming is unlocked.', 'success');
      } catch (error) {
        console.error('Error saving streaming unlock status:', error);
        showBannerMessage('Error saving unlock status.', 'error');
      }
    } else {
      showBannerMessage('Wrong answer. Try again.', 'error');
      setStreamingCode('');
    }
  };

  const handleResetStreamingAccess = () => {
    Alert.alert(
      'Reset Special Access',
      'This will remove your special access. Are you sure you want to continue?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('streamingUnlocked');
              setIsStreamingUnlocked(false);
              setStreamingCode('');
              setConfirmClickCount(0); // Reset click count
              showBannerMessage('Special access has been reset.', 'error');
            } catch (error) {
              console.error('Error resetting streaming access:', error);
            }
          },
        },
      ]
    );
  };

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
      {/* Success/Error Banner */}
      {showBanner && (
        <Animated.View 
          style={[
            styles.bannerContainer, 
            {
              backgroundColor: bannerType === 'success' ? '#4CAF50' : '#F44336',
              transform: [{ translateY: bannerAnimation }]
            }
          ]}
        >
          <Text allowFontScaling={false} style={styles.bannerText}>{bannerMessage}</Text>
        </Animated.View>
      )}
      
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
            <TouchableOpacity 
              onPress={toggleTheme}
              style={[styles.toggleButton, { 
                backgroundColor: isDarkMode ? colors.primary : theme.border 
              }]}
            >
              <View style={[styles.toggleThumb, { 
                backgroundColor: isDarkMode ? colors.accent : '#f4f3f4',
                transform: [{ translateX: isDarkMode ? 22 : 2 }]
              }]} />
            </TouchableOpacity>
          </View>
          
          <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: theme.borderSecondary }]}>
            <View style={styles.settingInfo}>
              <Text allowFontScaling={false} style={[styles.settingLabel, { color: theme.text }]}>App Icon</Text>
              <Text allowFontScaling={false} style={[styles.settingDescription, { color: theme.textSecondary }]}>
                Preview: {getCurrentAppIcon && getCurrentAppIcon().replace('-', ' ').toUpperCase()}
              </Text>
            </View>
            <View style={[styles.appIconPreview, { borderColor: colors.primary }]}>
              <Image 
                source={getCurrentAppIconSource()} 
                style={styles.appIconImage}
                resizeMode="contain"
              />
            </View>
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

        {/* Streaming Code Section */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.sectionHeader}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>Special Access</Text>
            <Text allowFontScaling={false} style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
              {isStreamingUnlocked ? 'Streaming is currently unlocked' : 'Unlock special features'}
            </Text>
          </View>
          
          {!isStreamingUnlocked && (
            <>
              {/* The Challenge Question */}
              <View style={styles.challengeQuestion}>
                <Text allowFontScaling={false} style={[styles.challengeQuestionText, { color: theme.text }]}>
                  You're in a universe where causality flows backward, and a species communicates using Fibonacci-encoded qubits. They challenge you to send back the first English word whose letters match the numbers 3, 1, 4, 1, 5 (the first digits of pi), with A=1, B=2, ..., Z=26.

What word do you send?
                </Text>
              </View>

              {/* Code Input */}
              <View style={styles.codeInputContainer}>
                <Text allowFontScaling={false} style={[styles.codeLabel, { color: theme.text }]}>Code</Text>
                <TextInput
                  style={[styles.codeInput, { 
                    backgroundColor: theme.surfaceSecondary, 
                    borderColor: theme.border,
                    color: confirmClickCount >= 3 ? theme.text : theme.textTertiary,
                    opacity: confirmClickCount >= 3 ? 1 : 0.6
                  }]}
                  value={streamingCode}
                  onChangeText={confirmClickCount >= 3 ? setStreamingCode : undefined}
                  placeholder={confirmClickCount >= 3 ? "Enter your answer" : "Coming Soon!"}
                  placeholderTextColor={theme.textTertiary}
                  editable={confirmClickCount >= 3}
                  selectTextOnFocus={confirmClickCount >= 3}
                />
              </View>

              {/* Buttons */}
              <View style={styles.streamingButtonContainer}>
                <TouchableOpacity
                  style={[styles.confirmButton, { backgroundColor: colors.primary }]}
                  onPress={handleStreamingCodeSubmit}
                >
                  <Text allowFontScaling={false} style={styles.confirmButtonText}>Confirm</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.resetButton, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
                  onPress={handleResetStreamingAccess}
                >
                  <Text allowFontScaling={false} style={[styles.resetButtonTextSymbol, { color: theme.text }]}>⟲</Text>
                </TouchableOpacity>
              </View>

              {/* Discord Reference */}
              <Text allowFontScaling={false} style={[styles.discordText, { color: theme.textTertiary }]}>
                Check Discord
              </Text>
            </>
          )}

          {isStreamingUnlocked && (
            <View style={styles.streamingUnlockedContainer}>
              <Text allowFontScaling={false} style={[styles.streamingUnlockedText, { color: colors.accent }]}>
                ✓ Streaming features are unlocked
              </Text>
              <TouchableOpacity
                style={[styles.resetButton, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, marginTop: 10 }]}
                onPress={handleResetStreamingAccess}
              >
                <Text allowFontScaling={false} style={[styles.resetButtonText]}>
                  <Text style={{ color: theme.text, fontSize: 25 }}>⟲</Text>
                  <Text style={{ color: theme.text }}> Reset Access</Text>
                </Text>
              </TouchableOpacity>
            </View>
          )}
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
              {!canChangeUsername && (
                <Text allowFontScaling={false} style={[styles.restrictionMessage, { color: theme.textTertiary }]}>
                  You will be able to change your name in {daysUntilNextChange} day{daysUntilNextChange !== 1 ? 's' : ''}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={[styles.openSettingsButton, { 
                backgroundColor: canChangeUsername ? colors.primary : theme.surfaceSecondary,
                opacity: canChangeUsername ? 1 : 0.6
              }]}
              onPress={() => {
                if (canChangeUsername) {
                  setTempUsername(userName);
                  setIsEditingUsername(true);
                } else {
                  showBannerMessage(`You can change your username in ${daysUntilNextChange} days`, 'error');
                }
              }}
              activeOpacity={0.7}
            >
              <Text allowFontScaling={false} style={[styles.openSettingsButtonText, {
                color: canChangeUsername ? '#fff' : theme.text
              }]}>
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

        {/* App Updates Section */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.sectionHeader, {borderBottomColor: theme.surface }]}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>App Updates</Text>
            <Text allowFontScaling={false} style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
              Check for the latest version
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.updateButton, { 
              backgroundColor: theme.surfaceSecondary,
              opacity: isCheckingForUpdates ? 0.6 : 1
            }]}
            onPress={handleCheckForUpdates}
            disabled={isCheckingForUpdates}
          >
            <View style={styles.updateButtonContent}>
              <Text allowFontScaling={false} style={[styles.updateButtonText, { color: theme.text }]}>
                {isCheckingForUpdates ? 'Checking for Updates...' : 'Check for Updates'}
              </Text>
              <Text allowFontScaling={false} style={[styles.updateButtonSubtext, { color: theme.textSecondary }]}>
                {isCheckingForUpdates ? 'Please wait...' : 'Tap to check for app updates'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Contact Section */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.sectionHeader, {borderBottomColor: theme.surface }]}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>Contact</Text>
            <Text allowFontScaling={false} style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
              Connect with us on social media
            </Text>
          </View>
          
          <View style={styles.contactRow}>
            <TouchableOpacity
              style={[styles.contactButton, { backgroundColor: theme.surfaceSecondary }]}
              onPress={() => Linking.openURL('https://discord.gg/fGt3sMfwge')}
              activeOpacity={0.7}
            >
              <Image 
                source={require('../../assets/discord.png')} 
                style={styles.contactIcon}
                resizeMode="contain"
              />
              <Text allowFontScaling={false} style={[styles.contactLabel, { color: theme.text }]}>
                Discord
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.contactButton, { backgroundColor: theme.surfaceSecondary }]}
              onPress={() => Linking.openURL('https://x.com/sportsheart_')}
              activeOpacity={0.7}
            >
              <Image 
                source={require('../../assets/x.png')} 
                style={styles.contactIcon}
                resizeMode="contain"
                tintColor={theme.text}
              />
              <Text allowFontScaling={false} style={[styles.contactLabel, { color: theme.text }]}>
                X (Twitter)
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
                    handleUsernameChange(tempUsername.trim());
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
  restrictionMessage: {
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
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
  appIconPreview: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIconImage: {
    width: 40,
    height: 40,
  },
  // Streaming Code Styles
  bannerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 12,
    paddingHorizontal: 20,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  challengeQuestion: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginHorizontal: 12,
  },
  challengeQuestionText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'justify',
  },
  codeInputContainer: {
    marginBottom: 16,
    marginHorizontal: 12,
  },
  codeLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  codeInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  streamingButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginHorizontal: 12,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 10,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resetButton: {
    paddingHorizontal: 5,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 45,
  },
  resetButtonTextSymbol: {
    fontSize: 35,
    fontWeight: 'bold',
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  discordText: {
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  streamingUnlockedContainer: {
    alignItems: 'center',
    padding: 16,
  },
  streamingUnlockedText: {
    marginTop: -6,
    fontSize: 16,
    fontWeight: 'bold',
  },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  contactButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    minWidth: 120,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
  },
  contactIcon: {
    width: 32,
    height: 32,
    marginBottom: 8,
  },
  contactLabel: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  updateButton: {
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
  },
  updateButtonContent: {
    alignItems: 'center',
  },
  updateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  updateButtonSubtext: {
    fontSize: 12,
  },
  toggleButton: {
    width: 50,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    padding: 2,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
});

export default SettingsScreen;
