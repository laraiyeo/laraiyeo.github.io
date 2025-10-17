import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MLBService } from '../../services/MLBService';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';
import { convertMLBIdToESPNId } from '../../utils/TeamIdMapping';

const MLBScoreboardScreen = ({ navigation }) => {
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const { isFavorite } = useFavorites();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updateInterval, setUpdateInterval] = useState(null);
  const [selectedDateFilter, setSelectedDateFilter] = useState('today'); // 'yesterday', 'today', 'upcoming'
  const [isScreenFocused, setIsScreenFocused] = useState(true);

  // Helper functions for date management
  const getYesterday = () => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date;
  };

  const getToday = () => {
    return new Date();
  };

  const getTomorrow = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date;
  };

  const getDateRange = (dateFilter) => {
    switch (dateFilter) {
      case 'yesterday':
        const yesterday = getYesterday();
        return {
          startDate: yesterday,
          endDate: yesterday
        };
      case 'today':
        const today = getToday();
        return {
          startDate: today,
          endDate: today
        };
      case 'upcoming':
        const tomorrow = getTomorrow();
        const endDate = new Date(tomorrow);
        endDate.setDate(endDate.getDate() + 5); // +6 days total from tomorrow
        return {
          startDate: tomorrow,
          endDate: endDate
        };
      default:
        const defaultToday = getToday();
        return {
          startDate: defaultToday,
          endDate: defaultToday
        };
    }
  };

  const formatDateForAPI = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getNoGamesMessage = (dateFilter) => {
    switch (dateFilter) {
      case 'yesterday':
        return 'No games scheduled for yesterday';
      case 'today':
        return 'No games scheduled for today';
      case 'upcoming':
        return 'No upcoming games scheduled';
      default:
        return 'No games scheduled';
    }
  };

  // Track screen focus to pause/resume updates
  useFocusEffect(
    React.useCallback(() => {
      setIsScreenFocused(true);
      
      return () => {
        setIsScreenFocused(false);
        // Clear any existing interval when screen loses focus
        if (updateInterval) {
          clearInterval(updateInterval);
          setUpdateInterval(null);
        }
      };
    }, [])
  );

  useEffect(() => {
    // Load the current filter first (non-silent for initial load)
    loadScoreboard(false);
    
    // Set up continuous fetching for 'today' and 'upcoming' - only if screen is focused
    if ((selectedDateFilter === 'today' || selectedDateFilter === 'upcoming') && isScreenFocused) {
      const interval = setInterval(() => {
        loadScoreboard(true); // Silent update to prevent flickering
      }, 2000); // 2 seconds
      
      setUpdateInterval(interval);
      
      return () => {
        clearInterval(interval);
      };
    } else {
      // Clear interval for non-live filters or when screen is not focused
      if (updateInterval) {
        clearInterval(updateInterval);
        setUpdateInterval(null);
      }
    }
  }, [selectedDateFilter, isScreenFocused]);

  const loadScoreboard = async (silent = false) => {
    try {
      // Only show loading for non-silent updates
      if (!silent) {
        setLoading(true);
      }
      
      // Get date range for the filter
      const { startDate, endDate } = getDateRange(selectedDateFilter);
      const formattedStartDate = formatDateForAPI(startDate);
      const formattedEndDate = formatDateForAPI(endDate);
      
      const scoreboardData = await MLBService.getScoreboard(formattedStartDate, formattedEndDate);
      
      let processedGames;
      
      if (!scoreboardData || !scoreboardData.events || scoreboardData.events.length === 0) {
        processedGames = [{
          type: 'no-games',
          message: getNoGamesMessage(selectedDateFilter)
        }];
      } else {
        // Group games by date and add headers
        const gamesByDate = groupGamesByDate(scoreboardData.events);
        processedGames = [];
        
        // Sort dates chronologically
        Object.keys(gamesByDate)
          .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
          .forEach(date => {
            // Add date header
            processedGames.push({
              type: 'header',
              date: formatDateHeader(date)
            });
            
            // Add games for this date
            processedGames.push(...gamesByDate[date]);
          });
      }
      
      setGames(processedGames);
      
    } catch (error) {
      console.error('MLBScoreboardScreen: Error loading games:', error);
      // Only show error alerts for non-silent updates to avoid interrupting user
      if (!silent) {
        Alert.alert(
          'Error',
          'Failed to load MLB games. Please check your connection and try again.',
          [
            { text: 'Retry', onPress: () => loadScoreboard(false) },
            { text: 'OK' }
          ]
        );
      }
    } finally {
      // Only clear loading for non-silent updates
      if (!silent) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  // Group games by date
  const groupGamesByDate = (games) => {
    const groups = {};
    
    games.forEach(game => {
      const gameDate = new Date(game.date);
      const dateKey = gameDate.toDateString();
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      
      groups[dateKey].push(game);
    });
    
    // Sort games within each date group
    Object.keys(groups).forEach(dateKey => {
      console.log(`Sorting games for date: ${dateKey}`);
      
      groups[dateKey].sort((a, b) => {
        // Log game details for debugging
        console.log('Game A:', {
          name: `${a.awayTeam?.displayName} vs ${a.homeTeam?.displayName}`,
          status: a.status,
          statusType: a.statusType,
          isLive: a.isLive,
          date: a.date
        });
        console.log('Game B:', {
          name: `${b.awayTeam?.displayName} vs ${b.homeTeam?.displayName}`,
          status: b.status,
          statusType: b.statusType,
          isLive: b.isLive,
          date: b.date
        });
        
        // Get status priority (Live = 1, Scheduled = 2, Finished = 3)
        const getStatusPriority = (game) => {
          // Check the isLive flag first
          if (game.isLive || game.statusType === 'I') {
            return 1; // Live games first
          }
          
          // Check for completed games
          if (game.isCompleted || game.statusType === 'F' || game.statusType === 'O') {
            return 3; // Finished games last
          }
          
          // Check status text for additional context
          const status = (game.status || '').toLowerCase();
          if (status.includes('in progress') || 
              status.includes('live') || 
              status.includes('manager challenge')) {
            return 1; // Live games first
          } else if (status.includes('final') || status.includes('completed')) {
            return 3; // Finished games last
          } else {
            return 2; // Scheduled games (default)
          }
        };
        
        const statusA = getStatusPriority(a);
        const statusB = getStatusPriority(b);
        
        console.log(`Status priorities - A: ${statusA}, B: ${statusB}`);
        
        // First sort by status priority
        if (statusA !== statusB) {
          return statusA - statusB;
        }
        
        // If same status, sort by game time
        const timeA = new Date(a.date).getTime();
        const timeB = new Date(b.date).getTime();
        
        console.log(`Time comparison - A: ${timeA}, B: ${timeB}, diff: ${timeA - timeB}`);
        
        return timeA - timeB;
      });
      
      console.log(`Sorted order for ${dateKey}:`, groups[dateKey].map(game => ({
        teams: `${game.awayTeam?.displayName} vs ${game.homeTeam?.displayName}`,
        status: game.status,
        statusType: game.statusType,
        time: game.date
      })));
    });
    
    return groups;
  };

  // Format date header
  const formatDateHeader = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric' 
      });
    }
  };

  const handleDateFilterChange = (filter) => {
    setSelectedDateFilter(filter);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadScoreboard(false); // Non-silent for manual refresh
    setRefreshing(false);
  };

  const navigateToGameDetails = async (gameId) => {
    if (!gameId) return;
    
    // Start navigation immediately
    navigation.navigate('GameDetails', { gameId, sport: 'mlb' });
  };

  const getESPNTeamId = (espnTeam) => {
    // Get the team ID from the API response
    const rawTeamId = espnTeam?.id?.toString();
    if (!rawTeamId) return null;
    
    // If this is a MLB ID (from MLB API), convert to ESPN ID for favorites consistency
    const espnId = convertMLBIdToESPNId(rawTeamId);
    if (espnId) {
      console.log(`ScoreboardScreen: Converting MLB ID ${rawTeamId} -> ESPN ID ${espnId}`);
      return espnId; // Successfully converted MLB ID to ESPN ID
    }
    
    // Otherwise assume it's already an ESPN ID or unknown
    return rawTeamId;
  };

  const getMLBTeamAbbreviation = (espnTeam) => {
    // ESPN team ID to abbreviation mapping (reverse of what standings does)
    const teamMapping = {
      '108': 'LAA', '117': 'HOU', '133': 'ATH', '141': 'TOR', '144': 'ATL',
      '158': 'MIL', '138': 'STL', '112': 'CHC', '109': 'ARI', '119': 'LAD',
      '137': 'SF', '114': 'CLE', '136': 'SEA', '146': 'MIA', '121': 'NYM',
      '120': 'WSH', '110': 'BAL', '135': 'SD', '143': 'PHI', '134': 'PIT',
      '140': 'TEX', '139': 'TB', '111': 'BOS', '113': 'CIN', '115': 'COL',
      '118': 'KC', '116': 'DET', '142': 'MIN', '145': 'CWS', '147': 'NYY',
      // Alternative mappings
      '11': 'ATH',   // Sometimes Athletics use ESPN ID 11
    };

    console.log('Team ID:', espnTeam?.id, 'Team abbreviation from API:', espnTeam?.abbreviation);
    
    // First try direct abbreviation if available
    if (espnTeam?.abbreviation) {
      return espnTeam.abbreviation;
    }
    
    // Then try ID mapping
    const abbr = teamMapping[espnTeam?.id?.toString()];
    if (abbr) {
      console.log('Using ID mapping for team ID:', espnTeam.id, '-> abbreviation:', abbr);
      return abbr;
    }
    
    console.warn('No abbreviation mapping found for team ID:', espnTeam?.id, 'Using fallback');
    return espnTeam?.shortDisplayName || 'MLB';
  };

  const getGameStatusText = (item) => {
    if (!item.status) return 'Unknown';
    
    // For MLB, show inning info for in-progress games
    if (item.isLive && item.inning && item.inningState) {
      const ordinal = MLBService.getOrdinalSuffix(item.inning);
      return item.inningState === 'Top' ? `Top ${ordinal}` : `Bot ${ordinal}`;
    }
    
    return item.status;
  };

  const getGameTimeText = (item) => {
    // For live games, don't show start time (status shows inning info)
    if (item.isLive) {
      return '';
    }
    
    // For both scheduled and finished games, show game start time
    const gameDate = new Date(item.date);
    return gameDate.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit'
    });
  };

  const renderDateHeader = (date) => (
    <View style={[styles.dateHeader, { backgroundColor: colors.primary, borderBottomColor: theme.border }]}>
      <Text allowFontScaling={false} style={[styles.dateHeaderText, { color: 'white' }]}>{date}</Text>
    </View>
  );

  // Helper functions for determining losing team styles
  const getTeamScoreStyle = (item, isAwayTeam) => {
    if (!item.awayTeam || !item.homeTeam) return styles.teamScore;
    
    const isGameFinal = item.isCompleted || item.statusType === 'F' || item.statusType === 'O';
    const awayScore = parseInt(item.awayTeam.score || '0');
    const homeScore = parseInt(item.homeTeam.score || '0');
    const isLosing = isGameFinal && (
      (isAwayTeam && awayScore < homeScore) || 
      (!isAwayTeam && homeScore < awayScore)
    );
    return isLosing ? [styles.teamScore, styles.losingTeamScore] : styles.teamScore;
  };

  const getScoreColor = (item, isAwayTeam) => {
    if (!item.awayTeam || !item.homeTeam) return colors.primary;
    
    const isGameFinal = item.isCompleted || item.statusType === 'F' || item.statusType === 'O';
    const awayScore = parseInt(item.awayTeam.score || '0');
    const homeScore = parseInt(item.homeTeam.score || '0');
    const isLosing = isGameFinal && (
      (isAwayTeam && awayScore < homeScore) || 
      (!isAwayTeam && homeScore < awayScore)
    );
    return isLosing ? theme.textSecondary : colors.primary;
  };

  const getTeamNameColor = (item, isAwayTeam) => {
    if (!item.awayTeam || !item.homeTeam) return theme.text;
    
    const isGameFinal = item.isCompleted || item.statusType === 'F' || item.statusType === 'O';
    const awayScore = parseInt(item.awayTeam.score || '0');
    const homeScore = parseInt(item.homeTeam.score || '0');
    const isLosing = isGameFinal && (
      (isAwayTeam && awayScore < homeScore) || 
      (!isAwayTeam && homeScore < awayScore)
    );
    return isLosing ? theme.textSecondary : theme.text;
  };

  const getTeamNameStyle = (item, isAwayTeam) => {
    if (!item.awayTeam || !item.homeTeam) return styles.teamName;
    
    const isGameFinal = item.isCompleted || item.statusType === 'F' || item.statusType === 'O';
    const awayScore = parseInt(item.awayTeam.score || '0');
    const homeScore = parseInt(item.homeTeam.score || '0');
    const isLosing = isGameFinal && (
      (isAwayTeam && awayScore < homeScore) || 
      (!isAwayTeam && homeScore < awayScore)
    );
    return isLosing ? [styles.teamName, styles.losingTeamName] : styles.teamName;
  };

  const renderGameCard = ({ item }) => {
    if (item.type === 'header') {
      return renderDateHeader(item.date);
    }

    if (item.type === 'no-games') {
      return (
        <View style={styles.emptyContainer}>
          <Text allowFontScaling={false} style={[styles.emptyText, { color: theme.textSecondary }]}>{item.message}</Text>
        </View>
      );
    }

    return (
      <TouchableOpacity 
        style={[styles.gameCard, { backgroundColor: theme.surface }]}
        onPress={() => navigateToGameDetails(item.id)}
      >
        {/* Game Status */}
        <View style={styles.gameHeader}>
          <Text allowFontScaling={false} style={[styles.gameStatus, { color: theme.text }]}>{getGameStatusText(item)}</Text>
          {getGameTimeText(item) && (
            <Text allowFontScaling={false} style={[styles.gameClock, { color: theme.textSecondary }]}>{getGameTimeText(item)}</Text>
          )}
        </View>

        {/* Teams */}
        <View style={styles.teamsContainer}>
          {/* Away Team */}
          <View style={styles.teamRow}>
            <View style={styles.teamLogoContainer}>
              <Image 
                source={{ uri: getTeamLogoUrl('mlb', getMLBTeamAbbreviation(item.awayTeam)) || item.awayTeam?.logo || 'https://via.placeholder.com/40x40?text=MLB' }} 
                style={styles.teamLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
              />
            </View>
            <View style={styles.teamInfo}>
              <Text allowFontScaling={false} style={[
                getTeamNameStyle(item, true), 
                { 
                  color: isFavorite(getESPNTeamId(item.awayTeam), 'mlb') ? colors.primary : getTeamNameColor(item, true) 
                }
              ]}>
                {isFavorite(getESPNTeamId(item.awayTeam), 'mlb') && '★ '}
                {item.awayTeam?.displayName || 'TBD'}
              </Text>
              <Text allowFontScaling={false} style={[styles.teamRecord, { color: theme.textSecondary }]}>{item.awayTeam?.record || ''}</Text>
            </View>
            <Text allowFontScaling={false} style={[getTeamScoreStyle(item, true), { color: getScoreColor(item, true) }]}>{(item.isLive || item.isCompleted || item.statusType === 'O') ? item.awayTeam?.score || '0' : ''}</Text>
          </View>

          {/* Home Team */}
          <View style={styles.teamRow}>
            <View style={styles.teamLogoContainer}>
              <Image 
                source={{ uri: getTeamLogoUrl('mlb', getMLBTeamAbbreviation(item.homeTeam)) || item.homeTeam?.logo || 'https://via.placeholder.com/40x40?text=MLB' }} 
                style={styles.teamLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
              />
            </View>
            <View style={styles.teamInfo}>
              <Text allowFontScaling={false} style={[
                getTeamNameStyle(item, false), 
                { 
                  color: isFavorite(getESPNTeamId(item.homeTeam), 'mlb') ? colors.primary : getTeamNameColor(item, false) 
                }
              ]}>
                {isFavorite(getESPNTeamId(item.homeTeam), 'mlb') && '★ '}
                {item.homeTeam?.displayName || 'TBD'}
              </Text>
              <Text allowFontScaling={false} style={[styles.teamRecord, { color: theme.textSecondary }]}>{item.homeTeam?.record || ''}</Text>
            </View>
            <Text allowFontScaling={false} style={[getTeamScoreStyle(item, false), { color: getScoreColor(item, false) }]}>{(item.isLive || item.isCompleted || item.statusType === 'O') ? item.homeTeam?.score || '0' : ''}</Text>
          </View>
        </View>

        {/* Game Info */}
        <View style={[styles.gameFooter, {borderTopColor : theme.border }]}>
          <Text allowFontScaling={false} style={[styles.venue, { color: theme.textSecondary }]}>{item.venue || ''}</Text>
          {item.broadcasts && item.broadcasts.length > 0 && (
            <Text allowFontScaling={false} style={[styles.broadcast, { color: theme.textSecondary }]}>{item.broadcasts.join(', ')}</Text>
          )}
          {/* Show bases for live games */}
          {item.isLive && item.situation?.bases && (
            <View style={styles.basesContainer}>
              <Text allowFontScaling={false} style={[styles.basesLabel, { color: theme.textSecondary }]}>
                Bases: {(() => {
                  const bases = [];
                  if (item.situation.bases.first) bases.push('1st');
                  if (item.situation.bases.second) bases.push('2nd');
                  if (item.situation.bases.third) bases.push('3rd');
                  return bases.length > 0 ? bases.join(' ') : 'Empty';
                })()}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.textSecondary }]}>Loading MLB Scoreboard...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Date Filter Buttons */}
      <View style={[styles.dateFilterContainer, { backgroundColor: theme.surface }]}>
        <TouchableOpacity 
          style={[
            styles.dateFilterButton, 
            { backgroundColor: selectedDateFilter === 'yesterday' ? colors.primary : theme.surfaceSecondary }
          ]}
          onPress={() => handleDateFilterChange('yesterday')}
        >
          <Text allowFontScaling={false} style={[
            styles.dateFilterText, 
            { color: selectedDateFilter === 'yesterday' ? '#fff' : theme.text }
          ]}>
            Yesterday
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[
            styles.dateFilterButton, 
            { backgroundColor: selectedDateFilter === 'today' ? colors.primary : theme.surfaceSecondary }
          ]}
          onPress={() => handleDateFilterChange('today')}
        >
          <Text allowFontScaling={false} style={[
            styles.dateFilterText, 
            { color: selectedDateFilter === 'today' ? '#fff' : theme.text }
          ]}>
            Today
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[
            styles.dateFilterButton, 
            { backgroundColor: selectedDateFilter === 'upcoming' ? colors.primary : theme.surfaceSecondary }
          ]}
          onPress={() => handleDateFilterChange('upcoming')}
        >
          <Text allowFontScaling={false} style={[
            styles.dateFilterText, 
            { color: selectedDateFilter === 'upcoming' ? '#fff' : theme.text }
          ]}>
            Upcoming
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={games}
        renderItem={renderGameCard}
        keyExtractor={(item, index) => {
          if (item.type === 'header') return `header-${item.date}`;
          if (item.type === 'no-games') return `no-games-${index}`;
          return item.id || `game-${index}`;
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          !loading && (
            <View style={styles.emptyContainer}>
              <Text allowFontScaling={false} style={[styles.emptyText, { color: theme.textSecondary }]}>No games scheduled</Text>
            </View>
          )
        )}
      />
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
    marginTop: 10,
    fontSize: 16,
  },
  listContainer: {
    padding: 16,
  },
  gameCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gameStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: '#002D72',
  },
  gameClock: {
    fontSize: 14,
    color: '#666',
  },
  teamsContainer: {
    marginBottom: 12,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  teamLogo: {
    width: 40,
    height: 40,
    marginRight: 12,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  teamRecord: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  teamScore: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#002D72',
    minWidth: 40,
    textAlign: 'center',
  },
  losingTeamScore: {
    color: '#999',
  },
  losingTeamName: {
    color: '#999',
  },
  gameFooter: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 8,
  },
  venue: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  broadcast: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  basesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  basesLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  teamLogoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  dateHeader: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
  },
  dateHeaderText: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  dateFilterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  dateFilterButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  activeFilterButton: {
    // Dynamic color applied in render
  },
  dateFilterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  activeFilterText: {
    // Dynamic color applied in render
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
});

export default MLBScoreboardScreen;
