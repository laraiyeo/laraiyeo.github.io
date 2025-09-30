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

const NBAGameDetailsScreen = ({ route, navigation }) => {
  const { gameId, homeTeam, awayTeam } = route.params;
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const [gameDetails, setGameDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGameDetails();
    // Set up auto-refresh for live games
    const interval = setInterval(loadGameDetails, 30000);
    return () => clearInterval(interval);
  }, [gameId]);

  const loadGameDetails = async () => {
    try {
      const data = await NBAService.getGameDetails(gameId);
      setGameDetails(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load game details');
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

  const isLiveGame = (status) => {
    const statusText = (status || '').toString().toLowerCase();
    return statusText.includes('quarter') || statusText.includes('overtime') || statusText.includes('halftime');
  };

  const getStatusText = (game) => {
    if (!game?.status) return '';
    
    if (game.status.type?.completed) return 'Final';
    if (isLiveGame(game.status.type?.description)) {
      const period = game.status.period || 0;
      if (period <= 4) return `Q${period}`;
      return `OT${period - 4}`;
    }
    return game.status.displayClock || game.status.type?.description || '';
  };

  const navigateToTeam = (team) => {
    navigation.navigate('TeamPage', {
      teamId: team.id,
      sport: 'nba',
      teamName: team.displayName,
      teamAbbreviation: team.abbreviation
    });
  };

  const toggleGameFavorite = () => {
    const favoriteId = `game-${gameId}`;
    if (isFavorite('nba-game', favoriteId)) {
      removeFavorite('nba-game', favoriteId);
    } else {
      addFavorite('nba-game', favoriteId, {
        id: gameId,
        homeTeam: homeTeam?.displayName || 'Home',
        awayTeam: awayTeam?.displayName || 'Away',
        sport: 'nba'
      });
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.text }]}>
          Loading game details...
        </Text>
      </View>
    );
  }

  if (!gameDetails) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text allowFontScaling={false} style={[styles.errorText, { color: theme.text }]}>
          Game details not available
        </Text>
      </View>
    );
  }

  const game = gameDetails.header?.competitions?.[0] || {};
  const competitors = game.competitors || [];
  const home = competitors.find(c => c.homeAway === 'home') || homeTeam;
  const away = competitors.find(c => c.homeAway === 'away') || awayTeam;
  const isGameFavorited = isFavorite('nba-game', `game-${gameId}`);
  const statusText = getStatusText(gameDetails.header);
  const isLive = isLiveGame(gameDetails.header?.status?.type?.description);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surface }]}>
        <View style={styles.headerTop}>
          <View style={styles.gameStatus}>
            <Text
              allowFontScaling={false}
              style={[
                styles.statusText,
                { color: isLive ? colors.error : theme.textSecondary }
              ]}
            >
              {statusText}
            </Text>
            {isLive && <View style={[styles.liveDot, { backgroundColor: colors.error }]} />}
          </View>
          <TouchableOpacity onPress={toggleGameFavorite} style={styles.favoriteButton}>
            <Ionicons
              name={isGameFavorited ? "heart" : "heart-outline"}
              size={24}
              color={isGameFavorited ? colors.error : theme.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Teams */}
        <View style={styles.teamsContainer}>
          {/* Away Team */}
          <TouchableOpacity
            style={styles.teamContainer}
            onPress={() => navigateToTeam(away)}
            activeOpacity={0.7}
          >
            <Image
              source={{ uri: getTeamLogoUrl('nba', normalizeAbbreviation(away?.team?.abbreviation || away?.abbreviation)) }}
              style={styles.teamLogo}
              defaultSource={require('../../../assets/nba.png')}
            />
            <Text allowFontScaling={false} style={[styles.teamName, { color: theme.text }]} numberOfLines={2}>
              {away?.team?.displayName || away?.displayName}
            </Text>
            <Text allowFontScaling={false} style={[styles.teamRecord, { color: theme.textSecondary }]}>
              {away?.records?.[0]?.summary || away?.record || ''}
            </Text>
          </TouchableOpacity>

          {/* Score */}
          <View style={styles.scoreContainer}>
            <Text allowFontScaling={false} style={[styles.score, { color: theme.text }]}>
              {away?.score || '-'}
            </Text>
            <Text allowFontScaling={false} style={[styles.scoreVs, { color: theme.textSecondary }]}>
              -
            </Text>
            <Text allowFontScaling={false} style={[styles.score, { color: theme.text }]}>
              {home?.score || '-'}
            </Text>
          </View>

          {/* Home Team */}
          <TouchableOpacity
            style={styles.teamContainer}
            onPress={() => navigateToTeam(home)}
            activeOpacity={0.7}
          >
            <Image
              source={{ uri: getTeamLogoUrl('nba', normalizeAbbreviation(home?.team?.abbreviation || home?.abbreviation)) }}
              style={styles.teamLogo}
              defaultSource={require('../../../assets/nba.png')}
            />
            <Text allowFontScaling={false} style={[styles.teamName, { color: theme.text }]} numberOfLines={2}>
              {home?.team?.displayName || home?.displayName}
            </Text>
            <Text allowFontScaling={false} style={[styles.teamRecord, { color: theme.textSecondary }]}>
              {home?.records?.[0]?.summary || home?.record || ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Game Info */}
      {(game.venue || game.attendance) && (
        <View style={[styles.gameInfoContainer, { backgroundColor: theme.surface }]}>
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>
            Game Information
          </Text>
          {game.venue?.fullName && (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={20} color={theme.textSecondary} />
              <Text allowFontScaling={false} style={[styles.infoText, { color: theme.textSecondary }]}>
                {game.venue.fullName}
              </Text>
            </View>
          )}
          {game.attendance && (
            <View style={styles.infoRow}>
              <Ionicons name="people-outline" size={20} color={theme.textSecondary} />
              <Text allowFontScaling={false} style={[styles.infoText, { color: theme.textSecondary }]}>
                Attendance: {game.attendance.toLocaleString()}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Coming Soon */}
      <View style={[styles.comingSoonContainer, { backgroundColor: theme.surface }]}>
        <Ionicons name="analytics-outline" size={48} color={theme.textSecondary} />
        <Text allowFontScaling={false} style={[styles.comingSoonTitle, { color: theme.text }]}>
          More Details Coming Soon
        </Text>
        <Text allowFontScaling={false} style={[styles.comingSoonText, { color: theme.textSecondary }]}>
          Box scores, play-by-play, and detailed statistics will be available soon.
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
    padding: 20,
    margin: 16,
    borderRadius: 12,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  gameStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 6,
  },
  favoriteButton: {
    padding: 8,
  },
  teamsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamContainer: {
    alignItems: 'center',
    flex: 1,
  },
  teamLogo: {
    width: 60,
    height: 60,
    marginBottom: 8,
  },
  teamName: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  teamRecord: {
    fontSize: 12,
  },
  scoreContainer: {
    alignItems: 'center',
    marginHorizontal: 20,
  },
  score: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  scoreVs: {
    fontSize: 24,
    marginVertical: 4,
  },
  gameInfoContainer: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    marginLeft: 8,
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

export default NBAGameDetailsScreen;