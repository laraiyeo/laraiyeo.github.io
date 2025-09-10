import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const TeamPageScreen = ({ route }) => {
  const { teamId, sport } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Team Page</Text>
      <Text style={styles.subtitle}>Team ID: {teamId} | Sport: {sport.toUpperCase()}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});

export default TeamPageScreen;
