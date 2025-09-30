import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

const NBAStatsScreen = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.comingSoonContainer}>
          <Ionicons name="stats-chart-outline" size={64} color={theme.textSecondary} />
          <Text allowFontScaling={false} style={[styles.comingSoonTitle, { color: theme.text }]}>
            NBA Statistics
          </Text>
          <Text allowFontScaling={false} style={[styles.comingSoonText, { color: theme.textSecondary }]}>
            Detailed NBA statistics and analytics coming soon!
          </Text>
          <Text allowFontScaling={false} style={[styles.comingSoonSubtext, { color: theme.textSecondary }]}>
            This section will include player stats, team rankings, and advanced analytics.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flex: 1,
  },
  comingSoonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  comingSoonTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  comingSoonText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  comingSoonSubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
});

export default NBAStatsScreen;