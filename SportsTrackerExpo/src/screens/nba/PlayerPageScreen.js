import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';
import { NBAService } from '../../services/NBAService';

const NBAPlayerPageScreen = ({ route, navigation }) => {
  const { playerId, playerName } = route.params;
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const [playerDetails, setPlayerDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlayerDetails();
  }, [playerId]);

  const loadPlayerDetails = async () => {
    try {
      const data = await NBAService.getAthleteDetails(playerId);
      setPlayerDetails(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load player details');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const normalizeAbbreviation = (abbrev) => {
    if (!abbrev) return abbrev;
    const a = String(abbrev).toLowerCase();
    const map = { 'gs': 'gsw', 'sa': 'sas', 'no': 'nop', 'ny': 'nyk', 'bkn': 'bk' };
    return (map[a] || abbrev).toString();
  };

  const togglePlayerFavorite = () => {
    if (isFavorite('nba-player', playerId)) {
      removeFavorite('nba-player', playerId);
    } else {
      addFavorite('nba-player', playerId, {
        id: playerId,
        name: playerName || playerDetails?.athlete?.displayName || 'Player',
        sport: 'nba'
      });
    }
  };

  const navigateToTeam = (team) => {
    if (team?.id) {
      navigation.navigate('TeamPage', {
        teamId: team.id,
        sport: 'nba',
        teamName: team.displayName,
        teamAbbreviation: team.abbreviation
      });
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.text }]}>
          Loading player details...
        </Text>
      </View>
    );
  }

  if (!playerDetails) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text allowFontScaling={false} style={[styles.errorText, { color: theme.text }]}>
          Player details not available
        </Text>
      </View>
    );
  }

  const player = playerDetails.athlete || {};
  const isPlayerFavorited = isFavorite('nba-player', playerId);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surface }]}>
        <View style={styles.headerContent}>
          <Image
            source={{ uri: player.headshot?.href }}
            style={styles.playerImage}
            defaultSource={require('../../../assets/nba.png')}
          />
          <View style={styles.playerInfo}>
            <Text allowFontScaling={false} style={[styles.playerName, { color: theme.text }]}>
              {player.displayName || playerName}
            </Text>
            <Text allowFontScaling={false} style={[styles.playerPosition, { color: theme.textSecondary }]}>
              {player.position?.displayName} • #{player.jersey}
            </Text>
            {player.team && (
              <TouchableOpacity
                onPress={() => navigateToTeam(player.team)}
                style={styles.teamButton}
                activeOpacity={0.7}
              >
                <Image
                  source={{ uri: getTeamLogoUrl('nba', normalizeAbbreviation(player.team.abbreviation)) }}
                  style={styles.teamLogoSmall}
                  defaultSource={require('../../../assets/nba.png')}
                />
                <Text allowFontScaling={false} style={[styles.teamName, { color: colors.primary }]}>
                  {player.team.displayName}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={togglePlayerFavorite} style={styles.favoriteButton}>
            <Ionicons
              name={isPlayerFavorited ? "star" : "star-outline"}
              size={24}
              color={isPlayerFavorited ? colors.primary : theme.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Player Info */}
      <View style={[styles.infoContainer, { backgroundColor: theme.surface }]}>
        <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>
          Player Information
        </Text>
        
        <View style={styles.infoGrid}>
          {player.age && (
            <View style={styles.infoItem}>
              <Text allowFontScaling={false} style={[styles.infoLabel, { color: theme.textSecondary }]}>Age</Text>
              <Text allowFontScaling={false} style={[styles.infoValue, { color: theme.text }]}>{player.age}</Text>
            </View>
          )}
          
          {player.height && (
            <View style={styles.infoItem}>
              <Text allowFontScaling={false} style={[styles.infoLabel, { color: theme.textSecondary }]}>Height</Text>
              <Text allowFontScaling={false} style={[styles.infoValue, { color: theme.text }]}>{player.height}</Text>
            </View>
          )}
          
          {player.weight && (
            <View style={styles.infoItem}>
              <Text allowFontScaling={false} style={[styles.infoLabel, { color: theme.textSecondary }]}>Weight</Text>
              <Text allowFontScaling={false} style={[styles.infoValue, { color: theme.text }]}>{player.weight} lbs</Text>
            </View>
          )}
          
          {player.experience?.years && (
            <View style={styles.infoItem}>
              <Text allowFontScaling={false} style={[styles.infoLabel, { color: theme.textSecondary }]}>Experience</Text>
              <Text allowFontScaling={false} style={[styles.infoValue, { color: theme.text }]}>{player.experience.years} years</Text>
            </View>
          )}
          
          {player.college?.name && (
            <View style={styles.infoItem}>
              <Text allowFontScaling={false} style={[styles.infoLabel, { color: theme.textSecondary }]}>College</Text>
              <Text allowFontScaling={false} style={[styles.infoValue, { color: theme.text }]}>{player.college.name}</Text>
            </View>
          )}
          
          {player.birthPlace?.displayText && (
            <View style={styles.infoItem}>
              <Text allowFontScaling={false} style={[styles.infoLabel, { color: theme.textSecondary }]}>Birthplace</Text>
              <Text allowFontScaling={false} style={[styles.infoValue, { color: theme.text }]}>{player.birthPlace.displayText}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Coming Soon */}
      <View style={[styles.comingSoonContainer, { backgroundColor: theme.surface }]}>
        <Ionicons name="stats-chart-outline" size={48} color={theme.textSecondary} />
        <Text allowFontScaling={false} style={[styles.comingSoonTitle, { color: theme.text }]}>
          Player Statistics Coming Soon
        </Text>
        <Text allowFontScaling={false} style={[styles.comingSoonText, { color: theme.textSecondary }]}>
          Season stats, career highlights, and performance metrics will be available soon.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 32,
  },
  header: {
    margin: 16,
    padding: 20,
    borderRadius: 12,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginRight: 16,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  playerPosition: {
    fontSize: 16,
    marginBottom: 8,
  },
  teamButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamLogoSmall: {
    width: 20,
    height: 20,
    marginRight: 6,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
  },
  favoriteButton: {
    padding: 8,
  },
  infoContainer: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  infoItem: {
    width: '48%',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  comingSoonContainer: {
    margin: 16,
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  comingSoonTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 8,
  },
  comingSoonText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default NBAPlayerPageScreen;