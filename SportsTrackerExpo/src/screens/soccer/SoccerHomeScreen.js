import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';

const { width } = Dimensions.get('window');

// Logo component with error handling
const LogoWithFallback = ({ logoId, name, style, isDarkMode, isMainLogo = false, theme }) => {
  const [imageError, setImageError] = useState(false);
  const [fallbackError, setFallbackError] = useState(false);

  const primaryUrl = `https://a.espncdn.com/i/leaguelogos/soccer/${isDarkMode ? '500-dark' : '500'}/${logoId}.png`;
  const fallbackUrl = `https://a.espncdn.com/i/leaguelogos/soccer/500/${logoId}.png`;

  if (imageError && fallbackError) {
    // Show text fallback
    return (
      <View style={[style, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text allowFontScaling={false} style={{
          fontSize: isMainLogo ? 10 : 7,
          textAlign: 'center',
          fontWeight: isMainLogo ? '600' : '400',
          color: theme.text,
          lineHeight: isMainLogo ? 12 : 9
        }}>
          {name.split(' ').map((word, index) => (
            <Text allowFontScaling={false} key={index}>{word}{'\n'}</Text>
          ))}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: imageError ? fallbackUrl : primaryUrl }}
      style={style}
      resizeMode="contain"
      onError={() => {
        if (!imageError) {
          setImageError(true);
        } else {
          setFallbackError(true);
        }
      }}
    />
  );
};

const SoccerHomeScreen = () => {
  const navigation = useNavigation();
  const { theme, colors, isDarkMode } = useTheme();

  const soccerLeagues = [
    {
      id: 'england',
      name: 'England',
      flag: 'https://a.espncdn.com/i/teamlogos/countries/500/eng.png',
      type: 'country',
      mainLeague: { name: 'Premier League', logo: '23' },
      competitions: [
        { name: 'FA Cup', logo: '40', position: 'left' },
        { name: 'EFL Cup', logo: '41', position: 'right' }
      ]
    },
    {
      id: 'spain',
      name: 'Spain',
      flag: 'https://a.espncdn.com/i/teamlogos/countries/500/esp.png',
      type: 'country',
      mainLeague: { name: 'La Liga', logo: '15' },
      competitions: [
        { name: 'Copa del Rey', logo: '80', position: 'left' },
        { name: 'Spanish Supercopa', logo: '431', position: 'right' }
      ]
    },
    {
      id: 'italy',
      name: 'Italy',
      flag: 'https://a.espncdn.com/i/teamlogos/countries/500/ita.png',
      type: 'country',
      mainLeague: { name: 'Serie A', logo: '12' },
      competitions: [
        { name: 'Coppa Italia', logo: '2192', position: 'left' },
        { name: 'Italian Supercoppa', logo: '2316', position: 'right' }
      ]
    },
    {
      id: 'germany',
      name: 'Germany',
      flag: 'https://a.espncdn.com/i/teamlogos/countries/500/ger.png',
      type: 'country',
      mainLeague: { name: 'Bundesliga', logo: '10' },
      competitions: [
        { name: 'DFB Pokal', logo: '2061', position: 'left' },
        { name: 'German Super Cup', logo: '2315', position: 'right' }
      ]
    },
    {
      id: 'france',
      name: 'France',
      flag: 'https://a.espncdn.com/i/teamlogos/countries/500/fra.png',
      type: 'country',
      mainLeague: { name: 'Ligue 1', logo: '9' },
      competitions: [
        { name: 'Coupe de France', logo: '182', position: 'left' },
        { name: 'Trophee des Champions', logo: '2345', position: 'right' }
      ]
    },
    {
      id: 'champions-league',
      name: 'Champions League',
      flag: null,
      type: 'competition',
      mainLeague: { name: 'Champions League', logo: '2' },
      competitions: []
    },
    {
      id: 'europa-league',
      name: 'Europa League',
      flag: null,
      type: 'competition',
      mainLeague: { name: 'Europa League', logo: '2310' },
      competitions: []
    },
    {
      id: 'europa-conference',
      name: 'Europa Conference',
      flag: null,
      type: 'competition',
      mainLeague: { name: 'Europa Conference League', logo: '20296' },
      competitions: []
    }
  ];

  const handleLeaguePress = (league) => {
    console.log('Navigating to:', league.id);
    // Navigate to the specific league screen
    navigation.navigate(league.id, { leagueId: league.id, leagueName: league.name });
  };

  const renderLeagueBox = (league) => {
    return (
      <TouchableOpacity
        key={league.id}
        style={[styles.leagueBox, { backgroundColor: theme.surface }]}
        onPress={() => handleLeaguePress(league)}
        activeOpacity={0.7}
      >
        {/* Top row: Flag and text inline */}
        <View style={styles.topRow}>
          {league.flag && (
            <Image 
              source={{ uri: league.flag }} 
              style={styles.flagIcon}
              resizeMode="contain"
            />
          )}
          <Text allowFontScaling={false} style={[styles.leagueName, { color: theme.text }]}>
            {league.name}
          </Text>
        </View>

        {/* Main content row with logos */}
        <View style={styles.contentRow}>
          {/* Left competition logo */}
          <View style={styles.sideCompetition}>
            {league.competitions && league.competitions.find(c => c.position === 'left') && (
              <LogoWithFallback
                logoId={league.competitions.find(c => c.position === 'left').logo}
                name={league.competitions.find(c => c.position === 'left').name}
                style={styles.competitionLogo}
                isDarkMode={isDarkMode}
                theme={theme}
              />
            )}
          </View>

          {/* Center main league logo */}
          <View style={styles.centerLogo}>
            <LogoWithFallback
              logoId={league.mainLeague.logo}
              name={league.mainLeague.name}
              style={styles.mainLeagueLogo}
              isDarkMode={isDarkMode}
              isMainLogo={true}
              theme={theme}
            />
            <Text allowFontScaling={false} style={[styles.mainLeagueName, { color: theme.text }]}>
              {league.mainLeague.name}
            </Text>
          </View>

          {/* Right competition logo */}
          <View style={styles.sideCompetition}>
            {league.competitions && league.competitions.find(c => c.position === 'right') && (
              <LogoWithFallback
                logoId={league.competitions.find(c => c.position === 'right').logo}
                name={league.competitions.find(c => c.position === 'right').name}
                style={styles.competitionLogo}
                isDarkMode={isDarkMode}
                theme={theme}
              />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text allowFontScaling={false} style={[styles.title, { color: theme.text }]}>Soccer</Text>
        <Text allowFontScaling={false} style={[styles.subtitle, { color: theme.textSecondary }]}>
          Select a Country or Competition
        </Text>
      </View>

      <View style={styles.leaguesList}>
        {soccerLeagues.map(renderLeagueBox)}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    alignItems: 'center',
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
  leaguesList: {
    padding: 15,
  },
  leagueBox: {
    width: '100%',
    minHeight: 120,
    borderRadius: 12,
    padding: 16,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  flagIcon: {
    width: Math.max(30, width * 0.08),
    height: Math.max(20, width * 0.05),
    marginRight: 12,
  },
  leagueName: {
    fontSize: Math.max(16, width * 0.045),
    fontWeight: '600',
    flex: 1,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
    minHeight: 60,
  },
  sideCompetition: {
    width: Math.max(50, width * 0.15),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  centerLogo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 10,
  },
  competitionLogo: {
    width: Math.max(35, width * 0.1),
    height: Math.max(35, width * 0.1),
  },
  competitionTextFallback: {
    width: Math.max(45, width * 0.12),
    height: Math.max(35, width * 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  competitionText: {
    fontSize: Math.max(7, width * 0.02),
    textAlign: 'center',
    lineHeight: Math.max(9, width * 0.025),
  },
  mainLeagueLogo: {
    width: Math.max(50, width * 0.15),
    height: Math.max(50, width * 0.15),
    marginBottom: 8,
  },
  mainLeagueName: {
    fontSize: Math.max(12, width * 0.035),
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default SoccerHomeScreen;