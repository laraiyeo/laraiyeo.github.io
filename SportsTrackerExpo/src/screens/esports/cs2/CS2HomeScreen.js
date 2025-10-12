import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../../../context/ThemeContext';
import { getLiveSeries, getRecentSeries, getUpcomingSeries } from '../../../services/cs2Service';

const { width } = Dimensions.get('window');

const CS2HomeScreen = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const [liveSeries, setLiveSeries] = useState([]);
  const [recentSeries, setRecentSeries] = useState([]);
  const [upcomingSeries, setUpcomingSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rawApiData, setRawApiData] = useState(null);
  const [activeFilter, setActiveFilter] = useState('today');
  const [selectedGame, setSelectedGame] = useState('CS2');

  const gameFilters = [
    { name: 'CS2', icon: 'game-controller', active: true },
    { name: 'VAL', icon: 'game-controller', active: false },
    { name: 'DOTA2', icon: 'game-controller', active: false },
    { name: 'LOL', icon: 'game-controller', active: false }
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [live, recent, upcoming] = await Promise.all([
        getLiveSeries(5),
        getRecentSeries(6),
        getUpcomingSeries(10)
      ]);
      
      // Store raw API data for debugging
      setRawApiData({
        live: live,
        recent: recent,
        upcoming: upcoming,
        timestamp: new Date().toISOString(),
        currentDate: new Date().toString()
      });
      
      setLiveSeries(live.edges || []);
      setRecentSeries(recent.edges || []);
      setUpcomingSeries(upcoming.edges || []);
    } catch (error) {
      console.error('Error loading CS2 data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const copyRawApiData = async () => {
    if (rawApiData) {
      try {
        const dataString = JSON.stringify(rawApiData, null, 2);
        await Clipboard.setStringAsync(dataString);
        Alert.alert('Success', 'Raw API data copied to clipboard!');
      } catch (error) {
        Alert.alert('Error', 'Failed to copy data to clipboard');
      }
    } else {
      Alert.alert('No Data', 'No API data available to copy');
    }
  };

  const handleGameFilterPress = (gameName) => {
    setSelectedGame(gameName);
    if (gameName === 'CS2') {
      // Already on CS2 home, no navigation needed
    } else if (gameName === 'VAL') {
      navigation.navigate('VALHome');
    }
    // TODO: Add navigation for other games when implemented
  };

  const getFilteredUpcomingMatches = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    return upcomingSeries.filter(match => {
      const matchDate = new Date(match.node.startTimeScheduled);
      const matchDay = new Date(matchDate.getFullYear(), matchDate.getMonth(), matchDate.getDate());

      switch (activeFilter) {
        case 'today':
          return matchDay.getTime() === today.getTime();
        case 'tomorrow':
          return matchDay.getTime() === tomorrow.getTime();
        case 'week':
          return matchDay >= today && matchDay <= weekFromNow;
        default:
          return true;
      }
    });
  };

  const formatMatchTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date - now;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    // Future matches
    if (diffMs > 0) {
      if (diffDays > 7) {
        return date.toLocaleDateString();
      } else if (diffDays > 0) {
        return `${diffDays}d`;
      } else if (diffHours > 0) {
        return `${diffHours}h`;
      } else if (diffMins > 0) {
        return `${diffMins}m`;
      } else {
        return 'Now';
      }
    } 
    // Past matches
    else {
      const absHours = Math.abs(diffHours);
      const absDays = Math.abs(diffDays);
      
      if (absDays > 7) {
        return date.toLocaleDateString();
      } else if (absDays > 0) {
        return `${absDays}d ago`;
      } else if (absHours > 0) {
        return `${absHours}h ago`;
      } else {
        return 'Recently';
      }
    }
  };

  const LiveMatchCard = ({ match }) => {
    const series = match.node;
    const team1 = series.teams[0];
    const team2 = series.teams[1];

    return (
      <TouchableOpacity
        style={[styles.liveMatchCard, { backgroundColor: theme.surfaceSecondary, borderColor: '#ff4444' }]}
        onPress={() => navigation.navigate('CS2MatchDetails', { matchId: series.id })}
      >
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        
        <View style={styles.tournamentInfo}>
          <Text style={[styles.tournamentName, { color: theme.text }]} numberOfLines={1}>
            {series.tournament?.nameShortened || series.tournament?.name}
          </Text>
          <Text style={styles.matchFormat}>{series.format?.nameShortened}</Text>
        </View>

        <View style={styles.teamsContainer}>
          <View style={styles.teamRow}>
            <View style={styles.teamInfo}>
              {team1?.baseInfo?.logoUrl ? (
                <Image source={{ uri: team1.baseInfo.logoUrl }} style={styles.teamLogo} />
              ) : (
                <View style={[styles.placeholderLogo, { backgroundColor: team1?.baseInfo?.colorPrimary || '#666' }]}>
                  <Text style={styles.placeholderText}>
                    {team1?.baseInfo?.name?.substring(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={[styles.teamName, { color: theme.text }]} numberOfLines={1}>
                {team1?.baseInfo?.name}
              </Text>
            </View>
            <Text style={[styles.teamScore, { color: theme.text }]}>
              {team1?.scoreAdvantage || 0}
            </Text>
          </View>

          <View style={styles.teamRow}>
            <View style={styles.teamInfo}>
              {team2?.baseInfo?.logoUrl ? (
                <Image source={{ uri: team2.baseInfo.logoUrl }} style={styles.teamLogo} />
              ) : (
                <View style={[styles.placeholderLogo, { backgroundColor: team2?.baseInfo?.colorPrimary || '#666' }]}>
                  <Text style={styles.placeholderText}>
                    {team2?.baseInfo?.name?.substring(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={[styles.teamName, { color: theme.text }]} numberOfLines={1}>
                {team2?.baseInfo?.name}
              </Text>
            </View>
            <Text style={[styles.teamScore, { color: theme.text }]}>
              {team2?.scoreAdvantage || 0}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const RecentMatchCard = ({ match }) => {
    const series = match.node;
    const team1 = series.teams[0];
    const team2 = series.teams[1];
    const winner1 = (team1?.scoreAdvantage || 0) > (team2?.scoreAdvantage || 0);
    const winner2 = (team2?.scoreAdvantage || 0) > (team1?.scoreAdvantage || 0);

    return (
      <TouchableOpacity
        style={[styles.recentMatchCard, { backgroundColor: theme.surfaceSecondary }]}
        onPress={() => navigation.navigate('CS2MatchDetails', { matchId: series.id })}
      >
        <View style={styles.tournamentBadge}>
          <Text style={styles.tournamentBadgeText} numberOfLines={1}>
            {series.tournament?.nameShortened || 'Tournament'}
          </Text>
        </View>

        <View style={styles.matchScore}>
          <Text style={[styles.scoreText, { color: theme.text }]}>
            {team1?.scoreAdvantage || 0} - {team2?.scoreAdvantage || 0}
          </Text>
        </View>

        <View style={styles.teamsRow}>
          <View style={[styles.teamContainer, winner1 && styles.winnerTeam]}>
            {team1?.baseInfo?.logoUrl ? (
              <Image source={{ uri: team1.baseInfo.logoUrl }} style={styles.smallTeamLogo} />
            ) : (
              <View style={[styles.smallPlaceholderLogo, { backgroundColor: team1?.baseInfo?.colorPrimary || '#666' }]}>
                <Text style={styles.smallPlaceholderText}>
                  {team1?.baseInfo?.name?.substring(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={[styles.smallTeamName, { color: theme.text }]} numberOfLines={1}>
              {team1?.baseInfo?.name}
            </Text>
          </View>

          <View style={[styles.teamContainer, winner2 && styles.winnerTeam]}>
            {team2?.baseInfo?.logoUrl ? (
              <Image source={{ uri: team2.baseInfo.logoUrl }} style={styles.smallTeamLogo} />
            ) : (
              <View style={[styles.smallPlaceholderLogo, { backgroundColor: team2?.baseInfo?.colorPrimary || '#666' }]}>
                <Text style={styles.smallPlaceholderText}>
                  {team2?.baseInfo?.name?.substring(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={[styles.smallTeamName, { color: theme.text }]} numberOfLines={1}>
              {team2?.baseInfo?.name}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const UpcomingMatchCard = ({ match }) => {
    const series = match.node;
    const team1 = series.teams[0];
    const team2 = series.teams[1];

    return (
      <TouchableOpacity
        style={[styles.upcomingMatchCard, { backgroundColor: theme.surfaceSecondary }]}
        onPress={() => navigation.navigate('CS2MatchDetails', { matchId: series.id })}
      >
        <View style={styles.upcomingHeader}>
          <Text style={[styles.upcomingTime, { color: colors.primary }]}>
            {formatMatchTime(series.startTimeScheduled)}
          </Text>
          <Text style={styles.upcomingFormat}>{series.format?.nameShortened}</Text>
        </View>

        <View style={styles.upcomingTeams}>
          <View style={styles.upcomingTeam}>
            {team1?.baseInfo?.logoUrl ? (
              <Image source={{ uri: team1.baseInfo.logoUrl }} style={styles.upcomingLogo} />
            ) : (
              <View style={[styles.upcomingPlaceholder, { backgroundColor: team1?.baseInfo?.colorPrimary || '#666' }]}>
                <Text style={styles.upcomingPlaceholderText}>
                  {team1?.baseInfo?.name?.substring(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={[styles.upcomingTeamName, { color: theme.text }]} numberOfLines={1}>
              {team1?.baseInfo?.name}
            </Text>
          </View>

          <Text style={[styles.vsText, { color: theme.textSecondary }]}>VS</Text>

          <View style={styles.upcomingTeam}>
            {team2?.baseInfo?.logoUrl ? (
              <Image source={{ uri: team2.baseInfo.logoUrl }} style={styles.upcomingLogo} />
            ) : (
              <View style={[styles.upcomingPlaceholder, { backgroundColor: team2?.baseInfo?.colorPrimary || '#666' }]}>
                <Text style={styles.upcomingPlaceholderText}>
                  {team2?.baseInfo?.name?.substring(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={[styles.upcomingTeamName, { color: theme.text }]} numberOfLines={1}>
              {team2?.baseInfo?.name}
            </Text>
          </View>
        </View>

        <Text style={[styles.upcomingTournament, { color: theme.textSecondary }]} numberOfLines={1}>
          {series.tournament?.nameShortened || series.tournament?.name}
        </Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>Loading CS2 matches...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Debug Button */}
      <View style={styles.debugSection}>
        <TouchableOpacity 
          style={[styles.debugButton, { backgroundColor: colors.primary }]} 
          onPress={copyRawApiData}
        >
          <Ionicons name="code-slash" size={16} color="#fff" />
          <Text style={styles.debugButtonText}>Copy Raw API Data</Text>
        </TouchableOpacity>
      </View>

      {/* Game Filter */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {gameFilters.map((game, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.filterChip,
                game.active && styles.activeFilterChip,
                { backgroundColor: game.active ? colors.primary : theme.surfaceSecondary }
              ]}
              onPress={() => handleGameFilterPress(game.name)}
            >
              <Ionicons 
                name={game.icon} 
                size={16} 
                color={game.active ? 'white' : theme.text} 
                style={styles.filterIcon}
              />
              <Text style={[
                styles.filterText,
                { color: game.active ? 'white' : theme.text }
              ]}>
                {game.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Live Matches Section */}
      {liveSeries.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <View style={styles.liveDot} />
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Live Matches</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('CS2Live')}>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
            {liveSeries.map((match, index) => (
              <LiveMatchCard key={match.node.id} match={match} />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Recent Results Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent results</Text>
          <TouchableOpacity onPress={() => navigation.navigate('CS2Results')}>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.recentGrid}>
          {recentSeries.slice(0, 6).map((match, index) => (
            <RecentMatchCard key={match.node.id} match={match} />
          ))}
        </View>
      </View>

      {/* Upcoming Matches Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Upcoming matches</Text>
          <TouchableOpacity onPress={() => navigation.navigate('CS2Upcoming')}>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.upcomingContainer}>
          <View style={styles.filterTabs}>
            <TouchableOpacity 
              style={[styles.filterTab, activeFilter === 'today' && styles.activeFilterTab]}
              onPress={() => setActiveFilter('today')}
            >
              <Text style={[
                styles.filterTabText, 
                activeFilter === 'today' ? styles.activeFilterTabText : { color: theme.textSecondary }
              ]}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.filterTab, activeFilter === 'tomorrow' && styles.activeFilterTab]}
              onPress={() => setActiveFilter('tomorrow')}
            >
              <Text style={[
                styles.filterTabText, 
                activeFilter === 'tomorrow' ? styles.activeFilterTabText : { color: theme.textSecondary }
              ]}>Tomorrow</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.filterTab, activeFilter === 'week' && styles.activeFilterTab]}
              onPress={() => setActiveFilter('week')}
            >
              <Text style={[
                styles.filterTabText, 
                activeFilter === 'week' ? styles.activeFilterTabText : { color: theme.textSecondary }
              ]}>Next 7 days</Text>
            </TouchableOpacity>
          </View>
          {getFilteredUpcomingMatches().slice(0, 5).map((match, index) => (
            <UpcomingMatchCard key={match.node.id} match={match} />
          ))}
        </View>
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
    marginTop: 10,
    fontSize: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  horizontalScroll: {
    paddingLeft: 16,
  },
  liveMatchCard: {
    width: 280,
    marginRight: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff4444',
    marginRight: 6,
  },
  liveText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ff4444',
  },
  tournamentInfo: {
    marginBottom: 12,
  },
  tournamentName: {
    fontSize: 14,
    fontWeight: '500',
  },
  matchFormat: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  teamsContainer: {
    gap: 8,
  },
  teamRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  teamLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  placeholderLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: 'white',
  },
  teamName: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  teamScore: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  recentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
  },
  recentMatchCard: {
    width: (width - 44) / 2,
    padding: 12,
    borderRadius: 8,
    minHeight: 120,
  },
  tournamentBadge: {
    backgroundColor: '#ff6600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  tournamentBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'white',
  },
  matchScore: {
    alignItems: 'center',
    marginBottom: 8,
  },
  scoreText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  teamsRow: {
    gap: 4,
  },
  teamContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  winnerTeam: {
    opacity: 1,
  },
  smallTeamLogo: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 6,
  },
  smallPlaceholderLogo: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallPlaceholderText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: 'white',
  },
  smallTeamName: {
    fontSize: 12,
    fontWeight: '400',
    flex: 1,
  },
  upcomingContainer: {
    paddingHorizontal: 16,
  },
  filterTabs: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  activeFilterTab: {
    backgroundColor: '#007AFF',
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  activeFilterTabText: {
    color: 'white',
  },
  upcomingMatchCard: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  upcomingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  upcomingTime: {
    fontSize: 14,
    fontWeight: '600',
  },
  upcomingFormat: {
    fontSize: 12,
    color: '#888',
  },
  upcomingTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  upcomingTeam: {
    alignItems: 'center',
    flex: 1,
  },
  upcomingLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginBottom: 4,
  },
  upcomingPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginBottom: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  upcomingPlaceholderText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: 'white',
  },
  upcomingTeamName: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  vsText: {
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 16,
  },
  upcomingTournament: {
    fontSize: 12,
    textAlign: 'center',
  },
  debugSection: {
    padding: 16,
    alignItems: 'center',
  },
  debugButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  debugButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  filterContainer: {
    marginBottom: 24,
  },
  filterScroll: {
    paddingLeft: 16,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
  },
  activeFilterChip: {
    // Active styles handled in component
  },
  filterIcon: {
    marginRight: 6,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default CS2HomeScreen;