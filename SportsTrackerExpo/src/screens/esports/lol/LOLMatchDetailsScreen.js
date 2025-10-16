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
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { 
  getMatchDetails,
  getMatchWindow
} from '../../../services/lolService';

const { width } = Dimensions.get('window');

const LOLMatchDetailsScreen = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const { matchId, match } = route.params;
  
  const [matchDetails, setMatchDetails] = useState(null);
  const [gameWindowData, setGameWindowData] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadMatchData();
  }, [matchId]);

  const loadMatchData = async () => {
    try {
      setLoading(true);
      
      // Load event details
      const details = await getMatchDetails(matchId);
      setMatchDetails(details);
      
      // Load window data for all games in parallel
      if (details?.match?.games) {
        const completedGames = details.match.games.filter(game => game.id && game.state === 'completed');
        
        if (completedGames.length > 0) {
          console.log(`Loading window data for ${completedGames.length} completed games`);
          
          // Time candidates that work with the web version
          const gameDateCandidates = [
            '2025-10-16T15:32:30.000Z', // Primary time from web version
            '2025-10-15T19:05:10.000Z',
            '2025-10-15T18:05:10.000Z', 
            '2025-10-15T17:05:10.000Z',
            '2025-10-15T20:05:10.000Z',
          ];

          // Create promises for all games in parallel
          const windowPromises = completedGames.map(async (game) => {
            console.log(`Loading window data for game ${game.id}`);
            
            // Try each time candidate until one succeeds
            for (const gameDate of gameDateCandidates) {
              try {
                console.log(`Testing game date: ${gameDate} for game ${game.id}`);
                const windowResponse = await getMatchWindow(game.id, gameDate);
                if (windowResponse) {
                  console.log(`Success with game date: ${gameDate} for game ${game.id}`);
                  return { gameId: game.id, data: windowResponse };
                }
              } catch (error) {
                console.log(`Failed with game date: ${gameDate} for game ${game.id}`, error.message);
                continue;
              }
            }
            
            console.warn(`No working time found for game ${game.id}`);
            return { gameId: game.id, data: null };
          });

          // Wait for all window data requests to complete
          const results = await Promise.allSettled(windowPromises);
          
          // Build window data object from results
          const windowData = {};
          results.forEach((result) => {
            if (result.status === 'fulfilled' && result.value.data) {
              windowData[result.value.gameId] = result.value.data;
              console.log(`Successfully loaded window data for game ${result.value.gameId}`);
            } else if (result.status === 'rejected') {
              console.error(`Error loading window data:`, result.reason);
            }
          });

          setGameWindowData(windowData);
        }
      }
      
    } catch (error) {
      console.error('Error loading match data:', error);
      Alert.alert('Error', 'Failed to load match details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMatchData();
    setRefreshing(false);
  };

  // Extract real player data from window data and map to teams
  const getGamePlayerData = (game) => {
    const windowData = gameWindowData[game.id];
    if (!windowData?.gameMetadata) {
      return null;
    }

    const { blueTeamMetadata, redTeamMetadata } = windowData.gameMetadata;
    
    // Get team IDs from match details
    const team1Id = teams[0]?.id; // First team in UI
    const team2Id = teams[1]?.id; // Second team in UI
    
    const getTeamPlayers = (teamMetadata) => {
      if (!teamMetadata?.participantMetadata) return [];
      
      return teamMetadata.participantMetadata.map(participant => ({
        name: participant.summonerName,
        champion: participant.championId,
        role: participant.role
      }));
    };

    // Match teams by esportsTeamId instead of sides (red/blue can change between games)
    let team1Players = [];
    let team2Players = [];

    // Check which metadata (blue or red) corresponds to which actual team
    if (blueTeamMetadata?.esportsTeamId === team1Id) {
      team1Players = getTeamPlayers(blueTeamMetadata);
      team2Players = getTeamPlayers(redTeamMetadata);
    } else if (redTeamMetadata?.esportsTeamId === team1Id) {
      team1Players = getTeamPlayers(redTeamMetadata);
      team2Players = getTeamPlayers(blueTeamMetadata);
    } else {
      // Fallback to blue/red if team IDs don't match (shouldn't happen normally)
      team1Players = getTeamPlayers(blueTeamMetadata);
      team2Players = getTeamPlayers(redTeamMetadata);
    }

    return {
      team1: team1Players,
      team2: team2Players
    };
  };

  // Get final game scores from window data
  const getGameScores = (game) => {
    const windowData = gameWindowData[game.id];
    if (!windowData?.frames || !windowData?.gameMetadata) {
      return { team1Score: 0, team2Score: 0, hasFinished: false };
    }

    // Find the frame with gameState "finished"
    const finishedFrame = windowData.frames.find(frame => frame.gameState === 'finished');
    
    if (!finishedFrame) {
      return { team1Score: 0, team2Score: 0, hasFinished: false };
    }

    // Get team IDs from match details
    const team1Id = teams[0]?.id; // First team in UI
    const team2Id = teams[1]?.id; // Second team in UI

    const { blueTeamMetadata, redTeamMetadata } = windowData.gameMetadata;
    const blueTeamKills = finishedFrame.blueTeam?.totalKills || 0;
    const redTeamKills = finishedFrame.redTeam?.totalKills || 0;

    // Map kills to correct teams based on esportsTeamId instead of sides
    let team1Score = 0;
    let team2Score = 0;

    // Check which team (blue or red) corresponds to which actual team
    if (blueTeamMetadata?.esportsTeamId === team1Id) {
      team1Score = blueTeamKills;
      team2Score = redTeamKills;
    } else if (redTeamMetadata?.esportsTeamId === team1Id) {
      team1Score = redTeamKills;
      team2Score = blueTeamKills;
    } else {
      // Fallback to blue/red if team IDs don't match (shouldn't happen normally)
      team1Score = blueTeamKills;
      team2Score = redTeamKills;
    }

    return { 
      team1Score, 
      team2Score, 
      hasFinished: true,
      winningTeam: team1Score > team2Score ? 1 : team2Score > team1Score ? 2 : 0 // 0 = tie
    };
  };

  // Get the first game's en-US vod firstFrameTime for date/time
  const getGameDateTime = () => {
    if (!matchDetails?.match?.games?.[0]?.vods) return null;
    
    const firstGame = matchDetails.match.games[0];
    const enUsVod = firstGame.vods.find(vod => vod.locale === 'en-US');
    
    return enUsVod?.firstFrameTime || null;
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getMatchStatus = (game = null) => {
    if (game) {
      switch (game.state) {
        case 'completed':
          return { text: 'FINISHED', color: theme.success };
        case 'unneeded':
          return { text: 'UNNEEDED', color: theme.textSecondary };
        case 'unstarted':
          return { text: 'SCHEDULED', color: theme.warning };
        case 'inProgress':
          return { text: 'LIVE', color: theme.error };
        default:
          return { text: game.state?.toUpperCase() || 'TBD', color: theme.textSecondary };
      }
    }
    
    if (!matchDetails) return { text: 'Loading...', color: theme.textSecondary };
    
    // Check if any game is in progress
    const hasLiveGame = matchDetails.match?.games?.some(game => game.state === 'inProgress');
    if (hasLiveGame) {
      return { text: 'LIVE', color: theme.error };
    }
    
    // Check if all games are completed
    const completedGames = matchDetails.match?.games?.filter(game => game.state === 'completed' || game.state === 'unneeded') || [];
    const totalGames = matchDetails.match?.games?.length || 0;
    
    if (completedGames.length === totalGames && totalGames > 0) {
      return { text: 'FINISHED', color: theme.success };
    }
    
    return { text: 'SCHEDULED', color: theme.warning };
  };



  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading match details...
        </Text>
      </View>
    );
  }

  if (!matchDetails) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle-outline" size={64} color={theme.textTertiary} />
        <Text style={[styles.errorTitle, { color: theme.text }]}>
          Match Not Found
        </Text>
        <Text style={[styles.errorText, { color: theme.textSecondary }]}>
          The requested match could not be loaded.
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={loadMatchData}
        >
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const teams = matchDetails.match?.teams || [];
  const games = matchDetails.match?.games || [];
  const dateTime = getGameDateTime();
  const status = getMatchStatus();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        {/* Match Header */}
        <View style={[styles.heroSection, { backgroundColor: theme.surfaceSecondary }]}>
          {/* League Name */}
          <Text style={[styles.eventName, { color: theme.text }]}>
            {matchDetails.league?.name || 'Match Details'}
          </Text>
          
          {/* Main Matchup Row */}
          <View style={styles.matchupRow}>
            {/* Team 1 */}
            <View style={styles.teamCompleteSection}>
              <View style={styles.logoScoreRow}>
                <Image
                  source={{ uri: teams[0]?.image || 'https://i.imgur.com/BIC4pnO.webp' }}
                  style={[
                    styles.teamLogoHead,
                    { opacity: status.text === 'FINISHED' && teams[0]?.result?.gameWins < teams[1]?.result?.gameWins ? 0.6 : 1 }
                  ]}
                  resizeMode="contain"
                />
                <Text style={[
                  styles.scoreText, 
                  { 
                    color: theme.text,
                    opacity: status.text === 'FINISHED' && teams[0]?.result?.gameWins < teams[1]?.result?.gameWins ? 0.6 : 1
                  }
                ]}>
                  {teams[0]?.result?.gameWins || 0}
                </Text>
              </View>
              <Text style={[
                styles.teamName, 
                { 
                  color: theme.text,
                  opacity: status.text === 'FINISHED' && teams[0]?.result?.gameWins < teams[1]?.result?.gameWins ? 0.6 : 1
                }
              ]}>
                {teams[0]?.code || 'TBD'}
              </Text>
            </View>

            {/* Score Separator */}
            <Text style={[styles.scoreSeparator, { color: theme.textSecondary }]}>-</Text>

            {/* Team 2 */}
            <View style={styles.teamCompleteSection}>
              <View style={styles.logoScoreRow}>
                <Text style={[
                  styles.scoreText, 
                  { 
                    color: theme.text,
                    opacity: status.text === 'FINISHED' && teams[1]?.result?.gameWins < teams[0]?.result?.gameWins ? 0.6 : 1
                  }
                ]}>
                  {teams[1]?.result?.gameWins || 0}
                </Text>
                <Image
                  source={{ uri: teams[1]?.image || 'https://i.imgur.com/BIC4pnO.webp' }}
                  style={[
                    styles.teamLogoHead,
                    { opacity: status.text === 'FINISHED' && teams[1]?.result?.gameWins < teams[0]?.result?.gameWins ? 0.6 : 1 }
                  ]}
                  resizeMode="contain"
                />
              </View>
              <Text style={[
                styles.teamName, 
                { 
                  color: theme.text,
                  opacity: status.text === 'FINISHED' && teams[1]?.result?.gameWins < teams[0]?.result?.gameWins ? 0.6 : 1
                }
              ]}>
                {teams[1]?.code || 'TBD'}
              </Text>
            </View>
          </View>
          
          {/* Status and Date */}
          <View style={styles.statusDateContainer}>
            <View style={[styles.statusBadge, { backgroundColor: status.color }]}>
              <Text style={styles.statusText}>{status.text}</Text>
            </View>
            
            {dateTime && (
              <Text style={[styles.dateText, { color: theme.textSecondary }]}>
                {formatDate(dateTime)} • {formatTime(dateTime)}
              </Text>
            )}
          </View>
        </View>

        {/* Game Details Section */}
        <View style={styles.gameDetailsSection}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Game details
          </Text>
          
          {games.length > 0 && (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.gameScrollView}
              contentContainerStyle={styles.gameScrollContent}
            >
              {games.map((game, index) => {
                const gameStatus = getMatchStatus(game);
                const gameScores = getGameScores(game);
                
                // Get real player data from window data, fallback to default
                const realPlayerData = getGamePlayerData(game);
                const playersData = realPlayerData || {
                  team1: [
                    { name: 'Player1', champion: 'TBD' },
                    { name: 'Player2', champion: 'TBD' },
                    { name: 'Player3', champion: 'TBD' },
                    { name: 'Player4', champion: 'TBD' },
                    { name: 'Player5', champion: 'TBD' }
                  ],
                  team2: [
                    { name: 'Player6', champion: 'TBD' },
                    { name: 'Player7', champion: 'TBD' },
                    { name: 'Player8', champion: 'TBD' },
                    { name: 'Player9', champion: 'TBD' },
                    { name: 'Player10', champion: 'TBD' }
                  ]
                };
                
                return (
                  <TouchableOpacity
                    key={game.id || index}
                    style={[
                      styles.gameCard,
                      { backgroundColor: theme.surface }
                    ]}
                    onPress={() => {
                      if (game.id && game.state === 'completed') {
                        navigation.navigate('LOLGameDetails', {
                          gameId: game.id,
                          matchDetails: matchDetails,
                          teams: teams
                        });
                      }
                    }}
                  >
                    {/* Header */}
                    <View style={[styles.headerSection, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.gameTitle, { color: theme.text }]}>
                        Game {game.number || index + 1}
                      </Text>
                      <View style={[styles.gameStatus, { backgroundColor: gameStatus.color }]}>
                        <Text style={styles.gameStatusText}>{gameStatus.text}</Text>
                      </View>
                    </View>

                    {/* Map & Score Section */}
                    <View style={styles.mapScoreSection}>
                      {/* Map Background */}
                      <Image
                        source={{ uri: 'https://i.redd.it/wofey4h7koba1.jpg' }}
                        style={styles.mapBackground}
                        resizeMode="cover"
                      />
                      
                      {/* Map Overlay */}
                      <View style={styles.mapOverlay} />
                      
                      {/* Score Content */}
                      <View style={styles.scoreContent}>
                        <View style={styles.teamScoreContainer}>
                          <Image
                            source={{ uri: teams[0]?.image || 'https://i.imgur.com/BIC4pnO.webp' }}
                            style={[
                              styles.teamLogo,
                              { 
                                opacity: gameScores.hasFinished && gameScores.winningTeam === 2 ? 0.5 : 1 
                              }
                            ]}
                            resizeMode="contain"
                          />
                          <Text style={[
                            styles.gameScoreText, 
                            { 
                              color: 'white',
                              opacity: gameScores.hasFinished && gameScores.winningTeam === 2 ? 0.5 : 1
                            }
                          ]}>
                            {gameScores.team1Score}
                          </Text>
                        </View>
                        
                        <View style={styles.mapNameContainer}>
                          <Text style={[styles.mapName, { color: 'white' }]}>
                            Summoner's Rift
                          </Text>
                        </View>
                        
                        <View style={styles.teamScoreContainer}>
                          <Image
                            source={{ uri: teams[1]?.image || 'https://i.imgur.com/BIC4pnO.webp' }}
                            style={[
                              styles.teamLogo,
                              { 
                                opacity: gameScores.hasFinished && gameScores.winningTeam === 1 ? 0.5 : 1 
                              }
                            ]}
                            resizeMode="contain"
                          />
                          <Text style={[
                            styles.gameScoreText, 
                            { 
                              color: 'white',
                              opacity: gameScores.hasFinished && gameScores.winningTeam === 1 ? 0.5 : 1
                            }
                          ]}>
                            {gameScores.team2Score}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Players Section */}
                    <View style={[styles.playersSection, { backgroundColor: theme.surface }]}>
                      {/* Teams Side by Side */}
                      <View style={styles.teamsContainer}>
                        {/* Team 1 - Left Side */}
                        <View style={styles.leftTeamContainer}>
                          <Text style={[styles.teamLabel, { color: theme.text }]}>
                            {teams[0]?.code || 'Team 1'}
                          </Text>
                          <View style={styles.leftPlayersColumn}>
                            {playersData.team1.map((player, pIndex) => (
                              <View key={pIndex} style={styles.leftPlayerItem}>
                                <Image
                                  source={{ uri: player.champion === 'TBD' ? '' : `https://ddragon.leagueoflegends.com/cdn/15.20.1/img/champion/${player.champion}.png` }}
                                  style={styles.championImage}
                                  resizeMode="cover"
                                />
                                <View style={styles.playerInfo}>
                                  <Text style={[styles.playerName, { color: theme.text }]}>
                                    {player.name}
                                  </Text>
                                  <Text style={[styles.championName, { color: theme.textSecondary }]}>
                                    {player.champion}
                                  </Text>
                                </View>
                              </View>
                            ))}
                          </View>
                        </View>
                        
                        {/* Team 2 - Right Side */}
                        <View style={styles.rightTeamContainer}>
                          <Text style={[styles.teamLabel, { color: theme.text }]}>
                            {teams[1]?.code || 'Team 2'}
                          </Text>
                          <View style={styles.rightPlayersColumn}>
                            {playersData.team2.map((player, pIndex) => (
                              <View key={pIndex} style={styles.rightPlayerItem}>
                                <View style={styles.playerInfoRight}>
                                  <Text style={[styles.playerName, { color: theme.text, textAlign: 'right' }]}>
                                    {player.name}
                                  </Text>
                                  <Text style={[styles.championName, { color: theme.textSecondary, textAlign: 'right' }]}>
                                    {player.champion}
                                  </Text>
                                </View>
                                <Image
                                  source={{ uri: player.champion === 'TBD' ? '' : `https://ddragon.leagueoflegends.com/cdn/15.20.1/img/champion/${player.champion}.png` }}
                                  style={styles.championImage}
                                  resizeMode="cover"
                                />
                              </View>
                            ))}
                          </View>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </ScrollView>
    </View>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  heroSection: {
    padding: 24,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  eventName: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  matchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    width: '100%',
  },
  teamCompleteSection: {
    alignItems: 'center',
    flex: 1,
  },
  logoScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamLogoHead: {
    width: 50,
    height: 50,
    marginHorizontal: 4,
  },
  scoreText: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  teamName: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  scoreSeparator: {
    marginTop: -25,
    fontSize: 24,
    fontWeight: 'bold',
    marginHorizontal: 8,
  },
  statusDateContainer: {
    alignItems: 'center',
    marginTop: -30,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 8,
  },
  statusText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  dateText: {
    fontSize: 14,
    textAlign: 'center',
  },
  gameDetailsSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  gameScrollView: {
    marginHorizontal: -5,
  },
  gameScrollContent: {
    paddingHorizontal: 5,
  },
  gameCard: {
    width: width * 0.8,
    marginHorizontal: 5,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
  },
  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  gameTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  gameStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  gameStatusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  mapScoreSection: {
    position: 'relative',
    height: 120,
  },
  mapBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  mapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  scoreContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  teamScoreContainer: {
    alignItems: 'center',
    flexDirection: 'column',
  },
  teamLogo: {
    width: 40,
    height: 40,
    marginBottom: 4,
  },
  gameScoreText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  mapNameContainer: {
    alignItems: 'center',
    flex: 1,
  },
  mapName: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  playersSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  teamsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  leftTeamContainer: {
    flex: 1,
    marginRight: 8,
  },
  rightTeamContainer: {
    flex: 1,
    marginLeft: 8,
  },
  teamLabel: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  leftPlayersColumn: {
    alignItems: 'flex-start',
  },
  rightPlayersColumn: {
    alignItems: 'flex-end',
  },
  leftPlayerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    width: '100%',
  },
  rightPlayerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    width: '100%',
    justifyContent: 'flex-end',
  },
  championImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginHorizontal: 6,
  },
  playerInfo: {
    flex: 1,
  },
  playerInfoRight: {
    flex: 1,
  },
  playerName: {
    fontSize: 13,
    fontWeight: '500',
  },
  championName: {
    fontSize: 11,
    marginTop: 2,
  },
});

export default LOLMatchDetailsScreen;