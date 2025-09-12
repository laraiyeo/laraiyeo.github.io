import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../../context/ThemeContext';
import { EnglandService } from '../../../services/soccer/EnglandService';

const EnglandScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { theme, colors } = useTheme();

  const [matches, setMatches] = useState([]);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const leagueId = route.params?.leagueId || 'england';
  const leagueName = route.params?.leagueName || 'England';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Load matches and standings data
      await Promise.all([
        loadMatches(),
        loadStandings()
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMatches = async () => {
    try {
      const data = await EnglandService.getScoreboard();

      if (data.events) {
        setMatches(data.events.slice(0, 10)); // Show first 10 matches
      }
    } catch (error) {
      console.error('Error loading matches:', error);
    }
  };

  const loadStandings = async () => {
    try {
      const data = await EnglandService.getStandings();

      if (data.children && data.children[0]?.standings) {
        setStandings(data.children[0].standings.entries.slice(0, 5)); // Top 5 teams
      }
    } catch (error) {
      console.error('Error loading standings:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleMatchPress = (match) => {
    navigation.navigate('GameDetails', {
      gameId: match.id,
      sport: 'soccer'
    });
  };

  const handleViewAllMatches = () => {
    navigation.navigate('SoccerMatches', {
      leagueId: leagueId,
      leagueName: leagueName
    });
  };

  const handleViewAllStandings = () => {
    navigation.navigate('SoccerStandings', {
      leagueId: leagueId,
      leagueName: leagueName
    });
  };

  const renderMatch = (match) => {
    const homeTeam = match.competitions[0].competitors[0];
    const awayTeam = match.competitions[0].competitors[1];

    return (
      <TouchableOpacity
        key={match.id}
        style={[styles.matchCard, { backgroundColor: theme.surface }]}
        onPress={() => handleMatchPress(match)}
        activeOpacity={0.7}
      >
        <View style={styles.matchTeams}>
          <View style={styles.team}>
            <Text style={[styles.teamName, { color: theme.text }]}>
              {homeTeam.team.displayName}
            </Text>
            {homeTeam.score && (
              <Text style={[styles.score, { color: colors.primary }]}>
                {homeTeam.score}
              </Text>
            )}
          </View>

          <View style={styles.matchInfo}>
            <Text style={[styles.vs, { color: theme.textSecondary }]}>vs</Text>
            <Text style={[styles.matchStatus, { color: theme.textSecondary }]}>
              {match.status.type.shortDetail}
            </Text>
          </View>

          <View style={styles.team}>
            <Text style={[styles.teamName, { color: theme.text }]}>
              {awayTeam.team.displayName}
            </Text>
            {awayTeam.score && (
              <Text style={[styles.score, { color: colors.primary }]}>
                {awayTeam.score}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderStanding = (team, index) => {
    return (
      <View key={team.team.id} style={[styles.standingRow, { backgroundColor: theme.surface }]}>
        <Text style={[styles.position, { color: theme.textSecondary }]}>{index + 1}</Text>
        <Text style={[styles.teamName, { color: theme.text }]}>{team.team.displayName}</Text>
        <Text style={[styles.points, { color: colors.primary }]}>{team.stats[0]?.value || 0}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading {leagueName}...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>{leagueName}</Text>
      </View>

      {/* Recent Matches */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Matches</Text>
          <TouchableOpacity onPress={handleViewAllMatches}>
            <Text style={[styles.viewAll, { color: colors.primary }]}>View All</Text>
          </TouchableOpacity>
        </View>
        {matches.length > 0 ? (
          matches.map(renderMatch)
        ) : (
          <Text style={[styles.noData, { color: theme.textSecondary }]}>No recent matches</Text>
        )}
      </View>

      {/* Standings */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Standings</Text>
          <TouchableOpacity onPress={handleViewAllStandings}>
            <Text style={[styles.viewAll, { color: colors.primary }]}>View All</Text>
          </TouchableOpacity>
        </View>
        {standings.length > 0 ? (
          standings.map(renderStanding)
        ) : (
          <Text style={[styles.noData, { color: theme.textSecondary }]}>No standings available</Text>
        )}
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
  header: {
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  viewAll: {
    fontSize: 14,
    fontWeight: '600',
  },
  matchCard: {
    marginHorizontal: 20,
    marginVertical: 5,
    padding: 15,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  matchTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  team: {
    flex: 1,
    alignItems: 'center',
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  score: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
  },
  matchInfo: {
    alignItems: 'center',
    marginHorizontal: 10,
  },
  vs: {
    fontSize: 12,
    marginBottom: 2,
  },
  matchStatus: {
    fontSize: 10,
    textAlign: 'center',
  },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginVertical: 2,
    borderRadius: 6,
  },
  position: {
    width: 30,
    fontSize: 14,
    fontWeight: 'bold',
  },
  points: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  noData: {
    textAlign: 'center',
    padding: 20,
    fontSize: 14,
  },
});

export default EnglandScreen;