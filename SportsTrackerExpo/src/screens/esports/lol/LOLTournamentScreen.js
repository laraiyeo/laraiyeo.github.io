import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { getStandings, getCompletedEvents, getLeagues, getTournamentsForLeague, formatMatchData } from '../../../services/lolService';

const LOLTournamentScreen = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const { tournamentId, league: passedLeague } = route.params;
  
  const [tournament, setTournament] = useState(null);
  const [league, setLeague] = useState(null);
  const [standings, setStandings] = useState(null);
  const [completedEvents, setCompletedEvents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [activeStages, setActiveStages] = useState({});
  const [showMatches, setShowMatches] = useState({});
  const [expandedEvents, setExpandedEvents] = useState({});

  useEffect(() => {
    loadData();
  }, [tournamentId]);

  // Format tournament name from slug (capitalize first 3 letters if word is exactly 3 letters)
  const formatTournamentName = (slug) => {
    if (!slug) return 'Unknown Tournament';
    
    // Remove year patterns (e.g., _2025, _2024, etc.)
    let formatted = slug.replace(/_\d{4}$/, '');
    
    // Replace underscores with spaces and capitalize appropriately
    formatted = formatted
      .split('_')
      .map(word => {
        if (word.length === 3) {
          // Capitalize all 3 letters if word is exactly 3 letters
          return word.toUpperCase();
        } else {
          // Normal capitalization for other words
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }
      })
      .join(' ');
    
    return formatted;
  };

  // Extract unique teams from standings and completed events data
  const extractTeamsFromData = (standingsData, eventsData) => {
    const teamsMap = new Map();
    
    // Extract teams from standings matches
    if (standingsData?.length > 0) {
      standingsData[0]?.stages?.forEach(stage => {
        stage.sections?.forEach(section => {
          section.matches?.forEach(match => {
            match.teams?.forEach(team => {
              // Filter out TBD teams and teams without proper names
              if (team && team.id && team.name && team.code && 
                  team.name !== 'TBD' && team.code !== 'TBD' &&
                  !team.name.toLowerCase().includes('tbd') &&
                  !team.code.toLowerCase().includes('tbd')) {
                teamsMap.set(team.id, {
                  id: team.id,
                  name: team.name,
                  code: team.code,
                  image: team.image,
                });
              }
            });
          });
        });
      });
    }
    
    // Extract teams from completed events
    if (eventsData?.length > 0) {
      eventsData.forEach(event => {
        event.match?.teams?.forEach(team => {
          // Filter out TBD teams and teams without proper names
          if (team && team.id && team.name && team.code && 
              team.name !== 'TBD' && team.code !== 'TBD' &&
              !team.name.toLowerCase().includes('tbd') &&
              !team.code.toLowerCase().includes('tbd')) {
            teamsMap.set(team.id, {
              id: team.id,
              name: team.name,
              code: team.code,
              image: team.image,
            });
          }
        });
      });
    }
    
    return Array.from(teamsMap.values());
  };

  // Get tournament status
  const getTournamentStatus = (startDate, endDate) => {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (now < start) return 'upcoming';
    if (now >= start && now <= end) return 'live';
    return 'completed';
  };

  // Find tournament and league data
  const findTournamentData = async (tournamentId) => {
    try {
      // If we have league data passed from navigation, use it directly
      if (passedLeague) {
        console.log('Using passed league data:', passedLeague.slug);
        const tournaments = await getTournamentsForLeague(passedLeague.id);
        const tournament = tournaments.find(t => t.id === tournamentId);
        
        if (tournament) {
          return { tournament, league: passedLeague };
        }
        
        // If not found in passed league, fall back to full search
        console.warn('Tournament not found in passed league, falling back to full search');
      }
      
      // Fallback: search all leagues (inefficient but necessary if no league passed)
      console.log('Searching all leagues for tournament:', tournamentId);
      const leagues = await getLeagues();
      
      for (const league of leagues) {
        const tournaments = await getTournamentsForLeague(league.id);
        const tournament = tournaments.find(t => t.id === tournamentId);
        
        if (tournament) {
          return { tournament, league };
        }
      }
      
      return { tournament: null, league: null };
    } catch (error) {
      console.error('Error finding tournament data:', error);
      return { tournament: null, league: null };
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      console.log('Loading tournament data for:', tournamentId);
      
      // Find tournament and league information
      const { tournament: tournamentData, league: leagueData } = await findTournamentData(tournamentId);
      
      // Fetch standings and completed events for the tournament
      const [standingsData, eventsData] = await Promise.all([
        getStandings(tournamentId),
        getCompletedEvents(tournamentId)
      ]);
      
      console.log('Tournament data:', tournamentData);
      console.log('League data:', leagueData);
      console.log('Standings data:', standingsData);
      console.log('Completed events data:', eventsData);
      
      // Extract teams from all data
      const extractedTeams = extractTeamsFromData(standingsData, eventsData);
      
      setTournament(tournamentData);
      setLeague(leagueData);
      setStandings(standingsData);
      setCompletedEvents(eventsData || []);
      setTeams(extractedTeams);
      
    } catch (error) {
      console.error('Error loading tournament data:', error);
      setTournament(null);
      setLeague(null);
      setStandings(null);
      setCompletedEvents([]);
      setTeams([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const navigateToMatchDetails = (match) => {
    navigation.navigate('LOLMatchDetails', {
      matchId: match.id,
      match: match
    });
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverview();
      case 'results':
        return renderResults();
      default:
        return renderOverview();
    }
  };

  const renderOverview = () => (
    <View >
      {/* Results Section */}
      <View style={styles.detailsSection}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Results
        </Text>
        
        {/* Tournament Stages */}
        {standings?.[0]?.stages && standings[0].stages.length > 0 ? (
          standings[0].stages.map((stage, stageIndex) => {
            const stageKey = `stage-${stage.id || stageIndex}`;
            const isExpanded = expandedEvents[stageKey] || false;
            
            return (
              <View key={stageKey} style={[styles.eventCard, { backgroundColor: theme.surfaceSecondary }]}>
                {/* Stage Header */}
                <TouchableOpacity
                  style={styles.eventHeader}
                  onPress={() => {
                    setExpandedEvents(prev => ({
                      ...prev,
                      [stageKey]: !prev[stageKey]
                    }));
                  }}
                >
                  <View style={styles.eventHeaderLeft}>
                    <Text style={[styles.eventName, { color: theme.text }]}>
                      {stage.name}
                    </Text>
                    <View style={styles.eventMeta}>
                      <View style={[
                        styles.statusBadge, 
                        { backgroundColor: colors.primary }
                      ]}>
                        <Text style={styles.statusText}>TOURNAMENT STAGE</Text>
                      </View>
                    </View>
                  </View>
                  <Ionicons 
                    name={isExpanded ? "chevron-up" : "chevron-down"} 
                    size={20} 
                    color={theme.textSecondary} 
                  />
                </TouchableOpacity>
                
                {/* Stage Content */}
                {isExpanded && (
                  <View style={styles.expandedContent}>
                    {stage.sections?.map((section, sectionIndex) => (
                      <View key={sectionIndex} style={styles.groupContainer}>
                        <Text style={[styles.groupTitle, { color: theme.text }]}>
                          {section.name}
                        </Text>
                        
                        {section.matches?.map((match) => {
                          // Create a formatted match object for navigation
                          const matchForNavigation = {
                            id: match.id,
                            teams: match.teams,
                            state: match.state,
                            tournament: tournament?.slug || 'Unknown Tournament',
                            startTime: match.startTime || new Date().toISOString(),
                            blockName: section.name
                          };

                          return (
                            <TouchableOpacity 
                              key={match.id} 
                              style={[styles.resultCard, { backgroundColor: theme.surface }]}
                              onPress={() => navigateToMatchDetails(matchForNavigation)}
                            >
                              <View style={[styles.resultStageHeader, { backgroundColor: colors.primary }]}>
                                <Text style={styles.resultStageText}>
                                  {match.state.toUpperCase()}
                                </Text>
                              </View>
                            
                            <View style={styles.resultMatchContent}>
                              {match.teams?.slice(0, 2).map((team, index) => (
                                <View key={team?.id || index} style={[styles.resultTeam, index === 1 && styles.resultTeam2]}>
                                  {team?.image && (
                                    <Image
                                      source={{ uri: team.image }}
                                      style={[styles.resultTeamLogo,
                                        team?.result?.outcome === 'win' && { opacity: 1 },
                                        team?.result?.outcome === 'loss' && { opacity: 0.5 }
                                      ]}
                                      resizeMode="contain"
                                      
                                    />
                                  )}
                                  <Text style={[
                                    styles.resultTeamName, 
                                    { color: theme.text },
                                    index === 1 && styles.resultTeamName2,
                                    team?.result?.outcome === 'win' && styles.resultWinnerTeam,
                                    team?.result?.outcome === 'loss' && { opacity: 0.5 }
                                  ]}>
                                    {team?.code || team?.name || 'TBD'}
                                  </Text>
                                </View>
                              ))}
                              
                              <View style={styles.resultScoreSection}>
                                {match.teams?.[0]?.result && match.teams?.[1]?.result && (
                                  <View style={styles.resultScore}>
                                    <Text style={[styles.resultScoreText, { 
                                      color: match.teams[0].result.outcome === 'win' ? colors.primary : theme.text 
                                    }]}>
                                      {match.teams[0].result.gameWins || 0}
                                    </Text>
                                    <Text style={[styles.resultScoreSeparator, { color: theme.textSecondary }]}>
                                      -
                                    </Text>
                                    <Text style={[styles.resultScoreText, { 
                                      color: match.teams[1].result.outcome === 'win' ? colors.primary : theme.text 
                                    }]}>
                                      {match.teams[1].result.gameWins || 0}
                                    </Text>
                                  </View>
                                )}
                                
                                <View style={[styles.resultStatus, { 
                                  backgroundColor: match.state === 'completed' ? theme.success : 
                                                 match.state === 'inProgress' ? theme.error : theme.warning 
                                }]}>
                                  <Text style={styles.resultStatusText}>
                                    {match.state.toUpperCase()}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </TouchableOpacity>
                        )})}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="trophy-outline" size={48} color={theme.textTertiary} />
            <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
              No tournament stages available
            </Text>
          </View>
        )}
      </View>

      {/* Participating Teams Section */}
      <View style={styles.teamsSection}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Participating Teams</Text>
        {teams.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={theme.textTertiary} />
            <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
              No teams data available
            </Text>
          </View>
        ) : (
          <View style={styles.teamsGrid}>
            {teams.map((team) => (
              <View key={team.id} style={[styles.teamCard, { backgroundColor: theme.surfaceSecondary }]}>
                {team.image && (
                  <Image
                    source={{ uri: team.image }}
                    style={styles.teamLogo}
                    resizeMode="contain"
                  />
                )}
                <Text style={[styles.teamName, { color: theme.text }]} numberOfLines={2}>
                  {team.name}
                </Text>
                <Text style={[styles.teamCode, { color: theme.textSecondary }]}>
                  {team.code}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );



  const renderResults = () => {
    // Group completed events and standings matches by stage
    const allMatches = [];
    const addedMatchIds = new Set();
    
    // Add completed events first
    completedEvents.forEach(event => {
      if (event.match?.teams?.length >= 2) {
        const match = {
          id: event.match.id,
          stage: event.blockName || 'Match',
          teams: event.match.teams,
          startTime: event.startTime,
          state: 'completed'
        };
        allMatches.push(match);
        addedMatchIds.add(event.match.id);
      }
    });
    
    // Add matches from standings (only if not already added from completedEvents)
    if (standings?.[0]?.stages) {
      standings[0].stages.forEach(stage => {
        stage.sections?.forEach(section => {
          section.matches?.forEach(match => {
            // Only add if not already added and has valid teams
            if (match.teams?.length >= 2 && !addedMatchIds.has(match.id)) {
              allMatches.push({
                id: match.id,
                stage: stage.name,
                teams: match.teams,
                startTime: null,
                state: match.state
              });
              addedMatchIds.add(match.id);
            }
          });
        });
      });
    }

    if (allMatches.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="trophy-outline" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
            No matches available
          </Text>
        </View>
      );
    }

    // Group matches by stage
    const matchesByStage = {};
    allMatches.forEach(match => {
      if (!matchesByStage[match.stage]) {
        matchesByStage[match.stage] = [];
      }
      matchesByStage[match.stage].push(match);
    });

    return (
      <View style={styles.resultsContainer}>
        {Object.entries(matchesByStage).map(([stageName, matches]) => (
          <View key={stageName} style={styles.resultsStageSection}>
            <Text style={[styles.resultsStageTitle, { color: theme.text }]}>
              {stageName}
            </Text>
            
            {matches.map((match) => (
              <TouchableOpacity 
                key={match.id} 
                style={[styles.resultCard, { backgroundColor: theme.surface }]}
                onPress={() => navigateToMatchDetails(match)}
              >
                <View style={[styles.resultStageHeader, { backgroundColor: colors.primary }]}>
                  <Text style={styles.resultStageText}>
                    {match.state.toUpperCase()}
                  </Text>
                </View>
                
                <View style={styles.resultMatchContent}>
                  {match.teams.slice(0, 2).map((team, index) => (
                    <View key={team?.id || index} style={[styles.resultTeam, index === 1 && styles.resultTeam2]}>
                      {team?.image && (
                        <Image
                          source={{ uri: team.image }}
                          style={[styles.resultTeamLogo,
                            index === 1 && match.teams[0]?.result?.gameWins > match.teams[1]?.result?.gameWins && { opacity: 0.5 },
                            index === 0 && match.teams[1]?.result?.gameWins > match.teams[0]?.result?.gameWins && { opacity: 0.5 }
                          ]}
                          resizeMode="contain"
                        />
                      )}
                      <Text style={[
                        styles.resultTeamName, 
                        { color: theme.text },
                        index === 1 && styles.resultTeamName2,
                        index === 1 && match.teams[0]?.result?.gameWins > match.teams[1]?.result?.gameWins && { opacity: 0.5 },
                        index === 0 && match.teams[1]?.result?.gameWins > match.teams[0]?.result?.gameWins && { opacity: 0.5 },
                      ]}>
                        {team?.code || team?.name || 'TBD'}
                      </Text>
                    </View>
                  ))}
                  
                  <View style={styles.resultScoreSection}>
                    {match.teams[0]?.result && match.teams[1]?.result && (
                      <View style={styles.resultScore}>
                        <Text style={[styles.resultScoreText, { 
                          color: match.teams[0].result.gameWins > match.teams[1].result.gameWins ? colors.primary : theme.textSecondary 
                        }]}>
                          {match.teams[0].result.gameWins || 0}
                        </Text>
                        <Text style={[styles.resultScoreSeparator, { color: theme.textSecondary }]}>
                          -
                        </Text>
                        <Text style={[styles.resultScoreText, { 
                          color: match.teams[1].result.gameWins > match.teams[0].result.gameWins ? colors.primary : theme.textSecondary
                        }]}>
                          {match.teams[1].result.gameWins || 0}
                        </Text>
                      </View>
                    )}
                    
                    <View style={[styles.resultStatus, { 
                      backgroundColor: match.state === 'completed' ? theme.success : 
                                     match.state === 'inProgress' ? theme.error : theme.warning 
                    }]}>
                      <Text style={styles.resultStatusText}>
                        {match.state.toUpperCase()}
                      </Text>
                    </View>
                    
                    {match.startTime && (
                      <Text style={[styles.resultTime, { color: theme.textSecondary }]}>
                        {new Date(match.startTime).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading tournament data...
        </Text>
      </View>
    );
  }

  if (!tournament) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle-outline" size={64} color={theme.textTertiary} />
        <Text style={[styles.errorTitle, { color: theme.text }]}>
          Tournament Not Found
        </Text>
        <Text style={[styles.errorText, { color: theme.textSecondary }]}>
          Unable to load tournament data. Please try again.
        </Text>
        <TouchableOpacity 
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={() => loadData()}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const tournamentStatus = getTournamentStatus(tournament.startDate, tournament.endDate);
  const isLive = tournamentStatus === 'live';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Event Hero */}
      <View style={[styles.heroSection, { backgroundColor: theme.surfaceSecondary }]}>
        {league?.image ? (
          <Image
            source={{ uri: league.image }}
            style={styles.heroImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.heroImagePlaceholder, { backgroundColor: colors.primary }]}>
            <Ionicons name="trophy" size={48} color="white" />
          </View>
        )}
        
        <View style={styles.heroContent}>
          <Text style={[styles.eventTitle, { color: theme.text }]}>
            {formatTournamentName(tournament.slug)}
          </Text>
          
          {/* Event Info */}
          <View style={styles.eventInfoContainer}>
            <Text style={[styles.eventInfo, { color: theme.textSecondary }]}>
              {new Date(tournament.startDate).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric'
              })} - {new Date(tournament.endDate).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric'
              })} • {league?.region || 'Global'}
            </Text>
          </View>
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={[styles.tabContainer, { backgroundColor: theme.surface }]}>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'overview' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }
          ]}
          onPress={() => setActiveTab('overview')}
        >
          <Text style={[
            styles.tabText,
            { color: activeTab === 'overview' ? colors.primary : theme.textSecondary }
          ]}>
            Overview
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'results' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }
          ]}
          onPress={() => setActiveTab('results')}
        >
          <Text style={[
            styles.tabText,
            { color: activeTab === 'results' ? colors.primary : theme.textSecondary }
          ]}>
            Results
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      <View style={styles.tabContent}>
        {renderTabContent()}
      </View>

      <View style={styles.bottomPadding} />
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
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  heroSection: {
    padding: 24,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 24,
    borderRadius: 16,
    alignItems: 'center',
  },

  heroImage: {
    width: 120,
    height: 120,
    borderRadius: 12,
    marginBottom: 16,
  },
  heroImagePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroContent: {
    alignItems: 'center',
  },
  eventTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  eventDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
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
    color: '#ff4444',
    fontSize: 12,
    fontWeight: 'bold',
  },
  eventInfoContainer: {
    marginTop: 5,
  },
  eventInfo: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
  },
  tabContent: {
    paddingHorizontal: 16,
  },
  overviewContainer: {
    marginBottom: 24,
  },
  teamsSection: {
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  detailCard: {
    padding: 16,
    borderRadius: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailContent: {
    marginLeft: 12,
    flex: 1,
  },
  detailLabel: {
    fontSize: 14,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
  },

  teamsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  teamCard: {
    width: '31%',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 90,
    marginBottom: 12,
  },
  teamLogo: {
    width: 40,
    height: 40,
    marginBottom: 8,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  teamCode: {
    fontSize: 12,
  },
  resultsContainer: {
    marginBottom: 24,
  },
  resultsStageSection: {
    marginBottom: 24,
  },
  resultsStageTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  resultCard: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  resultStageHeader: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  resultStageText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  resultMatchContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  resultTeam: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  resultTeam2: {
    justifyContent: 'flex-end',
  },
  resultWinnerTeam: {
    fontWeight: 'bold',
  },
  resultTeamLogo: {
    width: 48,
    height: 48,
    marginBottom: 8,
  },
  resultTeamName: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 80,
  },
  resultTeamName2: {
    textAlign: 'center',
  },
  resultScoreSection: {
    alignItems: 'center',
    minWidth: 100,
    paddingHorizontal: 16,
  },
  resultScore: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  resultScoreText: {
    fontSize: 18,
    fontWeight: 'bold',
    minWidth: 24,
    textAlign: 'center',
  },
  resultScoreSeparator: {
    fontSize: 16,
    marginHorizontal: 8,
  },
  resultStatus: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 2,
  },
  resultStatusText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  resultTime: {
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },
  bottomPadding: {
    height: 32,
  },
  detailsSection: {
    paddingHorizontal: 0
  },
  eventCard: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    justifyContent: 'space-between',
  },
  eventHeaderLeft: {
    flex: 1,
  },
  eventName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  expandedContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  groupContainer: {
    marginBottom: 20,
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
});

export default LOLTournamentScreen;