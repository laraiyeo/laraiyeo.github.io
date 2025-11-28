import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { FontAwesome6, FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import analyticsService from '../services/AnalyticsService';
import UpdateService from '../services/UpdateService';

const HomeScreen = () => {
  const navigation = useNavigation();
  const { theme, colors } = useTheme();
  
  // Update popup state
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  
  // Manual features list - update this when you have new features
  const updateFeatures = [
    'Added live game tracking to Soccer and NBA.',
  ];

  const sports = [
    {
      id: 'mlb',
      title: 'MLB',
      description: 'View all live MLB games happening right now.',
      icon: require('../../assets/mlb.png'),
      color: colors.primary
    },
    {
      id: 'nhl',
      title: 'NHL',
      description: 'View all live NHL games happening right now.',
      icon: require('../../assets/nhl.png'),
      color: colors.primary
    },
    {
      id: 'nba',
      title: 'NBA',
      description: 'View all live NBA games happening right now.',
      icon: require('../../assets/nba.png'),
      color: colors.primary
    },
    {
      id: 'nfl',
      title: 'NFL',
      description: 'View all live NFL games happening right now.',
      icon: require('../../assets/nfl.png'),
      color: colors.primary
    },
    {
      id: 'soccer',
      title: 'SOCCER',
      description: 'View all live Soccer matches happening right now.',
      icon: require('../../assets/soccer.png'),
      color: colors.primary
    },
    {
      id: 'wnba',
      title: 'WNBA',
      description: 'View all live WNBA games happening right now.',
      icon: require('../../assets/wnba.png'),
      color: colors.primary
    },
    {
      id: 'f1',
      title: 'F1',
      description: 'View all live F1 races happening right now.',
      icon: require('../../assets/f1.png'),
      color: colors.primary
    },
    {
      id: 'esports',
      title: 'ESPORTS',
      description: 'View all live E-Sports games happening right now.',
      iconName: 'computer',
      color: colors.primary
    }
  ];

  // Check for update restart on component mount and set up update checking
  useEffect(() => {
    const checkForUpdateRestart = async () => {
      try {
        const restartResult = await UpdateService.checkAndClearUpdateRestart();
        if (restartResult.didRestart) {
          // Show "What's New" popup after restart
          setTimeout(() => {
            setShowUpdateModal(true);
          }, 500); // 500ms delay as requested
        }
      } catch (error) {
        console.error('Error checking update restart:', error);
      }
    };

    const setupUpdateCheck = async () => {
      try {
        // Check for updates and show prompt if available
        await UpdateService.checkForUpdatesOnStartup(() => {
          setShowUpdatePrompt(true);
        });
      } catch (error) {
        console.error('Error setting up update check:', error);
      }
    };

    checkForUpdateRestart();
    setupUpdateCheck();
  }, []);

  const handleSportPress = async (sport) => {
    // Log analytics event for sport selection
    analyticsService.logSportSelection(sport.id);
    
    navigation.navigate('SportTabs', { sport: sport.id });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View style={styles.titleContainer}>
          <Text allowFontScaling={false} style={[styles.title, { color: theme.text }]}>SportsHeart</Text>
          <FontAwesome name="heart" size={24} color={colors.primary} style={styles.heartIcon} />
        </View>
        <Text allowFontScaling={false} style={[styles.subtitle, { color: theme.textSecondary }]}>Choose your sport to get started</Text>
      </View>
      
      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        <View style={styles.sportsGrid}>
        {sports.map((sport) => (
          <TouchableOpacity
            key={sport.id}
            style={[styles.sportCard, { backgroundColor: theme.surface, borderColor: sport.color }]}
            onPress={() => handleSportPress(sport)}
            activeOpacity={0.8}
          >
            <View style={styles.sportContent}>
              <View style={styles.iconWrapper}>
                {sport.icon ? (
                  <Image source={sport.icon} style={styles.sportIconImage} />
                ) : (
                  <FontAwesome6 name={sport.iconName} size={48} color={sport.color} style={styles.sportIconFA} />
                )}
              </View>

              <Text allowFontScaling={false} style={[styles.sportTitle, { color: sport.color }]}>{sport.title}</Text>
              <Text allowFontScaling={false} style={[styles.sportDescription, { color: theme.textSecondary }]}>{sport.description}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>

      {/* Update Modal */}
      <Modal
        visible={showUpdateModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowUpdateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.updateModal, { backgroundColor: theme.surface }]}>
            <View style={[styles.updateHeader, { backgroundColor: colors.primary }]}>
              <Text allowFontScaling={false} style={styles.updateTitle}>
                🎉 App Updated!
              </Text>
            </View>
            
            <View style={styles.updateContent}>
              <Text allowFontScaling={false} style={[styles.updateSubtitle, { color: theme.text }]}>
                What's New
              </Text>
              
              <View style={styles.featuresList}>
                {updateFeatures.map((feature, index) => (
                  <View key={index} style={styles.featureItem}>
                    <Text allowFontScaling={false} style={[styles.featureBullet, { color: colors.accent }]}>•</Text>
                    <Text allowFontScaling={false} style={[styles.featureText, { color: theme.text }]}>
                      {feature}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
            
            <View style={styles.singleButtonContainer}>
              <TouchableOpacity
                style={[styles.updateButtonSingle, { backgroundColor: colors.primary }]}
                onPress={() => setShowUpdateModal(false)}
              >
                <Text allowFontScaling={false} style={styles.updateButtonText}>
                  Got it, thanks!
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Update Available Prompt */}
      <Modal
        visible={showUpdatePrompt}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowUpdatePrompt(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.updateModal, { backgroundColor: theme.surface }]}>
            <View style={[styles.updateHeader, { backgroundColor: colors.primary }]}>
              <Text allowFontScaling={false} style={styles.updateTitle}>
                📱 Update Available
              </Text>
            </View>
            
            <View style={styles.updateContent}>
              <Text allowFontScaling={false} style={[styles.updateSubtitle, { color: theme.text }]}>
                A new version of the app is available. Would you like to update now?
              </Text>
              
              <Text allowFontScaling={false} style={[styles.updateDescription, { color: theme.textSecondary }]}>
                The app will restart automatically after updating.
              </Text>
            </View>
            
            <View style={styles.updateButtons}>
              <TouchableOpacity
                style={[styles.updateButtonSecondary, { borderColor: colors.primary }]}
                onPress={() => setShowUpdatePrompt(false)}
              >
                <Text allowFontScaling={false} style={[styles.updateButtonSecondaryText, { color: colors.primary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.updateButton, { backgroundColor: colors.primary }]}
                onPress={async () => {
                  setShowUpdatePrompt(false);
                  console.log('User chose to update - downloading...');
                  const downloadResult = await UpdateService.downloadUpdate();
                  if (downloadResult.success) {
                    console.log('Download successful, restarting app...');
                    await UpdateService.restartApp(true);
                  } else {
                    console.error('Download failed:', downloadResult.error);
                    // Could show an error message here
                  }
                }}
              >
                <Text allowFontScaling={false} style={styles.updateButtonText}>
                  Update Now
                </Text>
              </TouchableOpacity>
            </View>
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
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  heartIcon: {
    marginLeft: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  sportsGrid: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  sportCard: {
    width: '48%',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  sportContent: {
    padding: 16,
    alignItems: 'center',
  },
  iconWrapper: {
    width: 100,
    height: 60,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sportIconImage: {
    width: 100,
    height: 60,
    resizeMode: 'contain',
  },
  sportIconFA: {
    // FontAwesome is a glyph; centering via wrapper
    textAlign: 'center',
  },
  sportTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  sportDescription: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  // Update Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  updateModal: {
    width: '85%',
    maxWidth: 400,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  updateHeader: {
    padding: 20,
    alignItems: 'center',
  },
  updateTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  updateContent: {
    padding: 20,
  },
  updateSubtitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  featuresList: {
    marginBottom: 5,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  featureBullet: {
    fontSize: 20,
    marginRight: 12,
    marginTop: -2,
  },
  featureText: {
    fontSize: 16,
    lineHeight: 22,
    flex: 1,
  },
  updateDetails: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
  updateButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  updateDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 10,
  },
  updateButtons: {
    flexDirection: 'row',
    margin: 20,
    marginTop: 0,
    gap: 10,
  },
  updateButtonSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
  },
  updateButtonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
  },
  singleButtonContainer: {
    margin: 20,
    marginTop: 0,
  },
  updateButtonSingle: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
});

export default HomeScreen;
