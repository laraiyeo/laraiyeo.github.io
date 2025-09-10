import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const HomeScreen = () => {
  const navigation = useNavigation();

  const sports = [
    {
      id: 'mlb',
      title: 'MLB',
      description: 'View all live MLB games happening right now.',
      icon: require('../../assets/mlb.png'),
      color: '#0f3460'
    },
    {
      id: 'nhl',
      title: 'NHL',
      description: 'View all live NHL games happening right now.',
      icon: require('../../assets/nhl.png'),
      color: '#c8102e'
    },
    {
      id: 'nba',
      title: 'NBA',
      description: 'View all live NBA games happening right now.',
      icon: require('../../assets/nba.png'),
      color: '#c8102e'
    },
    {
      id: 'nfl',
      title: 'NFL',
      description: 'View all live NFL games happening right now.',
      icon: require('../../assets/nfl.png'),
      color: '#013369'
    },
    {
      id: 'soccer',
      title: 'SOCCER',
      description: 'View all live Soccer matches happening right now.',
      icon: require('../../assets/soccer.png'),
      color: '#00a651'
    },
    {
      id: 'wnba',
      title: 'WNBA',
      description: 'View all live WNBA games happening right now.',
      icon: require('../../assets/wnba.png'),
      color: '#ff6900'
    },
    {
      id: 'f1',
      title: 'F1',
      description: 'View all live F1 races happening right now.',
      icon: require('../../assets/f1.png'),
      color: '#e10600'
    },
    {
      id: 'ncaa',
      title: 'NCAA',
      description: 'View all live NCAA games happening right now.',
      icon: require('../../assets/ncaa.png'),
      color: '#003087'
    }
  ];

  const handleSportPress = (sport) => {
    navigation.navigate('SportTabs', { sport: sport.id });
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Live Sports Tracker</Text>
        <Text style={styles.subtitle}>Choose your sport to get started</Text>
      </View>
      
      <View style={styles.sportsGrid}>
        {sports.map((sport) => (
          <TouchableOpacity
            key={sport.id}
            style={[styles.sportCard, { borderColor: sport.color }]}
            onPress={() => handleSportPress(sport)}
            activeOpacity={0.8}
          >
            <View style={styles.sportContent}>
              <Image source={sport.icon} style={styles.sportIcon} />
              <Text style={[styles.sportTitle, { color: sport.color }]}>{sport.title}</Text>
              <Text style={styles.sportDescription}>{sport.description}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  sportsGrid: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  sportCard: {
    width: '48%',
    backgroundColor: '#fff',
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
  sportIcon: {
    width: 60,
    height: 60,
    marginBottom: 12,
    resizeMode: 'contain',
  },
  sportTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  sportDescription: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default HomeScreen;
