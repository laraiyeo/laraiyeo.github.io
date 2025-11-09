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
import { ribApiCall, ValorantService, getTeamEarnings } from '../../../services/valorantService';
import { getMapNameById, getMapSampleUrl } from '../../../services/valorantSeriesService';

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
            width: size * 1.2, // Make image slightly wider to ensure full coverage
            height: size * 1.8, // bo3 images are roughly 2:3 ratio, so use 1.8x height
            resizeMode: 'cover',
            position: 'absolute',
            top: 0,
            left: -(size * 0.1), // Center the image horizontally
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

const VALTeamPageScreen = ({ route }) => {
  const { teamId, teamName } = route.params;
  const { theme, colors } = useTheme();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [teamData, setTeamData] = useState(null);
  const [activeTab, setActiveTab] = useState('Matches');
  const [transactionHistory, setTransactionHistory] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [mapStats, setMapStats] = useState([]);
  const [winConditions, setWinConditions] = useState([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  
  // Flags to track what has been fetched to avoid re-fetching on tab switches
  const [transactionsFetched, setTransactionsFetched] = useState(false);
  const [statsFetched, setStatsFetched] = useState(false);

  // Animated values for sticky header
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
    // Reset fetched flags when teamId changes (new team page)
    setTransactionsFetched(false);
    setStatsFetched(false);
    setTransactionHistory([]);
    setMapStats([]);
    setWinConditions([]);
    fetchTeamData();
  }, [teamId]);

  useEffect(() => {
    if (activeTab === 'Players' && !transactionsFetched && teamData) {
      fetchTransactionHistory();
    } else if (activeTab === 'Stats' && !statsFetched && teamData) {
      fetchTeamStats();
    }
  }, [activeTab, teamData, transactionsFetched, statsFetched]);

  const fetchTeamData = async () => {
    try {
      setLoading(true);
      const data = await ribApiCall(`/teams/${teamId}`);
      setTeamData(data);
    } catch (error) {
      console.error('Error fetching team data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamStats = async () => {
    if (!teamData?.id || loadingStats) return;
    
    try {
      setLoadingStats(true);
      
      const currentYear = new Date().getFullYear();
      const startDate = `${currentYear}-01-01T00:00:00.000Z`;
      
      // Fetch map stats and win conditions in parallel
      const [mapStatsResponse, winConditionsResponse] = await Promise.all([
        ribApiCall(`/x/maps?teamId=${teamData.id}&startDate=${startDate}`),
        ribApiCall(`/x/teams/win-conditions?startDate=${startDate}&teamId=${teamData.id}`)
      ]);
      
      setMapStats(mapStatsResponse || []);
      setWinConditions(winConditionsResponse || []);
      
    } catch (error) {
      console.error('Error fetching team stats:', error);
      setMapStats([]);
      setWinConditions([]);
    } finally {
      setLoadingStats(false);
      setStatsFetched(true);
    }
  };

  const fetchTransactionHistory = async () => {
    if (!teamData?.name || loadingTransactions) return;
    
    try {
      setLoadingTransactions(true);
      
      console.log('=== BO3 TEAM SEARCH DEBUG ===');
      console.log('Searching for team:', teamData.name);
      
      // Use cached team earnings data from the background fetch
      console.log('Checking cached team earnings data...');
      const cacheKey = 'valorant_team_earnings';
      let earningsData = ValorantService.memoryCache?.get(cacheKey);
      
      if (!earningsData) {
        console.log('No cached team earnings data found - trying to fetch it...');
        // Try to get it from the valorant service
        try {
          await getTeamEarnings();
          earningsData = ValorantService.memoryCache?.get(cacheKey);
        } catch (error) {
          console.error('Error fetching team earnings:', error);
        }
      }
      
      if (!earningsData || !earningsData.data) {
        console.log('❌ No team earnings data available - skipping transaction history');
        setTransactionHistory([]);
        return;
      }
      
      console.log('✅ Found cached earnings data with', earningsData.data.length, 'teams');
      
      // Search through the cached data to find the team
      let bo3TeamId = null;
      let foundTeam = null;
      
      // First, let's see what the structure actually looks like
      console.log('Sample team structure:', JSON.stringify(earningsData.data[0], null, 2));
      
      // Search by exact name match first - trying multiple possible structures
      foundTeam = earningsData.data.find(item => {
        const teamName = item.team?.name || item.name || item.team_name;
        return teamName?.toLowerCase() === teamData.name?.toLowerCase();
      });
      
      // If no exact match, try partial matching
      if (!foundTeam) {
        const searchTerm = teamData.name.toLowerCase();
        foundTeam = earningsData.data.find(item => {
          const teamName = item.team?.name || item.name || item.team_name;
          if (!teamName) return false;
          const lowerTeamName = teamName.toLowerCase();
          return lowerTeamName.includes(searchTerm) || searchTerm.includes(lowerTeamName);
        });
      }
      
      if (foundTeam) {
        // Extract team ID from different possible structures
        bo3TeamId = foundTeam.team?.id || foundTeam.team_id || foundTeam.id;
        const teamName = foundTeam.team?.name || foundTeam.name || foundTeam.team_name;
        console.log('✅ Team found in earnings data - ID:', bo3TeamId, 'Name:', teamName);
        console.log('Full found team object:', JSON.stringify(foundTeam, null, 2));
      } else {
        console.log('❌ Team not found in earnings data');
        console.log('Available teams sample (trying different fields):');
        earningsData.data.slice(0, 5).forEach((t, i) => {
          console.log(`Team ${i + 1}:`, {
            'team.name': t.team?.name,
            'name': t.name,
            'team_name': t.team_name,
            'team.id': t.team?.id,
            'team_id': t.team_id,
            'id': t.id
          });
        });
        
        // Display the first 50 teams with their full structure for debugging
        console.log('=== FIRST 50 TEAMS STRUCTURE DEBUG ===');
        const first50Teams = earningsData.data.slice(0, 50);
        first50Teams.forEach((item, index) => {
          const teamName = item.team?.name || item.name || item.team_name || 'NO_NAME';
          const teamId = item.team?.id || item.team_id || item.id || 'NO_ID';
          console.log(`${index + 1}. ${teamName} (ID: ${teamId})`);
        });
        
        setTransactionHistory([]);
        return;
      }
      
      // Fetch transaction history from bo3.gg API
      console.log('Fetching transactions for team ID:', bo3TeamId);
      const proxyUrl = 'https://corsproxy.io/?url=';
      const apiUrl = `https://api.bo3.gg/api/v1/player_transfers?join=teams_deep&page[limit]=25&sort=-action_date&filter[team_to.id,team_from.id][or]=${bo3TeamId},${bo3TeamId}&with=teams,player`;
      
      const response = await fetch(proxyUrl + encodeURIComponent(apiUrl));
      const data = await response.json();
      
      console.log('Transaction history response:', data);
      
      if (data.results) {
        setTransactionHistory(data.results);
        console.log('✅ Found', data.results.length, 'transactions');
      } else {
        console.log('No transactions found');
        setTransactionHistory([]);
      }
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      setTransactionHistory([]);
    } finally {
      setLoadingTransactions(false);
      setTransactionsFetched(true);
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

  // Helper function to get the correct rank based on team's division
  const getTeamRank = () => {
    if (!teamData?.division || !teamData?.teamElosAndRank) {
      return teamData?.regionRank || 'N/A';
    }
    
    const divisionRankData = teamData.teamElosAndRank[teamData.division];
    if (divisionRankData && divisionRankData.rank) {
      return divisionRankData.rank;
    }
    
    // Fallback to regionRank if division rank is not available
    return teamData?.regionRank || 'N/A';
  };

  const renderHeader = () => {
    const formatFoundedDate = (dateString) => {
      if (!dateString) return null;
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    };

    const getAliasesOrFounded = () => {
      if (teamData?.aliases && teamData.aliases.length > 0) {
        return `Also known as: ${teamData.aliases.join(', ')}`;
      }
      const foundedDate = formatFoundedDate(teamData?.foundedDate);
      return foundedDate ? `Founded: ${foundedDate}` : null;
    };

    return (
      <View style={[styles.header, { backgroundColor: theme.surfaceSecondary }]}>
        <View style={styles.headerContent}>
          <TeamLogo
            logoUrl={teamData?.logoUrl}
            size={80}
            style={[styles.headerLogo, { backgroundColor: theme.background }]}
            iconStyle={styles.headerLogo}
          />
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>{teamData?.name || teamName}</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              {teamData?.shortName && `${teamData.shortName} • `}
              Rank #{getTeamRank()}
            </Text>
            {getAliasesOrFounded() && (
              <Text style={[styles.headerDescription, { color: theme.textSecondary }]} numberOfLines={2}>
                {getAliasesOrFounded()}
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

  const getMatchHistory = () => {
    console.log('=== MATCH HISTORY DEBUG ===');
    console.log('teamData exists:', !!teamData);
    console.log('teamData.ratingHistory exists:', !!teamData?.ratingHistory);
    
    if (!teamData?.ratingHistory) {
      console.log('No rating history found, returning empty array');
      return [];
    }
    
    // Collect matches from all leagues: VCT, VCL, GC, and UNI
    const leagues = ['VCT', 'VCL', 'GC', 'UNI'];
    let allMatches = [];
    
    leagues.forEach(league => {
      if (teamData.ratingHistory[league]) {
        console.log(`Total ${league} matches:`, teamData.ratingHistory[league].length);
        allMatches = [...allMatches, ...teamData.ratingHistory[league]];
      } else {
        console.log(`No ${league} rating history found`);
      }
    });
    
    console.log('Combined matches from all leagues:', allMatches.length);
    
    if (allMatches.length === 0) {
      console.log('No matches found in any league, returning empty array');
      return [];
    }
    
    const currentYear = new Date().getFullYear();
    console.log('Current year:', currentYear);
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31);
    console.log('Date range:', startOfYear, 'to', endOfYear);
    
    console.log('All matches before filtering:', allMatches.length);
    
    const filteredMatches = allMatches.filter(match => {
      const matchDate = new Date(match.series_date);
      const isInRange = matchDate >= startOfYear && matchDate <= endOfYear;
      if (!isInRange) {
      }
      return isInRange;
    });
    
    console.log('Matches after date filtering:', filteredMatches.length);
    
    // Sort all matches by date (most recent first)
    const sortedMatches = filteredMatches.sort((a, b) => new Date(b.series_date) - new Date(a.series_date));
    
    console.log('Final matches to display:', sortedMatches.length);
    if (sortedMatches.length > 0) {
      console.log('Sample matches:', sortedMatches.slice(0, 2));
    }
    
    return sortedMatches;
  };

  const sortPlayersByRole = (players) => {
    const roleOrder = { 'player': 1, 'head-coach': 2, 'assistant-coach': 3 };
    return players.sort((a, b) => {
      const roleA = roleOrder[a.role] || 999;
      const roleB = roleOrder[b.role] || 999;
      if (roleA !== roleB) return roleA - roleB;
      return (a.ign || '').localeCompare(b.ign || '');
    });
  };

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
      case 1: return theme.success || '#4CAF50';
      case 2: return theme.warning || '#FF9800';
      case 3: return theme.error || '#F44336';
      default: return theme.text;
    }
  };

  const renderSectionHeader = (title) => (
    <Text style={[styles.sectionHeader, { color: theme.text }]}>{title}</Text>
  );

  const renderRosterContent = () => {
    if (!teamData?.members) {
      return (
        <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
          No roster information available
        </Text>
      );
    }

    const sortedPlayers = sortPlayersByRole(teamData.members);

    return (
      <View style={styles.rosterContent}>
        {sortedPlayers.map((player, index) => (
          <View key={player.id || index} style={[styles.playerCard, { backgroundColor: theme.surface }]}>
            <PlayerImage
              imageUrl={player.imageUrl}
              size={40}
              style={[styles.playerImage, { backgroundColor: theme.background }]}
              iconStyle={styles.playerImage}
            />
            <View style={styles.playerInfo}>
              <Text style={[styles.playerName, { color: theme.text }]}>{player.ign}</Text>
              <Text style={[styles.playerRole, { color: theme.textSecondary }]}>
                {player.firstName && player.lastName 
                  ? `${player.firstName} ${player.lastName}` 
                  : formatRole(player.role)}
              </Text>
            </View>
            <View style={styles.playerStats}>
              <Text style={[styles.playerRoleTag, { color: colors.primary, backgroundColor: `${colors.primary}20` }]}>
                {formatRole(player.role).toUpperCase()}
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
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading History...</Text>
        </View>
      );
    }

    if (transactionHistory.length === 0) {
      return (
        <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
          No transaction history available
        </Text>
      );
    }

    return (
      <View style={styles.historyContent}>
        {transactionHistory.map((transaction, index) => (
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
    const mapName = getMapNameById(mapStat.mapId);
    const losses = mapStat.matches - mapStat.matchWins;
    const mapWinConditions = winConditions.filter(wc => wc.mapId === mapStat.mapId);
    
    // Group win conditions by type
    const conditionGroups = {
      'bomb': mapWinConditions.filter(wc => wc.condition === 'bomb')[0],
      'defuse': mapWinConditions.filter(wc => wc.condition === 'defuse')[0],
      'kills (pre-plant)': mapWinConditions.filter(wc => wc.condition === 'kills (pre-plant)')[0],
      'kills (post-plant)': mapWinConditions.filter(wc => wc.condition === 'kills (post-plant)')[0]
    };

    return (
      <View key={mapStat.mapId} style={[styles.mapStatsCard, { backgroundColor: theme.surface }]}>
        {/* Background Image */}
        <Image 
          source={{ 
            uri: getMapSampleUrl(mapName),
            cache: 'force-cache'
          }}
          style={styles.mapBackground}
        />
        <View style={styles.mapOverlay} />
        
        <View style={styles.mapStatsContent}>
          {/* Map Header */}
          <View style={styles.mapHeader}>
            <Text style={styles.mapName}>{mapName}</Text>
            <Text style={styles.mapWinLoss}>{mapStat.matchWins}W {losses}L • {mapStat.rounds} Rounds</Text>
          </View>
          
          {/* Win Conditions Grid */}
          <View style={styles.conditionsGrid}>
            {Object.entries(conditionGroups).map(([conditionType, data]) => (
              <View key={conditionType} style={[styles.conditionCard, { backgroundColor: theme.background + '90' }]}>
                <Text style={[styles.conditionTitle, { color: '#fff' }]}>
                  {conditionType.charAt(0).toUpperCase() + conditionType.slice(1)}
                </Text>
                {data ? (
                  <>
                    <Text style={[styles.conditionStat, { color: '#ccc' }]}>
                      ATK RW: {data.attackingRoundWins}
                    </Text>
                    <Text style={[styles.conditionStat, { color: '#ccc' }]}>
                      ATK RL: {data.attackingRoundLosses}
                    </Text>
                    <Text style={[styles.conditionStat, { color: '#ccc' }]}>
                      DEF RW: {data.defendingRoundWins}
                    </Text>
                    <Text style={[styles.conditionStat, { color: '#ccc' }]}>
                      DEF RL: {data.defendingRoundLosses}
                    </Text>
                  </>
                ) : (
                  <Text style={[styles.conditionStat, { color: theme.textSecondary }]}>No data</Text>
                )}
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  };

  const renderStatsContent = () => {
    if (loadingStats) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading Stats...</Text>
        </View>
      );
    }

    if (mapStats.length === 0) {
      return (
        <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
          No statistics available for {new Date().getFullYear()}
        </Text>
      );
    }

    // Sort maps by number of matches played (most active maps first)
    const sortedMapStats = [...mapStats].sort((a, b) => b.matches - a.matches);

    return (
      <View style={styles.tabContent}>
        <Text style={[styles.sectionHeader, styles.firstSectionHeader, { color: theme.text }]}>
          Map Performance ({new Date().getFullYear()})
        </Text>
        {sortedMapStats.map(mapStat => renderMapStatsCard(mapStat))}
      </View>
    );
  };

  const renderMatchCard = (match, index) => {
    const matchDate = new Date(match.series_date);
    const formattedDate = matchDate.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });

    // Determine which team is our team and which is opponent
    const isTeam1 = match.team1_id === teamData?.id;
    const ourTeam = {
      id: teamData?.id,
      name: teamData?.name || teamName,
      logo: teamData?.logoUrl,
      score: isTeam1 ? match.team1_score : match.team2_score
    };
    const opponentTeam = {
      id: isTeam1 ? match.team2_id : match.team1_id,
      name: match.opposite_team_name,
      logo: match.opposite_team_url, // This API provides opponent logo
      score: isTeam1 ? match.team2_score : match.team1_score
    };

    // Determine if our team won
    const ourTeamWon = ourTeam.score > opponentTeam.score;

    const handleMatchPress = () => {
      navigation.navigate('VALSeries', {
        seriesId: match.series_id,
        eventName: match.event_name,
        teamName: teamData?.name || teamName,
        opponentName: match.opposite_team_name
      });
    };

    return (
      <TouchableOpacity 
        key={`${match.series_id}-${index}`} 
        style={[styles.matchCard, { backgroundColor: theme.surface }]}
        onPress={handleMatchPress}
        activeOpacity={0.7}
      >
        {/* Event Banner */}
        <View style={[styles.eventBanner, { backgroundColor: colors.primary }]}>
          <Text style={styles.eventName}>{match.event_name}</Text>
        </View>
        
        {/* Teams and Score */}
        <View style={styles.matchContent}>
          {/* Our Team (Left) */}
          <View style={styles.teamSection}>
            <TeamLogo
              logoUrl={ourTeam.logo}
              size={32}
              style={[styles.matchTeamLogo, { opacity: ourTeamWon ? 1 : 0.5, backgroundColor: theme.background }]}
              iconStyle={styles.matchTeamLogo}
            />
            <Text style={[styles.teamName, { color: theme.text }]} numberOfLines={1}>
              {ourTeam.name}
            </Text>
          </View>

          {/* Score */}
          <View style={styles.scoreSection}>
            <View style={styles.scoreContainer}>
              <Text style={[
                styles.score, 
                { 
                  color: ourTeamWon ? colors.primary : theme.textSecondary,
                  fontWeight: ourTeamWon ? 'bold' : '600'
                }
              ]}>
                {ourTeam.score}
              </Text>
              <Text style={[styles.scoreSeparator, { color: theme.textSecondary }]}>-</Text>
              <Text style={[
                styles.score, 
                { 
                  color: !ourTeamWon ? colors.primary : theme.textSecondary,
                  fontWeight: !ourTeamWon ? 'bold' : '600'
                }
              ]}>
                {opponentTeam.score}
              </Text>
            </View>
          </View>

          {/* Opponent Team (Right) */}
          <View style={[styles.teamSection, styles.teamSectionRight]}>
            <TeamLogo
              logoUrl={opponentTeam.logo}
              size={32}
              style={[styles.matchTeamLogo, { opacity: !ourTeamWon ? 1 : 0.5, backgroundColor: theme.background }]}
              iconStyle={styles.matchTeamLogo}
            />
            <Text style={[styles.teamName, styles.teamNameRight, { color: theme.text }]} numberOfLines={1}>
              {opponentTeam.name}
            </Text>
          </View>
        </View>

        {/* Match Date */}
        <View style={styles.matchFooter}>
          <Text style={[styles.matchDate, { color: theme.textSecondary }]}>{formattedDate}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Matches':
        const matches = getMatchHistory();
        console.log('=== RENDER MATCHES ===');
        console.log('Matches to render:', matches.length);
        console.log('Current year for display:', new Date().getFullYear());
        
        return (
          <View style={styles.tabContent}>
            {matches.length > 0 ? (
              matches.map((match, index) => renderMatchCard(match, index))
            ) : (
              <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
                No matches found for {new Date().getFullYear()}
              </Text>
            )}
          </View>
        );
      case 'Players':
        return renderPlayersContent();
      case 'Stats':
        return renderStatsContent();
      default:
        return null;
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
              logoUrl={teamData?.logoUrl}
              size={32}
              style={[styles.stickyHeaderLogo, { backgroundColor: theme.background }]}
              iconStyle={styles.stickyHeaderLogo}
            />
            <Text style={[styles.stickyHeaderTitle, { color: theme.text }]}>{teamData?.name || teamName}</Text>
          </View>
          <View style={styles.stickyHeaderRight}>
            <Text style={[styles.stickyHeaderRank, { color: theme.textSecondary }]}>Rank: #{getTeamRank()}</Text>
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
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 12,
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
    resizeMode: 'contain', // This ensures the full logo is visible regardless of aspect ratio
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
  // Map Stats Styles
  mapStatsCard: {
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    height: 300,
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
  mapRounds: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.8,
    textAlign: 'center',
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
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  conditionStat: {
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 1,
  },
});

export default VALTeamPageScreen;