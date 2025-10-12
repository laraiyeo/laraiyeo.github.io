import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';

const CS2TournamentScreen = ({ route }) => {
  const { theme } = useTheme();
  const { tournamentId } = route.params || {};

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>CS2 Tournament</Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Tournament ID: {tournamentId}
      </Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Coming Soon...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 5,
  },
});

export default CS2TournamentScreen;