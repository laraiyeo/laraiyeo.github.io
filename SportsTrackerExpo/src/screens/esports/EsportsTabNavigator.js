import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTeamEarnings } from '../../services/valorantService';

// Import individual game tab navigators
import VALTabNavigator from './val/VALTabNavigator';
import CS2TabNavigator from './cs2/CS2TabNavigator';
import LOLTabNavigator from './lol/LOLTabNavigator';

const EsportsTabNavigator = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const [activeGame, setActiveGame] = useState('VAL');
  const hasInitialized = useRef(false);

  // Background fetch team earnings data when esports page loads
  useEffect(() => {
    if (hasInitialized.current) {
      return; // Already initialized, skip
    }

    const fetchTeamEarningsInBackground = async () => {
      try {
        console.log('Starting background fetch of Valorant team earnings...');
        await getTeamEarnings();
        console.log('Background fetch of Valorant team earnings completed');
      } catch (error) {
        console.error('Background fetch of team earnings failed:', error);
        // Silently fail - don't block the UI
      }
    };

    hasInitialized.current = true;
    // Start the background fetch
    fetchTeamEarningsInBackground();
  }, []); // Only run once when component mounts

  const games = [
    { key: 'VAL', label: 'VALORANT' },
    { key: 'CS2', label: 'CS2' },
    { key: 'LOL', label: 'LOL' },
  ];

  const renderActiveGame = () => {
    switch (activeGame) {
      case 'CS2':
        return <CS2TabNavigator navigation={navigation} route={route} />;
      case 'LOL':
        return <LOLTabNavigator navigation={navigation} route={route} />;
      case 'VAL':
      default:
        return <VALTabNavigator navigation={navigation} route={route} />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Custom Top Tab Bar */}
      <View style={[styles.topTabBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        {games.map((game) => (
          <TouchableOpacity
            key={game.key}
            style={[
              styles.topTab,
              activeGame === game.key && { borderBottomColor: colors.primary }
            ]}
            onPress={() => setActiveGame(game.key)}
          >
            <Text
              style={[
                styles.topTabText,
                {
                  color: activeGame === game.key ? colors.primary : theme.textSecondary,
                  fontWeight: activeGame === game.key ? '600' : '400',
                }
              ]}
            >
              {game.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Active Game Content */}
      <View style={styles.gameContent}>
        {(activeGame === 'VAL' || activeGame === 'CS2' || activeGame === 'LOL') ? (
          renderActiveGame()
        ) : (
          <View style={styles.comingSoon}>
            <Text style={[styles.comingSoonText, { color: theme.textSecondary }]}>
              {games.find(g => g.key === activeGame)?.label} Coming Soon
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topTabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
  },
  topTab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  topTabText: {
    fontSize: 14,
    textTransform: 'uppercase',
  },
  gameContent: {
    flex: 1,
  },
  comingSoon: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  comingSoonText: {
    fontSize: 16,
    fontWeight: '500',
  },
});

export default EsportsTabNavigator;