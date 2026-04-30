import React, { useEffect, useState, useRef } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  ActivityIndicator, 
  Image, 
  TouchableOpacity, 
  StyleSheet, 
  Animated,
  SafeAreaView,
  Dimensions
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { getCS2MapImageUrl, getMapDisplayName } from '../../../services/cs2MatchService';

const { width: screenWidth } = Dimensions.get('window');

const TeamLogo = ({ logoUrl, size, style, iconStyle, resizeMode = 'cover' }) => {
  const { colors } = useTheme();
  const [imageError, setImageError] = useState(false);
  
  if (!logoUrl || imageError) {
    return (
      <Ionicons 
        name="shield" 
        size={size} 
        color={colors.primary} 
        style={iconStyle}
      />
    );
  }
  
  return (
    <Image
      source={{ 
        uri: logoUrl,
        cache: 'force-cache'
      }}
      style={[style, { resizeMode }]}
      onError={() => setImageError(true)}
    />
  );
};

const PlayerImage = ({ imageUrl, size, style, iconStyle, isFromBo3 = false }) => {
  const { colors } = useTheme();
  const [imageError, setImageError] = useState(false);
  
  if (!imageUrl || imageError) {
    return (
      <Ionicons 
        name="person" 
        size={size} 
        color={colors.primary} 
        style={iconStyle}
      />
    );
  }
  
  // For bo3.gg images, we need to crop to show only the top square portion
  if (isFromBo3) {
    return (
      <View style={[style, { overflow: 'hidden' }]}>
        <Image
          source={{ 
            uri: imageUrl,
            cache: 'force-cache'
          }}
          style={{
            width: size * 1.2,
            height: size * 1.8,
            resizeMode: 'cover',
            position: 'absolute',
            top: 0,
            left: -(size * 0.1),
          }}
          onError={() => setImageError(true)}
        />
      </View>
    );
  }
  
  return (
    <Image
      source={{ 
        uri: imageUrl,
        cache: 'force-cache'
      }}
      style={style}
      onError={() => setImageError(true)}
    />
  );
};

