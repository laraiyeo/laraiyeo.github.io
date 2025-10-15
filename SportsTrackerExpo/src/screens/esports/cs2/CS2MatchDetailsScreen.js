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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { getMatchDetails } from '../../../services/cs2MatchService';

const CS2MatchDetailsScreen = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const { matchId } = route.params;
  const [matchData, setMatchData] = useState(null);
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('Overview');

  useEffect(() => {
    loadMatchData();
  }, [matchId]);

  const loadMatchData = async () => {
    try {
      setLoading(true);
      // Note: This screen is deprecated in favor of CS2Results
      // Just redirect to CS2Results if matchData is available
      if (route.params?.matchData) {
        navigation.replace('CS2Results', {
          matchId: matchId,
          matchData: route.params.matchData
        });
        return;
      }
      
      // Legacy support - try to load with just matchId (will likely fail)
      const match = await getMatchDetails(matchId);
      setMatchData(match);
    } catch (error) {
      console.error('Error loading match data:', error);
      // Redirect to tournament screen or show error
      console.warn('CS2MatchDetailsScreen is deprecated. Use CS2Results instead.');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMatchData();
    setRefreshing(false);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date - now;
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins > 0) {
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      
      if (diffDays > 0) {
        return `${diffDays}d ${diffHours % 24}h`;
      } else if (diffHours > 0) {
        return `${diffHours}h ${diffMins % 60}m`;
      } else {
        return `${diffMins}m`;
      }
    } else {
      return 'Live';
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>Loading match details...</Text>
      </View>
    );
  }

  if (!matchData) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle" size={48} color={theme.textSecondary} />
        <Text style={[styles.errorText, { color: theme.text }]}>Match not found</Text>
        <TouchableOpacity 
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={loadMatchData}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const team1 = matchData.teams[0];
  const team2 = matchData.teams[1];
  const isLive = liveData && liveData.started && !liveData.finished;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surfaceSecondary }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        
        <View style={styles.headerContent}>
          <Text style={[styles.tournamentName, { color: theme.text }]}>
            {matchData.tournament?.nameShortened || matchData.tournament?.name}
          </Text>
          <View style={styles.matchStatus}>
            {isLive && <View style={styles.liveDot} />}
            <Text style={[styles.statusText, { color: isLive ? '#ff4444' : theme.textSecondary }]}>
              {isLive ? 'LIVE' : formatDate(matchData.startTimeScheduled)}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.moreButton}>
          <Ionicons name="ellipsis-vertical" size={20} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* Teams & Score */}
      <View style={[styles.matchInfo, { backgroundColor: theme.surfaceSecondary }]}>
        <View style={styles.teamsContainer}>
          {/* Team 1 */}
          <View style={styles.teamSection}>
            <View style={styles.teamHeader}>
              {team1?.baseInfo?.logoUrl ? (
                <Image source={{ uri: team1.baseInfo.logoUrl }} style={styles.teamLogo} />
              ) : (
                <View style={[styles.placeholderLogo, { backgroundColor: team1?.baseInfo?.colorPrimary || '#666' }]}>
                  <Text style={styles.placeholderText}>
                    {team1?.baseInfo?.name?.substring(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={[styles.teamName, { color: theme.text }]}>
                {team1?.baseInfo?.name}
              </Text>
            </View>
            <Text style={[styles.teamScore, { color: theme.text }]}>
              {liveData?.teams?.[0]?.score ?? team1?.scoreAdvantage ?? 0}
            </Text>
          </View>

          {/* VS */}
          <View style={styles.vsSection}>
            <Text style={[styles.vsText, { color: theme.textSecondary }]}>VS</Text>
            <Text style={[styles.formatText, { color: theme.textSecondary }]}>
              {matchData.format?.nameShortened}
            </Text>
          </View>

          {/* Team 2 */}
          <View style={styles.teamSection}>
            <View style={styles.teamHeader}>
              {team2?.baseInfo?.logoUrl ? (
                <Image source={{ uri: team2.baseInfo.logoUrl }} style={styles.teamLogo} />
              ) : (
                <View style={[styles.placeholderLogo, { backgroundColor: team2?.baseInfo?.colorPrimary || '#666' }]}>
                  <Text style={styles.placeholderText}>
                    {team2?.baseInfo?.name?.substring(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={[styles.teamName, { color: theme.text }]}>
                {team2?.baseInfo?.name}
              </Text>
            </View>
            <Text style={[styles.teamScore, { color: theme.text }]}>
              {liveData?.teams?.[1]?.score ?? team2?.scoreAdvantage ?? 0}
            </Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {['Overview', 'Stats'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && [styles.activeTab, { borderBottomColor: colors.primary }]
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab ? colors.primary : theme.textSecondary }
              ]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {activeTab === 'Overview' && (
          <View>
            {/* Game Details */}
            {liveData?.games && liveData.games.length > 0 && (
              <View style={[styles.section, { backgroundColor: theme.surfaceSecondary }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Game details</Text>
                {liveData.games.map((game, index) => (
                  <View key={index} style={styles.gameCard}>
                    <View style={styles.gameHeader}>
                      <View style={styles.gameInfo}>
                        <Text style={[styles.gameTitle, { color: theme.text }]}>Game {game.sequenceNumber}</Text>
                        {game.map && (
                          <Text style={[styles.mapName, { color: theme.textSecondary }]}>
                            {game.map.name}
                          </Text>
                        )}
                      </View>
                      <View style={styles.gameStatus}>
                        <View style={[styles.statusBadge, { 
                          backgroundColor: game.finished ? '#4CAF50' : (game.started ? '#FF5722' : '#757575')
                        }]}>
                          <Text style={styles.statusBadgeText}>
                            {game.finished ? 'FINISHED' : (game.started ? 'LIVE' : 'PENDING')}
                          </Text>
                        </View>
                      </View>
                    </View>
                    
                    {game.teams && (
                      <View style={styles.gameScore}>
                        {game.teams.map((team, teamIndex) => (
                          <View key={teamIndex} style={styles.gameTeam}>
                            <Text style={[styles.gameTeamName, { color: theme.text }]}>
                              {team.name}
                            </Text>
                            <Text style={[styles.gameTeamScore, { color: theme.text }]}>
                              {team.score || 0}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Tournament Info */}
            <View style={[styles.section, { backgroundColor: theme.surfaceSecondary }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Tournament</Text>
              <View style={styles.tournamentCard}>
                <View style={styles.tournamentInfo}>
                  <Text style={[styles.tournamentTitle, { color: theme.text }]}>
                    {matchData.tournament?.name}
                  </Text>
                  <Text style={[styles.tournamentFormat, { color: theme.textSecondary }]}>
                    {matchData.format?.name}
                  </Text>
                </View>
                <TouchableOpacity style={styles.followButton}>
                  <Ionicons name="heart-outline" size={16} color={colors.primary} />
                  <Text style={[styles.followButtonText, { color: colors.primary }]}>
                    Follow tournament
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {activeTab === 'Stats' && liveData && (
          <View style={[styles.section, { backgroundColor: theme.surfaceSecondary }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Player Statistics</Text>
            {liveData.teams?.map((team, teamIndex) => (
              <View key={teamIndex} style={styles.teamStats}>
                <Text style={[styles.teamStatsTitle, { color: theme.text }]}>
                  {team.name}
                </Text>
                {team.players?.map((player, playerIndex) => (
                  <View key={playerIndex} style={styles.playerStat}>
                    <Text style={[styles.playerName, { color: theme.text }]}>
                      {player.name}
                    </Text>
                    <View style={styles.playerStats}>
                      <Text style={[styles.statItem, { color: theme.textSecondary }]}>
                        K: {player.kills || 0}
                      </Text>
                      <Text style={[styles.statItem, { color: theme.textSecondary }]}>
                        D: {player.deaths || 0}
                      </Text>
                      <Text style={[styles.statItem, { color: theme.textSecondary }]}>
                        A: {player.killAssistsGiven || 0}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
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
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    marginTop: 10,
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButton: {
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
  },
  tournamentName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  matchStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ff4444',
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  moreButton: {
    padding: 8,
  },
  matchInfo: {
    paddingVertical: 24,
  },
  teamsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
  },
  teamSection: {
    alignItems: 'center',
    flex: 1,
  },
  teamHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  teamLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: 8,
  },
  placeholderLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  teamScore: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  vsSection: {
    alignItems: 'center',
    marginHorizontal: 16,
  },
  vsText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  formatText: {
    fontSize: 12,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  gameCard: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gameTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  mapName: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'white',
  },
  gameScore: {
    gap: 8,
  },
  gameTeam: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gameTeamName: {
    fontSize: 14,
    fontWeight: '500',
  },
  gameTeamScore: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  tournamentCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tournamentTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  tournamentFormat: {
    fontSize: 12,
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'currentColor',
  },
  followButtonText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  teamStats: {
    marginBottom: 24,
  },
  teamStatsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  playerStat: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  playerName: {
    fontSize: 14,
    fontWeight: '500',
  },
  playerStats: {
    flexDirection: 'row',
    gap: 12,
  },
  statItem: {
    fontSize: 12,
  },
});

export default CS2MatchDetailsScreen;