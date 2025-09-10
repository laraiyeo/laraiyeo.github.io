import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

const StatsScreen = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: colors.primary }]}>Stats</Text>
      <Text style={[styles.subtitle, { color: theme.text }]}>{sport.toUpperCase()} statistics and analytics</Text>
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
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
});

export default StatsScreen;