const CS2TeamPageScreen = ({ route }) => {
  const { teamId, teamSlug, teamName } = route.params;
  const { theme, colors } = useTheme();
  const navigation = useNavigation();
  const scrollY = useRef(new Animated.Value(0)).current;
  
  // Tab states - match VAL exactly
  const [activeTab, setActiveTab] = useState('Matches');
  const [loading, setLoading] = useState(true);
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  
  // Data states
  const [teamData, setTeamData] = useState(null);
  const [matchesData, setMatchesData] = useState([]);
  const [transfersData, setTransfersData] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [mapStatsData, setMapStatsData] = useState([]);
  const [loadingStats, setLoadingStats] = useState(false);
  
  // Match section states
  const [currentMatches, setCurrentMatches] = useState([]);
  const [lastMatches, setLastMatches] = useState([]);
  const [nextMatches, setNextMatches] = useState([]);
  const [lastMatchesCollapsed, setLastMatchesCollapsed] = useState(true);
  const [nextMatchesCollapsed, setNextMatchesCollapsed] = useState(true);
  
  // Fetch control flags
  const [transactionsFetched, setTransactionsFetched] = useState(false);
  const [statsFetched, setStatsFetched] = useState(false);

  const currentYear = new Date().getFullYear();

  // Animated values for sticky header - match VAL exactly
  const stickyHeaderOpacity = scrollY.interpolate({
    inputRange: [100, 150],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const stickyHeaderTranslateY = scrollY.interpolate({
    inputRange: [100, 150],
    outputRange: [-50, 0],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    // Reset fetched flags when teamId changes (new team page) - match VAL exactly
    setTransactionsFetched(false);
    setStatsFetched(false);
    setTransfersData([]);
    setMapStatsData([]);
    fetchTeamData();
  }, [teamId, teamSlug]);

  useEffect(() => {
    if (activeTab === 'Players' && !transactionsFetched && teamData) {
      fetchTransactionHistory();
    } else if (activeTab === 'Stats' && !statsFetched && teamData) {
      fetchMapStats();
    }
  }, [activeTab, teamData, transactionsFetched, statsFetched]);

  // Categorize matches when matchesData changes
  useEffect(() => {
    if (matchesData.length > 0) {
      categorizeMatches();
    } else {
      // Clear matches when no data
      setCurrentMatches([]);
      setLastMatches([]);
      setNextMatches([]);
    }
  }, [matchesData]);

  const fetchTeamData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`https://api.bo3.gg/api/v1/teams/${teamSlug}?with=players`);
      const data = await response.json();
      setTeamData(data);
    } catch (error) {
      console.error('Error fetching team data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactionHistory = async () => {
    if (!teamData?.name || loadingTransactions) return;
    
    try {
      setLoadingTransactions(true);
      const response = await fetch(`https://api.bo3.gg/api/v1/player_transfers?join=teams_deep&page[offset]=0&page[limit]=25&sort=-action_date&filter[team_to.id,team_from.id][or]=${teamId},${teamId}&with=teams,player`);
      const data = await response.json();
      setTransfersData(data?.results || []);
    } catch (error) {
      console.error('Error fetching transfers:', error);
      setTransfersData([]);
    } finally {
      setLoadingTransactions(false);
      setTransactionsFetched(true);
    }
  };

  const fetchMapStats = async () => {
    if (!teamData?.name || loadingStats) return;
    
    try {
      setLoadingStats(true);
      const response = await fetch(`https://api.bo3.gg/api/v1/teams/${teamSlug}/map_pool?filter[begin_at_from]=${currentYear}-01-01`);
      const data = await response.json();
      // Only include maps with maps_count greater than 0
      const validMaps = data.filter(map => map.maps_count > 0);
      setMapStatsData(validMaps);
    } catch (error) {
      console.error('Error fetching map stats:', error);
      setMapStatsData([]);
    } finally {
      setLoadingStats(false);
      setStatsFetched(true);
    }
  };

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { 
      useNativeDriver: false,
      listener: (event) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        setShowStickyHeader(offsetY > 100);
      }
    }
  );

  // Categorize matches into current, last, and next
  const categorizeMatches = () => {
    console.log('=== categorizeMatches DEBUG ===');
    console.log('matchesData available:', !!matchesData);
    console.log('matchesData length:', matchesData?.length || 0);
    
    if (!matchesData || matchesData.length === 0) {
      console.log('No matchesData available');
      setCurrentMatches([]);
      setLastMatches([]);
      setNextMatches([]);
      return;
    }

    const now = new Date();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31);
    
    console.log('Filtering matches between:', startOfYear, 'and', endOfYear);
    
    const filteredMatches = matchesData.filter(match => {
      const matchDate = new Date(match.start_date);
      return matchDate >= startOfYear && matchDate <= endOfYear;
    });
    
    console.log('Filtered matches count:', filteredMatches.length);
    
    // Categorize matches
    const current = [];
    const last = [];
    const next = [];
    
    filteredMatches.forEach(match => {
      const matchDate = new Date(match.start_date);
      const status = match.status?.toLowerCase();
      
      // Current: Live or starting today
      if (status === 'current' || status === 'live' || 
          (matchDate.toDateString() === now.toDateString() && 
           (status === 'upcoming' || status === 'scheduled'))) {
        current.push(match);
      }
      // Last: Finished matches
      else if (status === 'finished' || status === 'defwin' || matchDate < now) {
        last.push(match);
      }
      // Next: Upcoming matches
      else if (status === 'upcoming' || status === 'scheduled' || matchDate > now) {
        next.push(match);
      }
    });
    
    // Sort matches
    const sortedCurrent = current.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    const sortedLast = last.sort((a, b) => new Date(b.start_date) - new Date(a.start_date)); // Most recent first
    const sortedNext = next.sort((a, b) => new Date(a.start_date) - new Date(b.start_date)); // Earliest first
    
    console.log('Categorized matches - Current:', sortedCurrent.length, 'Last:', sortedLast.length, 'Next:', sortedNext.length);
    
    setCurrentMatches(sortedCurrent);
    setLastMatches(sortedLast);
    setNextMatches(sortedNext);
  };

  const renderHeader = () => {
    const getCountryAndRank = () => {
      const country = teamData?.country?.name || teamData?.country?.code || 'Unknown';
      const rank = teamData?.rank ? `#${teamData.rank}` : null;
      
      if (rank) {
        return `${country} • Rank ${rank}`;
      }
      return country;
    };

    const getAlternativeNames = () => {
      if (teamData?.alternative_names && teamData.alternative_names.length > 0) {
        return `Also known as: ${teamData.alternative_names.map(alt => alt.name).join(', ')}`;
      }
      return null;
    };

    return (
      <View style={[styles.header, { backgroundColor: theme.surfaceSecondary }]}>
        <View style={styles.headerContent}>
          <TeamLogo
            logoUrl={teamData?.image_url}
            size={80}
            style={[styles.headerLogo, { backgroundColor: theme.background }]}
            iconStyle={styles.headerLogo}
          />
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>{teamData?.name || teamName}</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              {getCountryAndRank()}
            </Text>
            {getAlternativeNames() && (
              <Text style={[styles.headerDescription, { color: theme.textSecondary }]} numberOfLines={2}>
                {getAlternativeNames()}
              </Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderTabBar = () => (
    <View style={[styles.tabBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      {['Matches', 'Players', 'Stats'].map((tab) => (
        <TouchableOpacity
          key={tab}
          style={[
            styles.tab,
            activeTab === tab && { borderBottomColor: colors.primary }
          ]}
          onPress={() => setActiveTab(tab)}
        >
          <Text
            style={[
              styles.tabText,
              {
                color: activeTab === tab ? colors.primary : theme.textSecondary,
                fontWeight: activeTab === tab ? '600' : '400',
              }
            ]}
          >
            {tab}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const MatchSection = ({ title, matches }) => {
    const [expanded, setExpanded] = useState(false);
    const displayMatches = expanded ? matches : matches.slice(0, 3);

    return (
      <View style={[styles.matchSection, { backgroundColor: theme.surface }]}>
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => setExpanded(!expanded)}
        >
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={theme.textSecondary}
          />
        </TouchableOpacity>

        {displayMatches.map((match, index) => (
          <TouchableOpacity
            key={match.id}
            style={[styles.matchCard, { backgroundColor: theme.background }]}
            onPress={() => {
              navigation.navigate('CS2Results', {
                matchId: match.id,
                matchData: match
              });
            }}
          >
            <View style={styles.matchTeams}>
              <View style={styles.matchTeam}>
                <TeamLogo
                  logoUrl={match.team1?.image_url}
                  size={24}
                  style={styles.matchTeamLogo}
                  iconStyle={styles.matchTeamLogo}
                  resizeMode="contain"
                />
                <Text style={[styles.matchTeamName, { color: theme.text }]}>
                  {match.team1?.short_name || match.team1?.name}
                </Text>
              </View>
              <View style={styles.matchVs}>
                <Text style={[styles.matchScore, { color: theme.textSecondary }]}>
                  {match.team1_score} - {match.team2_score}
                </Text>
              </View>
              <View style={styles.matchTeam}>
                <Text style={[styles.matchTeamName, { color: theme.text }]}>
                  {match.team2?.short_name || match.team2?.name}
                </Text>
                <TeamLogo
                  logoUrl={match.team2?.image_url}
                  size={24}
                  style={styles.matchTeamLogo}
                  iconStyle={styles.matchTeamLogo}
                  resizeMode="contain"
                />
              </View>
            </View>
            <Text style={[styles.matchDate, { color: theme.textSecondary }]}>
              {new Date(match.start_date).toLocaleDateString()}
            </Text>
          </TouchableOpacity>
        ))}

        {matches.length > 3 && (
          <TouchableOpacity
            style={styles.expandButton}
            onPress={() => setExpanded(!expanded)}
          >
            <Text style={[styles.expandButtonText, { color: colors.primary }]}>
              {expanded ? 'Show Less' : `Show All (${matches.length})`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderMatchCard = (match, index) => {
    const matchDate = new Date(match.start_date);
    const formattedDate = matchDate.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });

    const status = match.status?.toLowerCase() || 'unknown';

    // Determine which team is our team and which is opponent
    const isTeam1 = match.team1_id === teamData?.id;
    const ourTeam = {
      id: teamData?.id,
      name: teamData?.name || teamName,
      logo: teamData?.image_url,
      score: isTeam1 ? match.team1_score : match.team2_score,
      winner: match.winner_team_id === teamData?.id
    };
    const opponentTeam = {
      id: isTeam1 ? match.team2_id : match.team1_id,
      name: isTeam1 ? match.team2?.name : match.team1?.name,
      logo: isTeam1 ? match.team2?.image_url : match.team1?.image_url,
      score: isTeam1 ? match.team2_score : match.team1_score,
      winner: match.winner_team_id && match.winner_team_id !== teamData?.id
    };

    // Determine if our team won
    const ourTeamWon = ourTeam.score > opponentTeam.score;

    const scoreAvailable = status === 'finished';

    const handleMatchPress = () => {
      console.log('=== MATCH PRESS DEBUG ===');
      console.log('Match ID:', match.id);
      console.log('Match data:', match);
      console.log('Team1 ID:', match.team1_id);
      console.log('Team2 ID:', match.team2_id);
      console.log('Match slug:', match.slug);
      
      navigation.navigate('CS2Results', {
        matchId: match.id,
        matchData: match
      });
    };

    return (
      <TouchableOpacity 
        key={`${match.id}-${index}`} 
        style={[styles.matchCard, { backgroundColor: theme.surface }]}
        onPress={handleMatchPress}
        activeOpacity={0.7}
      >
        {/* Event Banner */}
        <View style={[styles.eventBanner, { backgroundColor: colors.primary }]}>
          <Text style={styles.eventName}>{match.tournament?.name || 'Tournament'}</Text>
        </View>
        
        {/* Match Content */}
        <View style={styles.matchContent}>
          {/* Our Team Section */}
          <View style={styles.teamSection}>
            <TeamLogo
              logoUrl={ourTeam.logo}
              size={32}
              style={[styles.matchTeamLogo, { opacity: scoreAvailable ? ourTeamWon ? 1 : 0.5 : 1, backgroundColor: theme.background }]}
              iconStyle={styles.matchTeamLogo}
            />
            <Text style={[styles.teamName, { color: theme.text }]} numberOfLines={1}>
              {ourTeam.name}
            </Text>
          </View>

          {/* Score Section */}
          <View style={styles.scoreSection}>
            <View style={styles.scoreContainer}>
              {ourTeam.score === 0 && opponentTeam.score === 0 ? (
                <Text style={[styles.versus, { color: theme.textSecondary }]}>vs</Text>
              ) : (
                <>
                  <Text style={[
                    styles.score, 
                    { 
                      color: scoreAvailable ? ourTeamWon ? colors.primary : theme.textSecondary : colors.primary,
                      fontWeight: scoreAvailable ? ourTeamWon ? 'bold' : '600' : 'bold'
                    }
                  ]}>
                    {ourTeam.score}
                  </Text>
                  <Text style={[styles.scoreSeparator, { color: theme.textSecondary }]}>-</Text>
                  <Text style={[
                    styles.score, 
                    { 
                      color: scoreAvailable ? !ourTeamWon ? colors.primary : theme.textSecondary : colors.primary,
                      fontWeight: scoreAvailable ? !ourTeamWon ? 'bold' : '600' : 'bold'
                    }
                  ]}>
                    {opponentTeam.score}
                  </Text>
                </>
              )}
            </View>
          </View>

          {/* Opponent Team Section */}
          <View style={[styles.teamSection, styles.teamSectionRight]}>
            <TeamLogo
              logoUrl={opponentTeam.logo}
              size={32}
              style={[styles.matchTeamLogo, { opacity: scoreAvailable ? !ourTeamWon ? 1 : 0.5 : 1, backgroundColor: theme.background }]}
              iconStyle={styles.matchTeamLogo}
            />
            <Text style={[styles.teamName, styles.teamNameRight, { color: theme.text }]} numberOfLines={1}>
              {opponentTeam.name}
            </Text>
          </View>
        </View>

        {/* Match Footer */}
        <View style={styles.matchFooter}>
          <Text style={[styles.matchDate, { color: theme.textSecondary }]}>{formattedDate}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderMatchSection = (title, matches, isCollapsed, setCollapsed) => (
    <View style={styles.matchSection}>
      <TouchableOpacity 
        style={styles.sectionHeader}
        onPress={() => setCollapsed(!isCollapsed)}
      >
        <Text style={[styles.gameSectionTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.collapseArrow, { color: theme.text }]}>
          {isCollapsed ? '▶' : '▼'}
        </Text>
      </TouchableOpacity>
      
      {matches.length > 0 ? (
        <View>
          {(isCollapsed ? matches.slice(0, 1) : matches).map((match, index) => (
            <View key={`${title}-${match.id}-${index}`}>
              {renderMatchCard(match, index)}
            </View>
          ))}
        </View>
      ) : (
        <View style={[styles.gameSectionCard, { backgroundColor: theme.surface }]}>
          <Text style={[styles.noGameText, { color: theme.textSecondary }]}>
            No {title.toLowerCase()} found
          </Text>
        </View>
      )}
    </View>
  );

  const renderMatchesContent = () => {
    console.log('=== CS2 MATCHES DEBUG ===');
    console.log('Current matches:', currentMatches.length);
    console.log('Last matches:', lastMatches.length);  
    console.log('Next matches:', nextMatches.length);

    return (
      <ScrollView style={styles.tabContent}>
        {/* Current Matches */}
        {currentMatches.length > 0 && (
          <View style={styles.matchSection}>
            <Text style={[styles.gameSectionTitle, { color: theme.text }]}>Current Matches</Text>
            {currentMatches.map((match, index) => (
              <View key={`current-${match.id}-${index}`}>
                {renderMatchCard(match, index)}
              </View>
            ))}
          </View>
        )}
        
        {/* Last Matches */}
        {renderMatchSection('Last Matches', lastMatches, lastMatchesCollapsed, setLastMatchesCollapsed)}
        
        {/* Next Matches */}
        {renderMatchSection('Next Matches', nextMatches, nextMatchesCollapsed, setNextMatchesCollapsed)}
      </ScrollView>
    );
  };

  const renderSectionHeader = (title) => (
    <Text style={[styles.sectionHeader, { color: theme.text }]}>{title}</Text>
  );

  const formatRole = (role) => {
    if (!role) return 'Player';
    return role.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const formatTransactionDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getActionTypeColor = (actionType) => {
    switch (actionType) {
      case 1: return colors.primary; // Transfer
      case 2: return '#4CAF50'; // Loan
      case 3: return '#FF9800'; // Release
      default: return theme.textSecondary;
    }
  };

  const renderRosterContent = () => {
    if (!teamData?.players) {
      return (
        <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
          No roster information available
        </Text>
      );
    }

    const players = teamData.players.filter(player => !player.is_coach);
    const coaches = teamData.players.filter(player => player.is_coach);
    const allMembers = [...players, ...coaches];

    return (
      <View style={styles.rosterContent}>
        {allMembers.map((player, index) => (
          <View key={player.id || index} style={[styles.playerCard, { backgroundColor: theme.surface }]}>
            <PlayerImage
              imageUrl={player.image_url}
              size={40}
              style={[styles.playerImage, { backgroundColor: theme.background }]}
              iconStyle={styles.playerImage}
              isFromBo3={true}
            />
            <View style={styles.playerInfo}>
              <Text style={[styles.playerName, { color: theme.text }]}>{player.nickname}</Text>
              <Text style={[styles.playerRole, { color: theme.textSecondary }]}>
                {player.real_name || formatRole(player.is_coach ? 'coach' : 'player')}
              </Text>
            </View>
            <View style={styles.playerStats}>
              <Text style={[styles.playerRoleTag, { color: colors.primary, backgroundColor: `${colors.primary}20` }]}>
                {player.is_coach ? 'COACH' : 'PLAYER'}
              </Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderHistoryContent = () => {
    if (loadingTransactions) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading transfers...</Text>
        </View>
      );
    }

    if (transfersData.length === 0) {
      return (
        <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
          No transfer history available
        </Text>
      );
    }

    return (
      <View style={styles.historyContent}>
        {transfersData.map((transaction, index) => (
          <View key={transaction.id || index} style={[styles.transactionCard, { backgroundColor: theme.surface }]}>
            <PlayerImage
              imageUrl={transaction.player?.image_url}
              size={40}
              style={[styles.playerImage, { backgroundColor: theme.background }]}
              iconStyle={styles.playerImage}
              isFromBo3={true}
            />
            <View style={styles.transactionInfo}>
              <Text style={[styles.playerName, { color: theme.text }]}>{transaction.player_name}</Text>
              <Text style={[styles.transactionDate, { color: theme.textSecondary }]}>
                {formatTransactionDate(transaction.action_date)}
              </Text>
            </View>
            <View style={styles.transferFlow}>
              <View style={styles.teamContainer}>
                {transaction.team_from ? (
                  <>
                    <View style={styles.transferTeamLogoContainer}>
                      <TeamLogo
                        logoUrl={transaction.team_from.image_url}
                        size={32}
                        style={styles.transferTeamLogo}
                        iconStyle={styles.transferTeamLogo}
                        resizeMode="contain"
                      />
                    </View>
                    <Text style={[styles.transferTeamName, { color: theme.text }]} numberOfLines={2}>
                      {transaction.team_from.name}
                    </Text>
                  </>
                ) : (
                  <>
                    <View style={styles.transferTeamLogoContainer}>
                      <Ionicons name="shield" size={32} color={theme.textSecondary} />
                    </View>
                    <Text style={[styles.transferTeamName, { color: theme.textSecondary }]} numberOfLines={2}>
                      Free Agent
                    </Text>
                  </>
                )}
              </View>
              <View style={styles.transferArrowContainer}>
                <Ionicons 
                  name="arrow-forward" 
                  size={20} 
                  color={getActionTypeColor(transaction.action_type)} 
                />
              </View>
              <View style={styles.teamContainer}>
                {transaction.team_to ? (
                  <>
                    <View style={styles.transferTeamLogoContainer}>
                      <TeamLogo
                        logoUrl={transaction.team_to.image_url}
                        size={32}
                        style={styles.transferTeamLogo}
                        iconStyle={styles.transferTeamLogo}
                        resizeMode="contain"
                      />
                    </View>
                    <Text style={[styles.transferTeamName, { color: theme.text }]} numberOfLines={2}>
                      {transaction.team_to.name}
                    </Text>
                  </>
                ) : (
                  <>
                    <View style={styles.transferTeamLogoContainer}>
                      <Ionicons name="shield" size={32} color={theme.textSecondary} />
                    </View>
                    <Text style={[styles.transferTeamName, { color: theme.textSecondary }]} numberOfLines={2}>
                      Free Agent
                    </Text>
                  </>
                )}
              </View>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderPlayersContent = () => (
    <View style={styles.tabContent}>
      <Text style={[styles.sectionHeader, styles.firstSectionHeader, { color: theme.text }]}>Roster</Text>
      {renderRosterContent()}
      {renderSectionHeader('History')}
      {renderHistoryContent()}
    </View>
  );

  const renderMapStatsCard = (mapStat) => {
    const mapName = getMapDisplayName(mapStat.map);
    const losses = mapStat.maps_count - mapStat.win_maps_count;

    return (
      <View key={mapStat.map} style={[styles.mapStatsCard, { backgroundColor: theme.surface }]}>
        {/* Map Background */}
        <Image 
          source={{ 
            uri: getCS2MapImageUrl(mapStat.map?.replace('de_', '') || mapStat.map?.toLowerCase()),
            cache: 'force-cache'
          }}
          style={styles.mapBackground}
        />
        <View style={styles.mapOverlay} />
        
        <View style={styles.mapStatsContent}>
          {/* Map Header */}
          <View style={styles.mapHeader}>
            <Text style={styles.mapName}>{mapName}</Text>
            <Text style={styles.mapWinLoss}>{mapStat.win_maps_count}W {losses}L • {mapStat.rounds_count} Rounds</Text>
          </View>
          
          {/* CS2 Specific Stats Grid */}
          <View style={styles.conditionsGrid}>
            <View style={[styles.conditionCard, { backgroundColor: theme.background + '90' }]}>
              <Text style={[styles.conditionTitle, { color: '#fff' }]}>
                Pick/Ban
              </Text>
              <Text style={[styles.conditionStat, { color: '#ccc' }]}>
                Picked: {mapStat.picked_maps}
              </Text>
              <Text style={[styles.conditionStat, { color: '#ccc' }]}>
                Banned: {mapStat.banned_maps}
              </Text>
              <Text style={[styles.conditionStat, { color: '#ccc' }]}>
                Total Round Wins: {mapStat.total_round_wins}
              </Text>
            </View>
            
            <View style={[styles.conditionCard, { backgroundColor: theme.background + '90' }]}>
              <Text style={[styles.sideStatsLabel, { color: '#ccc' }]}>
                Counter-Terrorist
              </Text>
              <Text style={[styles.sideStatsScore, { color: '#fff' }]}>
                {mapStat.ct_round_wins}W {mapStat.ct_rounds_count - mapStat.ct_round_wins}L
              </Text>
              <Text style={[styles.sideStatsLabel, { color: '#ccc', marginTop: 8 }]}>
                Terrorist
              </Text>
              <Text style={[styles.sideStatsScore, { color: '#fff' }]}>
                {mapStat.t_round_wins}W {mapStat.t_rounds_count - mapStat.t_round_wins}L
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderStatsContent = () => {
    if (loadingStats) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading map stats...</Text>
        </View>
      );
    }

    if (mapStatsData.length === 0) {
      return (
        <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
          No map statistics available
        </Text>
      );
    }

    // Sort maps by number of matches played (most active maps first)
    const sortedMapStats = [...mapStatsData].sort((a, b) => b.maps_count - a.maps_count);

    return (
      <View style={styles.tabContent}>
        <Text style={[styles.sectionHeader, styles.firstSectionHeader, { color: theme.text }]}>
          Map Performance ({currentYear})
        </Text>
        {sortedMapStats.map(mapStat => renderMapStatsCard(mapStat))}
      </View>
    );
  };

  const renderTabContent = () => {
    // Fetch matches on demand when switching to Matches tab
    if (activeTab === 'Matches' && matchesData.length === 0 && teamData) {
      console.log('=== FETCHING MATCHES ===');
      console.log('teamId:', teamId);
      console.log('currentYear:', currentYear);
      
      const url = `https://api.bo3.gg/api/v1/matches?scope=widget-matches&page[offset]=0&page[limit]=100&sort=-start_date&filter[matches.status][in]=finished,defwin,current,upcoming&filter[matches.start_date][lt]=${currentYear}-12-31&filter[matches.start_date][gt]=${currentYear}-01-01&filter[matches.team_ids][overlap]=${teamId}&filter[matches.discipline_id][eq]=1&with=teams,tournament`;
      console.log('Fetch URL:', url);
      
      // Fetch matches data
      fetch(url)
        .then(response => {
          console.log('Matches fetch response status:', response.status);
          return response.json();
        })
        .then(data => {
          console.log('Matches API response:', data);
          console.log('Results count:', data?.results?.length || 0);
          setMatchesData(data?.results || []);
        })
        .catch(error => {
          console.error('Error fetching matches:', error);
        });
    }

    switch (activeTab) {
      case 'Matches':
        return renderMatchesContent();
      case 'Players':
        return renderPlayersContent();
      case 'Stats':
        return renderStatsContent();
      default:
        return <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>Select a tab</Text>;
    }
  };

  const renderStickyHeader = () => (
    <Animated.View
      style={[
        styles.stickyHeader,
        {
          backgroundColor: theme.surfaceSecondary,
          opacity: stickyHeaderOpacity,
          transform: [{ translateY: stickyHeaderTranslateY }],
        }
      ]}
      pointerEvents={showStickyHeader ? 'auto' : 'none'}
    >
      <SafeAreaView style={styles.stickyHeaderSafeArea}>
        <View style={styles.stickyHeaderContent}>
          <View style={styles.stickyHeaderLeft}>
            <TeamLogo
              logoUrl={teamData?.image_url}
              size={32}
              style={[styles.stickyHeaderLogo, { backgroundColor: theme.background }]}
              iconStyle={styles.stickyHeaderLogo}
            />
            <Text style={[styles.stickyHeaderTitle, { color: theme.text }]}>{teamData?.name || teamName}</Text>
          </View>
          <View style={styles.stickyHeaderRight}>
            <Text style={[styles.stickyHeaderRank, { color: theme.textSecondary }]}>Rank #{teamData?.rank}</Text>
          </View>
        </View>
      </SafeAreaView>
    </Animated.View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading Team...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Animated.ScrollView
        style={styles.scrollView}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {renderHeader()}
        {renderTabBar()}
        {renderTabContent()}
      </Animated.ScrollView>
      {renderStickyHeader()}
      
      {/* Floating Back Button */}
      <TouchableOpacity 
        style={[styles.floatingBackButton, { backgroundColor: colors.primary }]}
        onPress={() => navigation.goBack()}
        activeOpacity={0.8}
      >
        <Ionicons name="arrow-back" size={24} color="white" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginRight: 16,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.8,
    marginBottom: 8,
  },
  headerDescription: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.7,
    lineHeight: 16,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  tabContent: {
    padding: 16,
    minHeight: 400,
  },
  placeholderText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  playerImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  playerRole: {
    fontSize: 14,
  },
  playerStats: {
    alignItems: 'flex-end',
  },
  playerRoleTag: {
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    textAlign: 'center',
    minWidth: 60,
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  stickyHeaderSafeArea: {
    paddingTop: 0,
  },
  stickyHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingTop: 25,
  },
  stickyHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stickyHeaderLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
  },
  stickyHeaderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
  },
  stickyHeaderRight: {
    alignItems: 'flex-end',
  },
  stickyHeaderRank: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  // Match card styles
  matchCard: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  eventBanner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  eventName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  matchContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  teamSection: {
    flex: 1,
    alignItems: 'center',
  },
  teamSectionRight: {
    alignItems: 'center',
  },
  matchTeamLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginBottom: 8,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  teamNameRight: {
    textAlign: 'center',
  },
  scoreSection: {
    flex: 0.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontSize: 28,
    fontWeight: '600',
  },
  scoreSeparator: {
    fontSize: 22.5,
    fontWeight: '400',
    marginHorizontal: 12,
  },
  versus: {
    fontSize: 18,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  matchFooter: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  matchDate: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Players tab styles
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  firstSectionHeader: {
    marginTop: 0,
  },
  rosterContent: {
    marginBottom: 0,
  },
  historyContent: {
    marginTop: 0,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  transactionInfo: {
    flex: 1,
    marginRight: 12,
  },
  transactionDate: {
    fontSize: 12,
    marginTop: 2,
  },
  transferFlow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 2,
    paddingVertical: 8,
  },
  teamContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  transferTeamLogoContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  transferTeamLogo: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
  },
  transferTeamName: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 14,
  },
  transferArrowContainer: {
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingBackButton: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  // Map Stats Styles (CS2 specific but styled like VAL)
  mapStatsCard: {
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    height: 200,
    position: 'relative',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  mapBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  mapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.625)',
  },
  mapStatsContent: {
    position: 'relative',
    zIndex: 2,
    padding: 16,
    height: '100%',
    justifyContent: 'space-between',
  },
  mapHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  mapName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
  },
  mapWinLoss: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 2,
  },
  conditionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  conditionCard: {
    width: '48%',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  conditionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  conditionStat: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 1,
  },
  sideStatsLabel: {
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 2,
  },
  sideStatsScore: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 2,
  },
  matchSection: {
    marginBottom: 20,
  },
  gameSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  gameSectionCard: {
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  noGameText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  collapseArrow: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default CS2TeamPageScreen;