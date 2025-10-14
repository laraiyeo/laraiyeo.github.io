import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Dimensions,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontAwesome6 } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { 
  getMatchDetails, 
  formatSeriesData, 
  getMapDisplayName,
  getCS2MapImageUrl 
} from '../../../services/cs2MatchService';

const { width: screenWidth } = Dimensions.get('window');

const CS2ResultsScreen = ({ navigation, route }) => {
  const { matchId, matchData } = route.params;
  const { colors, theme } = useTheme();
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedGameIndex, setSelectedGameIndex] = useState(null);
  const [showRoundsModal, setShowRoundsModal] = useState(false);

  useEffect(() => {
    loadSeriesData();
  }, [matchId]);

  const loadSeriesData = async () => {
    try {
      setLoading(true);
      
      if (matchId && matchData) {
        console.log('Loading series data for:', { matchId, matchData });
        console.log('Teams array structure:', matchData.teams);
        console.log('Team 0:', matchData.teams?.[0]);
        console.log('Team 1:', matchData.teams?.[1]);
        
        // Extract team info from matchData for API calls
        // Handle both tournament screen format and home screen format
        const team1Id = matchData.team1_id || matchData.team1?.id || matchData.teams?.[0]?.id;
        const team2Id = matchData.team2_id || matchData.team2?.id || matchData.teams?.[1]?.id;
        const team1Slug = matchData.team1?.slug || matchData.teams?.[0]?.slug;
        const team2Slug = matchData.team2?.slug || matchData.teams?.[1]?.slug;
        const matchStartDate = matchData.start_date || matchData.startDate || matchData.startTime;
        const matchSlug = matchData.slug;
        
        console.log('Extracted team data:', { team1Id, team2Id, team1Slug, team2Slug, matchStartDate, matchSlug });
        
        // Only call API if we have valid team IDs
        if (team1Id && team2Id) {
          console.log('Making API call with valid team IDs...');
          // Try to fetch detailed game data with all 6 endpoints for both teams
          const detailedData = await getMatchDetails(matchId, team1Id, team2Id, team1Slug, team2Slug, matchStartDate, matchSlug);
          setSeries(detailedData);
          console.log('Series data set to:', detailedData);
        } else {
          console.warn('Missing team IDs, using fallback data:', { team1Id, team2Id, matchData });
          // Fallback to passed match data if team IDs are missing
          const formattedData = formatSeriesData(matchData);
          console.log('Formatted fallback data:', formattedData);
          setSeries(formattedData);
          console.log('Series data set to:', formattedData);
        }
      } else if (matchData) {
        // Fallback to passed match data
        const formattedData = formatSeriesData(matchData);
        setSeries(formattedData);
      }
    } catch (error) {
      console.error('Error loading series data:', error);
      
      // Fallback to passed match data if API fails
      if (matchData) {
        const formattedData = formatSeriesData(matchData);
        setSeries(formattedData);
      }
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSeriesData();
    setRefreshing(false);
  };

  // Modal management functions
  const openRoundsModal = (gameIndex) => {
    setSelectedGameIndex(gameIndex);
    setShowRoundsModal(true);
  };

  const closeRoundsModal = () => {
    setShowRoundsModal(false);
    setSelectedGameIndex(null);
  };

  // Get formatted players data for a specific game from both teams
  const getPlayersForGame = (gameIndex) => {
    if (!series || !series.maps || !series.maps[gameIndex]) return [];
    
    const game = series.maps[gameIndex];
    const team1Players = series.team1Players?.results || [];
    const team2Players = series.team2Players?.results || [];
    
    // Filter only active players (status === 1)
    const activeTeam1Players = team1Players.filter(player => player && player.status === 1);
    const activeTeam2Players = team2Players.filter(player => player && player.status === 1);
    
    // Format for team 1
    const formattedTeam1Players = activeTeam1Players.map(player => ({
      teamNumber: 1,
      player: {
        ign: player.nickname || 'Unknown',
        id: player.id
      },
      image_url: player.image_url || 'https://via.placeholder.com/32'
    }));
    
    // Format for team 2
    const formattedTeam2Players = activeTeam2Players.map(player => ({
      teamNumber: 2,
      player: {
        ign: player.nickname || 'Unknown',
        id: player.id
      },
      image_url: player.image_url || 'https://via.placeholder.com/32'
    }));
    
    return [...formattedTeam1Players, ...formattedTeam2Players];
  };

  // Calculate attack/defense stats for CS2 from game_side_results
  const calculateCS2AttackDefenseStats = (gameIndex) => {
    if (!series || !series.maps || !series.maps[gameIndex]) {
      return {
        team1: { attack: 0, defense: 0 },
        team2: { attack: 0, defense: 0 }
      };
    }

    const game = series.maps[gameIndex];
    const roundsByHalves = organizeCS2RoundsByHalves(gameIndex);
    
    // Calculate attack/defense stats based on rounds won
    let team1Attack = 0, team1Defense = 0;
    let team2Attack = 0, team2Defense = 0;
    
    // Count rounds won on attack/defense for each team
    [...roundsByHalves.firstHalf, ...roundsByHalves.secondHalf, ...roundsByHalves.overtime].forEach(round => {
      if (round.winningTeamNumber === 1) {
        if (round.attackingTeamNumber === 1) {
          team1Attack++;
        } else {
          team1Defense++;
        }
      } else if (round.winningTeamNumber === 2) {
        if (round.attackingTeamNumber === 2) {
          team2Attack++;
        } else {
          team2Defense++;
        }
      }
    });
    
    return {
      team1: { attack: team1Attack, defense: team1Defense },
      team2: { attack: team2Attack, defense: team2Defense }
    };
  };

  // Get CS2 end reason icon
  const getCS2EndReasonIcon = (endReason) => {
    const iconMap = {
      'TargetBombed': 'bomb',
      'BombDefused': 'wrench',
      'CTWin': 'skull',
      'TerroristsWin': 'skull',
      'TargetSaved': 'clock'
    };
    return iconMap[endReason] || 'skull'; // Default to skull for unknown reasons
  };

  // Organize rounds by halves using real data from 5.txt game_rounds
  const organizeCS2RoundsByHalves = (gameIndex) => {
    if (!series || !series.maps || !series.maps[gameIndex]) {
      return { firstHalf: [], secondHalf: [], overtime: [] };
    }

    const game = series.maps[gameIndex];
    
    // Get the actual game rounds data from the API (this would be from the 5.txt game_rounds array)
    // This comes from series.gameDetails.results[gameIndex].game_rounds - same structure as game_side_results
    const gameRounds = series.gameDetails?.results?.[gameIndex]?.game_rounds || [];
    
    const rounds = [];
    
    if (gameRounds.length > 0) {
      // Use real round data from API
      gameRounds.forEach((roundData, index) => {
        const roundNumber = roundData.round_number || (index + 1);
        
        // Determine which team won this round based on winner_clan_name
        let winningTeamNumber = 1; // Default to team 1
        
        // Compare winner_clan_name with both team names (try different variations)
        const winnerClanName = roundData.winner_clan_name;
        const team1Name = series.team1?.name;
        const team2Name = series.team2?.name;
        
        // Check if the winner matches team2
        if (winnerClanName === team2Name || 
            winnerClanName === series.team2?.shortName ||
            (winnerClanName && team2Name && winnerClanName.includes(team2Name)) ||
            (winnerClanName && team2Name && team2Name.includes(winnerClanName))) {
          winningTeamNumber = 2;
        } else {
        }
        
        // Determine attacking team based on winner_clan_side and end_reason
        let attackingTeamNumber;
        if (roundData.winner_clan_side === 'T') {
          // If winner was T-side, they were attacking
          attackingTeamNumber = winningTeamNumber;
        } else {
          // If winner was CT-side, they were defending, so other team was attacking
          attackingTeamNumber = winningTeamNumber === 1 ? 2 : 1;
        }
        
        rounds.push({
          id: roundData.id || roundNumber,
          number: roundNumber,
          winningTeamNumber,
          attackingTeamNumber,
          winCondition: roundData.end_reason || 'Elimination',
          winnerSide: roundData.winner_clan_side,
          winnerClanName: winnerClanName // Store for debugging
        });
      });
    } else {
      // Fallback: Generate mock data based on final scores
      const totalRounds = game.team1Score + game.team2Score;
      let team1Rounds = 0;
      let team2Rounds = 0;
      
      for (let i = 1; i <= totalRounds; i++) {
        let winningTeamNumber;
        const team1Remaining = game.team1Score - team1Rounds;
        const team2Remaining = game.team2Score - team2Rounds;
        
        if (team1Remaining > 0 && (team2Remaining === 0 || Math.random() < 0.5)) {
          winningTeamNumber = 1;
          team1Rounds++;
        } else {
          winningTeamNumber = 2;
          team2Rounds++;
        }
        
        // Determine attacking team based on CS2 side switching rules
        let attackingTeamNumber;
        if (i <= 15) {
          attackingTeamNumber = (i % 2 === 1) ? 1 : 2;
        } else {
          attackingTeamNumber = (i % 2 === 1) ? 2 : 1;
        }
        
        rounds.push({
          id: i,
          number: i,
          winningTeamNumber,
          attackingTeamNumber,
          winCondition: ['TargetBombed', 'BombDefused', 'CTWin', 'TerroristsWin'][Math.floor(Math.random() * 4)],
          winnerSide: attackingTeamNumber === winningTeamNumber ? 'T' : 'CT'
        });
      }
    }
    
    const firstHalf = rounds.filter(r => r.number <= 12);
    const secondHalf = rounds.filter(r => r.number > 12 && r.number <= 24);
    const overtime = rounds.filter(r => r.number > 24);
    
    return { firstHalf, secondHalf, overtime };
  };

  // Calculate head-to-head record from API data
  const calculateHeadToHeadRecord = () => {
    if (!series.headToHeadData?.results) {
      return { team1Wins: 0, team2Wins: 0, totalMatches: 0 };
    }

    const h2hMatches = series.headToHeadData.results;
    let team1Wins = 0;
    let team2Wins = 0;

    h2hMatches.forEach(match => {
      if (match.winner_team_id === series.team1?.id) {
        team1Wins++;
      } else if (match.winner_team_id === series.team2?.id) {
        team2Wins++;
      }
    });

    return { team1Wins, team2Wins, totalMatches: h2hMatches.length };
  };

  // Render head-to-head record card (VAL style)
  const renderHeadToHeadCard = () => {
    const h2hRecord = calculateHeadToHeadRecord();
    
    return (
      <View style={[styles.h2hCard, { backgroundColor: theme.surface }]}>
        {/* Team 1 Section */}
        <View style={styles.h2hTeamSection}>
          <Image
            source={{ uri: series.team1?.logoUrl }}
            style={styles.h2hTeamLogo}
            resizeMode="contain"
          />
          <Text style={[styles.h2hTeamName, { color: theme.text }]}>
            {series.team1?.shortName || 'TBD'}
          </Text>
        </View>

        {/* Score Section */}
        <View style={styles.h2hScoreSection}>
          <View style={styles.h2hScoreRow}>
            <Text style={[styles.h2hScore, { color: theme.text }]}>
              {h2hRecord.team1Wins}
            </Text>
            <Text style={[styles.h2hScoreSeparator, { color: theme.textSecondary }]}>
              -
            </Text>
            <Text style={[styles.h2hScore, { color: theme.text }]}>
              {h2hRecord.team2Wins}
            </Text>
          </View>
          <Text style={[styles.h2hMatchCount, { color: theme.textSecondary }]}>
            Last {h2hRecord.totalMatches} matches
          </Text>
        </View>

        {/* Team 2 Section */}
        <View style={styles.h2hTeamSection}>
          <Image
            source={{ uri: series.team2?.logoUrl }}
            style={styles.h2hTeamLogo}
            resizeMode="contain"
          />
          <Text style={[styles.h2hTeamName, { color: theme.text }]}>
            {series.team2?.shortName || 'TBD'}
          </Text>
        </View>
      </View>
    );
  };

  // Render recent matches list (VAL style)
  const renderRecentMatches = () => {
    if (!series.headToHeadData?.results || series.headToHeadData.results.length === 0) {
      return (
        <View style={styles.noDataContainer}>
          <Text style={[styles.noDataText, { color: theme.textSecondary }]}>
            No recent head-to-head matches found
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.recentMatchesList}>
        {series.headToHeadData.results.map((match, index) => {
          const isTeam1Winner = match.winner_team_id === series.team1?.id;
          const isTeam2Winner = match.winner_team_id === series.team2?.id;
          
          return (
            <View key={match.id} style={[styles.recentMatchCard, { backgroundColor: theme.surface }]}>
              {/* Tournament Name */}
              <Text style={[styles.recentMatchTournament, { color: theme.textSecondary }]}>
                {match.tournament?.name || 'Tournament'}
              </Text>
              
              {/* Match Info Row */}
              <View style={styles.recentMatchRow}>
                {/* Team 1 */}
                <View style={styles.recentMatchTeam}>
                  <Image
                    source={{ uri: match.team1?.image_url }}
                    style={[
                      styles.recentMatchTeamLogo,
                      { opacity: !isTeam1Winner ? 0.6 : 1 }
                    ]}
                    resizeMode="contain"
                  />
                  <Text style={[
                    styles.recentMatchTeamName,
                    { 
                      color: theme.text,
                      opacity: !isTeam1Winner ? 0.6 : 1
                    }
                  ]}>
                    {match.team1?.name || 'TBD'}
                  </Text>
                </View>

                {/* Score */}
                <View style={styles.recentMatchScore}>
                  <Text style={[styles.recentMatchScoreText, { color: theme.text }]}>
                    {match.team1_score} - {match.team2_score}
                  </Text>
                </View>

                {/* Team 2 */}
                <View style={styles.recentMatchTeam}>
                  <Text style={[
                    styles.recentMatchTeamName,
                    { 
                      color: theme.text,
                      opacity: !isTeam2Winner ? 0.6 : 1
                    }
                  ]}>
                    {match.team2?.name || 'TBD'}
                  </Text>
                  <Image
                    source={{ uri: match.team2?.image_url }}
                    style={[
                      styles.recentMatchTeamLogo,
                      { opacity: !isTeam2Winner ? 0.6 : 1 }
                    ]}
                    resizeMode="contain"
                  />
                </View>
              </View>

              {/* Date */}
              <Text style={[styles.recentMatchDate, { color: theme.textSecondary }]}>
                {new Date(match.start_date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading match details...
          </Text>
        </View>
      </View>
    );
  }

  if (!series) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={theme.textTertiary} />
          <Text style={[styles.errorTitle, { color: theme.text }]}>Match Not Found</Text>
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>
            Unable to load match details. Please try again.
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        {/* Series Header - EXACT VAL style with floating header */}
        <View style={[styles.seriesHeader, { backgroundColor: theme.surfaceSecondary }]}>
          {/* Event Name */}
          <Text style={[styles.eventName, { color: theme.text }]}>
            {series.eventName || 'CS2 Match Details'}
          </Text>
          
          {/* Main Matchup Row */}
          <View style={styles.matchupRow}>
            {/* Team 1 Complete Section */}
            <View style={styles.teamCompleteSection}>
              {/* Logo and Score Row */}
              <View style={styles.logoScoreRow}>
                <Image
                  source={{ uri: series.team1?.logoUrl || 'https://via.placeholder.com/64' }}
                  style={[
                    styles.teamLogoHead,
                    { opacity: series.completed && series.team1Score < series.team2Score ? 0.6 : 1 }
                  ]}
                  resizeMode="contain"
                />
                <Text style={[
                  styles.scoreText, 
                  { 
                    color: theme.text,
                    opacity: series.completed && series.team1Score < series.team2Score ? 0.6 : 1
                  }
                ]}>
                  {series.team1Score || 0}
                </Text>
              </View>
              {/* Team Name Below */}
              <Text style={[
                styles.teamName, 
                { 
                  color: theme.text,
                  opacity: series.completed && series.team1Score < series.team2Score ? 0.6 : 1
                }
              ]}>
                {series.team1?.shortName || 'TBD'}
              </Text>
            </View>

            {/* Score Separator */}
            <Text style={[styles.scoreSeparator, { color: theme.textSecondary }]}>-</Text>

            {/* Team 2 Complete Section */}
            <View style={styles.teamCompleteSection}>
              {/* Score and Logo Row */}
              <View style={styles.logoScoreRow}>
                <Text style={[
                  styles.scoreText, 
                  { 
                    color: theme.text,
                    opacity: series.completed && series.team2Score < series.team1Score ? 0.6 : 1
                  }
                ]}>
                  {series.team2Score || 0}
                </Text>
                <Image
                  source={{ uri: series.team2?.logoUrl || 'https://via.placeholder.com/64' }}
                  style={[
                    styles.teamLogoHead,
                    { opacity: series.completed && series.team2Score < series.team1Score ? 0.6 : 1 }
                  ]}
                  resizeMode="contain"
                />
              </View>
              {/* Team Name Below */}
              <Text style={[
                styles.teamName, 
                { 
                  color: theme.text,
                  opacity: series.completed && series.team2Score < series.team1Score ? 0.6 : 1
                }
              ]}>
                {series.team2?.shortName || 'TBD'}
              </Text>
            </View>
          </View>
          
          {/* Status and Date */}
          <View style={styles.statusDateContainer}>
            {series.completed ? (
              <View style={[styles.statusBadge, { backgroundColor: theme.success }]}>
                <Text style={styles.statusText}>FINISHED</Text>
              </View>
            ) : (
              <View style={[styles.statusBadge, { backgroundColor: theme.warning }]}>
                <Text style={styles.statusText}>SCHEDULED</Text>
              </View>
            )}
            
            {series.startDate && (
              <Text style={[styles.dateText, { color: theme.textSecondary }]}>
                {new Date(series.startDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })} • {new Date(series.startDate).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: 'numeric',
                  hour12: true
                })}
              </Text>
            )}
          </View>
        </View>

        {/* Tab Navigation - EXACT VAL style */}
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
              activeTab === 'stats' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }
            ]}
            onPress={() => setActiveTab('stats')}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === 'stats' ? colors.primary : theme.textSecondary }
            ]}>
              Stats
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <View style={styles.contentContainer}>
            {/* Game Details Section */}
            <View style={styles.gameDetailsSection}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Map results
              </Text>
              
              {series.maps && series.maps.length > 0 ? (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.gameScrollView}
                  contentContainerStyle={styles.gameScrollContent}
                >
                  {series.maps
                    .filter(map => map.name) // Only render if map name exists
                    .map((map, index) => {
                    const mapDisplayName = getMapDisplayName(map.name);
                    const team1Won = map.team1Score > map.team2Score;
                    const team2Won = map.team2Score > map.team1Score;
                    const players = getPlayersForGame(index);
                    
                    return (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.gameCard,
                          { backgroundColor: theme.surface }
                        ]}
                        activeOpacity={0.8}
                      >
                        {/* SECTION 1: Header */}
                        <View style={[styles.headerSection, { backgroundColor: theme.surface }]}>
                          <Text style={[styles.gameTitle, { color: theme.text }]}>
                            Game {index + 1}
                          </Text>
                          {map.completed ? (
                            <View style={[styles.gameStatus, { backgroundColor: theme.success }]}>
                              <Text style={styles.gameStatusText}>FINISHED</Text>
                            </View>
                          ) : (
                            <View style={[styles.gameStatus, { backgroundColor: theme.warning }]}>
                              <Text style={styles.gameStatusText}>SCHEDULED</Text>
                            </View>
                          )}
                        </View>

                        {/* SECTION 2: Map & Score */}
                        <View style={styles.mapScoreSection}>
                          {/* Map Background */}
                          <Image
                            source={{ uri: getCS2MapImageUrl(map.name?.replace('de_', '') || map.displayName?.toLowerCase()) }}
                            style={styles.mapBackground}
                            resizeMode="cover"
                          />
                          
                          {/* Map Overlay */}
                          <View style={styles.mapOverlay} />
                          
                          {/* Score Content */}
                          <View style={styles.scoreContent}>
                            <View style={styles.teamScoreContainer}>
                              <Image
                                source={{ uri: series.team1?.logoUrl }}
                                style={[
                                  styles.teamLogo,
                                  { opacity: map.completed && !team1Won ? 0.6 : 1 }
                                ]}
                                resizeMode="contain"
                              />
                              <Text style={[
                                styles.gameScoreText, 
                                { 
                                  color: 'white',
                                  opacity: map.completed && !team1Won ? 0.6 : 1
                                }
                              ]}>
                                {map.team1Score || 0}
                              </Text>
                            </View>
                            
                            <View style={styles.mapNameContainer}>
                              <Text style={[styles.mapName, { color: 'white' }]}>
                                {mapDisplayName}
                              </Text>
                            </View>
                            
                            <View style={styles.teamScoreContainer}>
                              <Image
                                source={{ uri: series.team2?.logoUrl }}
                                style={[
                                  styles.teamLogo,
                                  { opacity: map.completed && !team2Won ? 0.6 : 1 }
                                ]}
                                resizeMode="contain"
                              />
                              <Text style={[
                                styles.gameScoreText, 
                                { 
                                  color: 'white',
                                  opacity: map.completed && !team2Won ? 0.6 : 1
                                }
                              ]}>
                                {map.team2Score || 0}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {/* SECTION 3: Players */}
                        <View style={[styles.playersSection, { backgroundColor: theme.surface }]}>
                          {players && players.length > 0 && (
                            <>
                              {/* Teams Side by Side */}
                              <View style={styles.teamsContainer}>
                                {/* Team 1 - Left Side */}
                                <View style={styles.leftTeamContainer}>
                                  <Text style={[styles.teamLabel, { color: theme.text }]}>
                                    {series.team1?.shortName || 'Team 1'}
                                  </Text>
                                  <View style={styles.leftPlayersColumn}>
                                    {players
                                      .filter(player => player.teamNumber === 1)
                                      .slice(0, 5)
                                      .map((player, pIndex) => {
                                        return (
                                          <View key={pIndex} style={styles.leftPlayerItem}>
                                            <Image
                                              source={{ uri: player.image_url || 'https://via.placeholder.com/32' }}
                                              style={styles.playerImage}
                                              resizeMode="cover"
                                            />
                                            <View style={styles.playerInfo}>
                                              <Text style={[styles.playerName, { color: theme.text }]}>
                                                {player.player?.ign}
                                              </Text>
                                            </View>
                                          </View>
                                        );
                                      })
                                    }
                                  </View>
                                </View>
                                
                                {/* Team 2 - Right Side */}
                                <View style={styles.rightTeamContainer}>
                                  <Text style={[styles.teamLabel, { color: theme.text }]}>
                                    {series.team2?.shortName || 'Team 2'}
                                  </Text>
                                  <View style={styles.rightPlayersColumn}>
                                    {players
                                      .filter(player => player.teamNumber === 2)
                                      .slice(0, 5)
                                      .map((player, pIndex) => {
                                        return (
                                          <View key={pIndex} style={styles.rightPlayerItem}>
                                            <View style={styles.playerInfoRight}>
                                              <Text style={[styles.playerName, { color: theme.text, textAlign: 'right' }]}>
                                                {player.player?.ign}
                                              </Text>
                                            </View>
                                            <Image
                                              source={{ uri: player.image_url || 'https://via.placeholder.com/32' }}
                                              style={styles.playerImage}
                                              resizeMode="cover"
                                            />
                                          </View>
                                        );
                                      })
                                    }
                                  </View>
                                </View>
                              </View>

                              {/* Action Buttons - Only Rounds button for CS2 */}
                              <View style={styles.gameActions}>
                                <TouchableOpacity
                                  style={[styles.actionButton, { backgroundColor: colors.primary }]}
                                  onPress={() => openRoundsModal(index)}
                                >
                                  <Text style={styles.actionButtonText}>Rounds</Text>
                                </TouchableOpacity>
                              </View>
                            </>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : (
                <View style={styles.noMapsContainer}>
                  <Text style={[styles.noMapsText, { color: theme.textSecondary }]}>
                    No map data available
                  </Text>
                </View>
              )}
            </View>

            {/* Maps Section */}
            {series.pickban && series.pickban.length > 0 && (
              <View style={styles.mapsSection}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Maps
                </Text>
                
                <View style={styles.mapsGrid}>
                  {series.pickban.map((pickban, index) => {
                    const mapName = pickban.mapName;
                    const isPick = pickban.type === 'pick';
                    const isBan = pickban.type === 'ban';
                    const isLeftover = pickban.isLeftover;
                    
                    // Get team info - ensure type comparison works correctly
                    const team = (pickban.teamId == series.team1?.id) ? series.team1 : series.team2;
                    const teamName = team?.shortName || 'Unknown';
                    
                    // Determine display text
                    let displayText;
                    if (isLeftover) {
                      displayText = 'Decider';
                    } else {
                      displayText = `${teamName} - ${isPick ? 'PICK' : 'BAN'}`;
                    }
                    
                    return (
                      <View
                        key={index}
                        style={[
                          styles.mapCard,
                          { backgroundColor: theme.surface },
                          isBan && !isLeftover && { opacity: 0.6 }
                        ]}
                      >
                        <Image
                          source={{ uri: getCS2MapImageUrl(pickban.mapSlug) }}
                          style={styles.mapImage}
                          resizeMode="cover"
                        />
                        
                        {/* Ban overlay - only on the image */}
                        {isBan && !isLeftover && (
                          <View style={styles.mapBanImageOverlay}>
                            <Ionicons
                              name="close"
                              size={40}
                              color="rgba(255, 255, 255, 0.9)"
                              style={styles.banIcon}
                            />
                          </View>
                        )}
                        
                        <View style={styles.mapCardOverlay}>
                          <Text style={[styles.mapCardName, { color: 'white' }]}>
                            {mapName}
                          </Text>
                          
                          <View style={[
                            styles.mapTypeBadge,
                            { 
                              backgroundColor: isLeftover 
                                ? theme.warning 
                                : isPick 
                                  ? theme.success 
                                  : theme.error 
                            }
                          ]}>
                            <Text style={[styles.mapTypeText, { color: 'white' }]}>
                              {displayText}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}

        {activeTab === 'stats' && (
          <View style={styles.contentContainer}>
            {/* Head-to-Head Record Section */}
            <View style={styles.headToHeadSection}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Head-to-Head Record
              </Text>
              
              {/* H2H Record Card */}
              {renderHeadToHeadCard()}
              
              {/* Recent Matches */}
              <Text style={[styles.recentMatchesTitle, { color: theme.text }]}>
                Recent Matches
              </Text>
              
              {renderRecentMatches()}
            </View>
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Rounds Modal - EXACT VAL Style */}
      <Modal
        visible={showRoundsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRoundsModal(false)}
      >
        <View style={styles.halfModalContainer}>
          <TouchableOpacity 
            style={styles.modalBackgroundOverlay}
            activeOpacity={1}
            onPress={() => setShowRoundsModal(false)}
          />
          <View 
            style={[styles.modalContent, { backgroundColor: theme.background }]}
          >
            {selectedGameIndex !== null && series.maps && series.maps[selectedGameIndex] ? (() => {
              const game = series.maps[selectedGameIndex];
              const attackDefenseStats = calculateCS2AttackDefenseStats(selectedGameIndex);
              const roundsByHalves = organizeCS2RoundsByHalves(selectedGameIndex);
              const mapName = getMapDisplayName(game.name);
              
              return (
                <View style={styles.roundsModalContainer}>
                  {/* Fixed Header with Map Background */}
                  <View style={styles.roundsFloatingHeader}>
                    <Image
                      source={{ uri: getCS2MapImageUrl(game.name?.replace('de_', '') || game.displayName?.toLowerCase()) }}
                      style={styles.roundsMapBackground}
                      resizeMode="cover"
                    />
                    <View style={styles.roundsMapOverlay} />
                    
                    {/* Team Info and Stats */}
                    <View style={styles.roundsTeamStatsContainer}>
                      {/* Team 1 */}
                      <View style={styles.roundsTeamSection}>
                        <Image
                          source={{ uri: series.team1?.logoUrl }}
                          style={styles.roundsTeamLogo}
                          resizeMode="contain"
                        />
                        <Text style={styles.roundsTeamName}>{series.team1?.shortName || series.team1?.name}</Text>
                        <View style={styles.roundsAttackDefenseStats}>
                          <View style={styles.roundsStatItem}>
                            <FontAwesome6 name="gun" size={12} color="white" />
                            <Text style={styles.roundsStatText}>{attackDefenseStats.team1.attack}</Text>
                          </View>
                          <View style={styles.roundsStatItem}>
                            <FontAwesome6 name="shield-halved" size={12} color="white" />
                            <Text style={styles.roundsStatText}>{attackDefenseStats.team1.defense}</Text>
                          </View>
                        </View>
                      </View>
                      
                      {/* Map Name and Score */}
                      <View style={styles.roundsMapScoreSection}>
                        <Text style={styles.roundsMapName}>{mapName}</Text>
                        <Text style={styles.roundsFinalScore}>
                          {game.team1Score} - {game.team2Score}
                        </Text>
                      </View>
                      
                      {/* Team 2 */}
                      <View style={styles.roundsTeamSection}>
                        <Image
                          source={{ uri: series.team2?.logoUrl }}
                          style={styles.roundsTeamLogo}
                          resizeMode="contain"
                        />
                        <Text style={styles.roundsTeamName}>{series.team2?.shortName || series.team2?.name}</Text>
                        <View style={styles.roundsAttackDefenseStats}>
                          <View style={styles.roundsStatItem}>
                            <FontAwesome6 name="gun" size={12} color="white" />
                            <Text style={styles.roundsStatText}>{attackDefenseStats.team2.attack}</Text>
                          </View>
                          <View style={styles.roundsStatItem}>
                            <FontAwesome6 name="shield-halved" size={12} color="white" />
                            <Text style={styles.roundsStatText}>{attackDefenseStats.team2.defense}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                  
                  {/* Scrollable Rounds Content */}
                  <ScrollView style={styles.roundsScrollableContent} showsVerticalScrollIndicator={false}>
                    {/* First Half */}
                    {roundsByHalves.firstHalf.length > 0 && (
                      <View style={styles.roundsHalfSection}>
                        <Text style={[styles.roundsHalfTitle, { color: theme.text }]}>1st Half</Text>
                        <View style={styles.liquipediaRoundsContainer}>
                          {/* Team Logos - Properly Aligned */}
                          <View style={styles.fixedTeamLogosStack}>
                            <View style={styles.roundNumberSpace} />
                            <View style={styles.teamLogoAligned}>
                              <Image
                                source={{ uri: series.team1?.logoUrl }}
                                style={styles.roundsRowTeamLogo}
                                resizeMode="contain"
                              />
                            </View>
                            <View style={styles.teamLogoAligned}>
                              <Image
                                source={{ uri: series.team2?.logoUrl }}
                                style={styles.roundsRowTeamLogo}
                                resizeMode="contain"
                              />
                            </View>
                          </View>
                          
                          {/* Scrollable Rounds Section */}
                          <ScrollView 
                            horizontal 
                            style={styles.roundsHorizontalScroll}
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.roundsHorizontalContent}
                          >
                            {roundsByHalves.firstHalf.map((round, index) => (
                              <View key={round.id} style={styles.liquipediaRoundColumn}>
                                <Text style={[styles.roundCardNumber, { color: theme.text }]}>{round.number}</Text>
                                
                                {/* Team 1 Round (Top) */}
                                <View style={[
                                  styles.liquipediaRoundIndicator,
                                  { 
                                    backgroundColor: round.winningTeamNumber === 1 
                                      ? (round.attackingTeamNumber === 1 ? theme.error : theme.success)
                                      : 'rgba(255,255,255,0.1)',
                                  }
                                ]}>
                                  {round.winningTeamNumber === 1 && (
                                    <View style={styles.roundWinIcons}>
                                      <FontAwesome6 
                                        name={getCS2EndReasonIcon(round.winCondition)} 
                                        size={13} 
                                        color="white" 
                                        style={{ marginLeft: 2 }}
                                      />
                                    </View>
                                  )}
                                </View>
                                
                                {/* Team 2 Round (Bottom) */}
                                <View style={[
                                  styles.liquipediaRoundIndicator,
                                  { 
                                    backgroundColor: round.winningTeamNumber === 2 
                                      ? (round.attackingTeamNumber === 2 ? theme.error : theme.success)
                                      : 'rgba(255,255,255,0.1)',
                                  }
                                ]}>
                                  {round.winningTeamNumber === 2 && (
                                    <View style={styles.roundWinIcons}>
                                      <FontAwesome6 
                                        name={getCS2EndReasonIcon(round.winCondition)} 
                                        size={13} 
                                        color="white"
                                      />
                                    </View>
                                  )}
                                </View>
                              </View>
                            ))}
                          </ScrollView>
                        </View>
                      </View>
                    )}

                    {/* Second Half */}
                    {roundsByHalves.secondHalf.length > 0 && (
                      <View style={styles.roundsHalfSection}>
                        <Text style={[styles.roundsHalfTitle, { color: theme.text }]}>2nd Half</Text>
                        <View style={styles.liquipediaRoundsContainer}>
                          {/* Team Logos - Properly Aligned */}
                          <View style={styles.fixedTeamLogosStack}>
                            <View style={styles.roundNumberSpace} />
                            <View style={styles.teamLogoAligned}>
                              <Image
                                source={{ uri: series.team1?.logoUrl }}
                                style={styles.roundsRowTeamLogo}
                                resizeMode="contain"
                              />
                            </View>
                            <View style={styles.teamLogoAligned}>
                              <Image
                                source={{ uri: series.team2?.logoUrl }}
                                style={styles.roundsRowTeamLogo}
                                resizeMode="contain"
                              />
                            </View>
                          </View>
                          
                          {/* Scrollable Rounds Section */}
                          <ScrollView 
                            horizontal 
                            style={styles.roundsHorizontalScroll}
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.roundsHorizontalContent}
                          >
                            {roundsByHalves.secondHalf.map((round, index) => (
                              <View key={round.id} style={styles.liquipediaRoundColumn}>
                                <Text style={[styles.roundCardNumber, { color: theme.text }]}>{round.number}</Text>
                                
                                {/* Team 1 Round (Top) */}
                                <View style={[
                                  styles.liquipediaRoundIndicator,
                                  { 
                                    backgroundColor: round.winningTeamNumber === 1 
                                      ? (round.attackingTeamNumber === 1 ? theme.error : theme.success)
                                      : 'rgba(255,255,255,0.1)',
                                  }
                                ]}>
                                  {round.winningTeamNumber === 1 && (
                                    <View style={styles.roundWinIcons}>
                                      <FontAwesome6 
                                        name={getCS2EndReasonIcon(round.winCondition)} 
                                        size={13} 
                                        color="white"
                                      />
                                    </View>
                                  )}
                                </View>
                                
                                {/* Team 2 Round (Bottom) */}
                                <View style={[
                                  styles.liquipediaRoundIndicator,
                                  { 
                                    backgroundColor: round.winningTeamNumber === 2 
                                      ? (round.attackingTeamNumber === 2 ? theme.error : theme.success)
                                      : 'rgba(255,255,255,0.1)',
                                  }
                                ]}>
                                  {round.winningTeamNumber === 2 && (
                                    <View style={styles.roundWinIcons}>
                                      <FontAwesome6 
                                        name={getCS2EndReasonIcon(round.winCondition)} 
                                        size={13} 
                                        color="white"
                                      />
                                    </View>
                                  )}
                                </View>
                              </View>
                            ))}
                          </ScrollView>
                        </View>
                      </View>
                    )}
                  </ScrollView>
                </View>
              );
            })() : (
              <View style={styles.comingSoonContainer}>
                <Ionicons name="construct" size={48} color={theme.textTertiary} />
                <Text style={[styles.comingSoonText, { color: theme.textSecondary }]}>
                  Loading round details...
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
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
  scrollView: {
    flex: 1,
  },
  // Series Header Styles - EXACT VAL floating header style
  seriesHeader: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 15,
    marginBottom: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  eventName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  matchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -40,
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
    width: 64,
    height: 64,
    marginHorizontal: 18,
  },
  scoreText: {
    fontSize: 32,
    fontWeight: 'bold',
    minWidth: 40,
    textAlign: 'center',
  },
  teamName: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  scoreSeparator: {
    fontSize: 24,
    marginHorizontal: 16,
    alignSelf: 'flex-start',
    marginTop: 16,
  },
  statusDateContainer: {
    alignItems: 'center',
    marginTop: 50,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  dateText: {
    fontSize: 14,
    textAlign: 'center',
  },
  // Tab Navigation Styles - EXACT VAL style
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
  // Content Styles - EXACT VAL style
  contentContainer: {
    paddingHorizontal: 16,
  },
  gameDetailsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  gameScrollView: {
    marginHorizontal: -16,
  },
  gameScrollContent: {
    paddingHorizontal: 16,
  },
  // Game Card Styles - EXACT VAL style
  gameCard: {
    width: 340,
    borderRadius: 12,
    marginHorizontal: 4,
    overflow: 'hidden',
  },
  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  gameTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  gameStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  gameStatusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  mapScoreSection: {
    position: 'relative',
    height: 120,
  },
  mapBackground: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  mapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
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
    flex: 1,
  },
  teamLogo: {
    width: 32,
    height: 32,
    marginBottom: 8,
  },
  gameScoreText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  mapNameContainer: {
    flex: 2,
    alignItems: 'center',
  },
  mapName: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  playersSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  teamsContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  leftTeamContainer: {
    flex: 1,
    paddingRight: 8,
  },
  rightTeamContainer: {
    flex: 1,
    paddingLeft: 8,
  },
  teamLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
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
    marginBottom: 6,
    width: '100%',
  },
  rightPlayerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    width: '100%',
    justifyContent: 'flex-end',
  },
  playerImage: {
    width: 30,
    height: 30,
    borderRadius: 12,
    marginHorizontal: 6,
  },
  playerInfo: {
    flex: 1,
  },
  playerInfoRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  playerName: {
    fontSize: 12,
    fontWeight: '500',
  },
  gameActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  noMapsContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noMapsText: {
    fontSize: 16,
    textAlign: 'center',
  },
  comingSoonText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 32,
  },
  bottomPadding: {
    height: 32,
  },
  // Maps Section Styles - EXACT VAL style
  mapsSection: {
    marginBottom: 24,
  },
  mapsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  mapCard: {
    width: '48%',
    height: 120,
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  mapCardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.76)',
    padding: 8,
  },
  mapCardName: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  mapTypeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  mapTypeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  mapBanImageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 60,
    backgroundColor: 'rgba(255, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  banIcon: {
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  // Modal Styles - EXACT VAL style
  halfModalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0)',
  },
  modalBackgroundOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    height: '65%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  // Rounds Modal Styles
  roundsModalContainer: {
    flex: 1,
  },
  roundsFloatingHeader: {
    height: 120,
    position: 'relative',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  roundsMapBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  roundsMapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  roundsCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 3,
  },
  roundsTeamStatsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    zIndex: 2,
  },
  roundsTeamSection: {
    alignItems: 'center',
    flex: 1,
  },
  roundsTeamLogo: {
    width: 32,
    height: 32,
    marginBottom: 4,
  },
  roundsTeamName: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  roundsAttackDefenseStats: {
    flexDirection: 'row',
    gap: 8,
  },
  roundsStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roundsStatText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  roundsMapScoreSection: {
    alignItems: 'center',
    flex: 2,
  },
  roundsMapName: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  roundsFinalScore: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  roundsScrollableContent: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  roundsHalfSection: {
    marginBottom: 24,
  },
  roundsHalfTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    marginTop: 8,
    paddingHorizontal: 16,
    textAlign: 'center',
  },
  liquipediaRoundsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  fixedTeamLogosStack: {
    width: 40,
    marginRight: 8,
  },
  roundNumberSpace: {
    height: 24,
    marginBottom: 4,
  },
  teamLogoAligned: {
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  roundsRowTeamLogo: {
    width: 20,
    height: 20,
  },
  roundsHorizontalScroll: {
    flex: 1,
  },
  roundsHorizontalContent: {
    paddingRight: 16,
  },
  liquipediaRoundColumn: {
    alignItems: 'center',
    marginRight: 4,
    width: 32,
  },
  roundCardNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
    height: 20,
  },
  liquipediaRoundIndicator: {
    width: 28,
    height: 28,
    borderRadius: 4,
    marginBottom: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roundWinIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  // Head-to-Head Styles - EXACT VAL style
  headToHeadSection: {
    marginBottom: 24,
  },
  h2hCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 24,
  },
  h2hTeamSection: {
    alignItems: 'center',
    flex: 1,
  },
  h2hTeamLogo: {
    width: 48,
    height: 48,
    marginBottom: 8,
  },
  h2hTeamName: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  h2hScoreSection: {
    alignItems: 'center',
    flex: 1,
  },
  h2hScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  h2hScore: {
    fontSize: 32,
    fontWeight: 'bold',
    minWidth: 40,
    textAlign: 'center',
  },
  h2hScoreSeparator: {
    fontSize: 24,
    marginHorizontal: 12,
  },
  h2hMatchCount: {
    fontSize: 14,
    textAlign: 'center',
  },
  recentMatchesTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  recentMatchesList: {
    gap: 12,
  },
  recentMatchCard: {
    padding: 16,
    borderRadius: 12,
  },
  recentMatchTournament: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  recentMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  recentMatchTeam: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  recentMatchTeamLogo: {
    width: 24,
    height: 24,
    marginHorizontal: 8,
  },
  recentMatchTeamName: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  recentMatchScore: {
    minWidth: 60,
    alignItems: 'center',
  },
  recentMatchScoreText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  recentMatchDate: {
    fontSize: 12,
    textAlign: 'center',
  },
  noDataContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noDataText: {
    fontSize: 16,
    textAlign: 'center',
  },
});

export default CS2ResultsScreen;