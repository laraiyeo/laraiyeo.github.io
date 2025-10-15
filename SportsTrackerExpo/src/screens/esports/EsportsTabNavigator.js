import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

// Import individual game tab navigators
import VALTabNavigator from './val/VALTabNavigator';
import CS2TabNavigator from './cs2/CS2TabNavigator';

const EsportsTabNavigator = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const [activeGame, setActiveGame] = useState('VAL');

  const games = [
    { key: 'VAL', label: 'VALORANT' },
    { key: 'CS2', label: 'CS2' },
    { key: 'DOTA2', label: 'DOTA2' },
    { key: 'LOL', label: 'LOL' },
  ];

  const renderActiveGame = () => {
    switch (activeGame) {
      case 'CS2':
        return <CS2TabNavigator navigation={navigation} route={route} />;
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
        {(activeGame === 'VAL' || activeGame === 'CS2') ? (
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