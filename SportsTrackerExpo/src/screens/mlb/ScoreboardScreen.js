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

const MLBScoreboardScreen = ({ navigation }) => {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdateHash, setLastUpdateHash] = useState('');
  const [updateInterval, setUpdateInterval] = useState(null);
  const [selectedDateFilter, setSelectedDateFilter] = useState('today'); // 'yesterday', 'today', 'upcoming'
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  
  // Cache for each date filter
  const [gameCache, setGameCache] = useState({
    yesterday: null,
    today: null,
    upcoming: null
  });
  
  // Cache timestamps to know when to refresh
  const [cacheTimestamps, setCacheTimestamps] = useState({
    yesterday: 0,
    today: 0,
    upcoming: 0
  });

  // Track if preloading has been done to prevent multiple calls
  const hasPreloadedRef = useRef(false);
  
  // Cache duration: 30 seconds for today and upcoming (live/soon-to-be-live games), 5 minutes for others
  const getCacheDuration = (filter) => {
    return (filter === 'today' || filter === 'upcoming') ? 30000 : 300000; // 30s for today/upcoming, 5min for others
  };

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
      console.log('MLBScoreboardScreen: Screen focused');
      setIsScreenFocused(true);
      
      return () => {
        console.log('MLBScoreboardScreen: Screen unfocused, clearing intervals');
        setIsScreenFocused(false);
        // Clear any existing interval when screen loses focus
        setUpdateInterval(prevInterval => {
          if (prevInterval) clearInterval(prevInterval);
          return null;
        });
      };
    }, []) // Remove updateInterval dependency to prevent re-runs
  );

  useEffect(() => {
    console.log('MLBScoreboardScreen: Main useEffect triggered for filter:', selectedDateFilter, 'focused:', isScreenFocused);
    // Load the current filter first
    loadScoreboard();
    
    // Set up continuous fetching for 'today' and 'upcoming' - only if screen is focused
    if ((selectedDateFilter === 'today' || selectedDateFilter === 'upcoming') && isScreenFocused) {
      const interval = setInterval(() => {
        loadScoreboard(true, selectedDateFilter);
      }, 2000);
      
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

  // Separate effect for initial preloading - only runs once on mount
  useEffect(() => {
    console.log('MLBScoreboardScreen: Preload useEffect triggered, hasPreloaded:', hasPreloadedRef.current);
    // Only preload if we haven't done it before
    if (hasPreloadedRef.current) {
      console.log('MLBScoreboardScreen: Skipping preload, already done');
      return;
    }
    
    // Mark that we're doing preloading
    hasPreloadedRef.current = true;
    console.log('MLBScoreboardScreen: Starting preload for other filters');
    
    // Preload the other filters in the background after initial load
    const preloadTimer = setTimeout(() => {
      if (selectedDateFilter !== 'yesterday') {
        console.log('MLBScoreboardScreen: Preloading yesterday data');
        loadScoreboard(true, 'yesterday');
      }
      if (selectedDateFilter !== 'upcoming') {
        console.log('MLBScoreboardScreen: Preloading upcoming data');
        loadScoreboard(true, 'upcoming');
      }
    }, 1000); // Wait 1 second after initial load to preload others
    
    return () => clearTimeout(preloadTimer);
  }, []); // Empty dependency array - only run once on mount

  const loadScoreboard = async (silentUpdate = false, dateFilter = selectedDateFilter) => {
    console.log('MLBScoreboardScreen: loadScoreboard called - silentUpdate:', silentUpdate, 'dateFilter:', dateFilter);
    const now = Date.now();
    const cachedData = gameCache[dateFilter];
    const cacheTime = cacheTimestamps[dateFilter];
    const cacheDuration = getCacheDuration(dateFilter);
    const isCacheValid = cachedData && (now - cacheTime) < cacheDuration;
    
    // If we have valid cached data, show it immediately
    if (isCacheValid && !silentUpdate) {
      console.log('MLBScoreboardScreen: Using cached data for', dateFilter);
      setGames(cachedData);
      setLoading(false);
      
      // Still fetch in background for today's and upcoming games to check for updates
      if (dateFilter === 'today' || dateFilter === 'upcoming') {
        loadScoreboard(true, dateFilter);
      }
      return;
    }
    
    // If no valid cache, show loading only if not a silent update
    if (!isCacheValid && !silentUpdate) {
      setLoading(true);
    }
    
    try {
      const { startDate, endDate } = getDateRange(dateFilter);
      const formattedStartDate = formatDateForAPI(startDate);
      const formattedEndDate = formatDateForAPI(endDate);
      console.log('MLBScoreboardScreen: Making API call for', dateFilter);
      console.log('MLBScoreboardScreen: startDate object:', startDate);
      console.log('MLBScoreboardScreen: endDate object:', endDate);
      console.log('MLBScoreboardScreen: formatted startDate:', formattedStartDate);
      console.log('MLBScoreboardScreen: formatted endDate:', formattedEndDate);
      const scoreboardData = await MLBService.getScoreboard(formattedStartDate, formattedEndDate);
      
      let processedGames;
      
      if (!scoreboardData || !scoreboardData.events || scoreboardData.events.length === 0) {
        processedGames = [{
          type: 'no-games',
          message: getNoGamesMessage(dateFilter)
        }];
      } else {
        // Group games by date and add headers
        const gamesByDate = groupGamesByDate(scoreboardData.events);
        processedGames = [];
        
        Object.keys(gamesByDate).sort().forEach(date => {
          // Add date header
          processedGames.push({
            type: 'header',
            date: formatDateHeader(date)
          });
          
          // Add games for this date
          processedGames.push(...gamesByDate[date]);
        });
      }
      
      // Update cache
      setGameCache(prev => ({
        ...prev,
        [dateFilter]: processedGames
      }));
      
      setCacheTimestamps(prev => ({
        ...prev,
        [dateFilter]: now
      }));
      
      // Update display if this is the currently selected filter
      if (dateFilter === selectedDateFilter) {
        setGames(processedGames);
      }
      
    } catch (error) {
      if (!silentUpdate) {
        Alert.alert('Error', 'Failed to load games');
        console.error('Error loading games:', error);
      }
    } finally {
      if (!silentUpdate) {
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
    
    // Check if we have cached data for this filter
    const cachedData = gameCache[filter];
    const cacheTime = cacheTimestamps[filter];
    const cacheDuration = getCacheDuration(filter);
    const isCacheValid = cachedData && (Date.now() - cacheTime) < cacheDuration;
    
    if (isCacheValid) {
      setGames(cachedData);
    } else {
      setLoading(true);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadScoreboard(false, selectedDateFilter);
    setRefreshing(false);
  };

  const navigateToGameDetails = async (gameId) => {
    if (!gameId) return;
    
    // Start navigation immediately
    navigation.navigate('GameDetails', { gameId, sport: 'mlb' });
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
    // For finished games, don't show additional time info
    if (item.isCompleted) {
      return '';
    }
    
    // For scheduled games, show game start time
    if (!item.isLive && !item.isCompleted) {
      const gameDate = new Date(item.date);
      return gameDate.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit'
      });
    }
    
    return '';
  };

  const renderDateHeader = (date) => (
    <View style={styles.dateHeader}>
      <Text style={styles.dateHeaderText}>{date}</Text>
    </View>
  );

  // Helper functions for determining losing team styles
  const getTeamScoreStyle = (item, isAwayTeam) => {
    if (!item.awayTeam || !item.homeTeam) return styles.teamScore;
    
    const isGameFinal = item.isCompleted;
    const awayScore = parseInt(item.awayTeam.score || '0');
    const homeScore = parseInt(item.homeTeam.score || '0');
    const isLosing = isGameFinal && (
      (isAwayTeam && awayScore < homeScore) || 
      (!isAwayTeam && homeScore < awayScore)
    );
    return isLosing ? [styles.teamScore, styles.losingTeamScore] : styles.teamScore;
  };

  const getTeamNameStyle = (item, isAwayTeam) => {
    if (!item.awayTeam || !item.homeTeam) return styles.teamName;
    
    const isGameFinal = item.isCompleted;
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
          <Text style={styles.emptyText}>{item.message}</Text>
        </View>
      );
    }

    return (
      <TouchableOpacity 
        style={styles.gameCard}
        onPress={() => navigateToGameDetails(item.id)}
      >
        {/* Game Status */}
        <View style={styles.gameHeader}>
          <Text style={styles.gameStatus}>{getGameStatusText(item)}</Text>
          {getGameTimeText(item) && (
            <Text style={styles.gameClock}>{getGameTimeText(item)}</Text>
          )}
        </View>

        {/* Teams */}
        <View style={styles.teamsContainer}>
          {/* Away Team */}
          <View style={styles.teamRow}>
            <View style={styles.teamLogoContainer}>
              <Image 
                source={{ uri: item.awayTeam?.logo }} 
                style={styles.teamLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
              />
            </View>
            <View style={styles.teamInfo}>
              <Text style={getTeamNameStyle(item, true)}>{item.awayTeam?.displayName || 'TBD'}</Text>
              <Text style={styles.teamRecord}>{item.awayTeam?.record || ''}</Text>
            </View>
            <Text style={getTeamScoreStyle(item, true)}>{item.awayTeam?.score || '0'}</Text>
          </View>

          {/* Home Team */}
          <View style={styles.teamRow}>
            <View style={styles.teamLogoContainer}>
              <Image 
                source={{ uri: item.homeTeam?.logo }} 
                style={styles.teamLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
              />
            </View>
            <View style={styles.teamInfo}>
              <Text style={getTeamNameStyle(item, false)}>{item.homeTeam?.displayName || 'TBD'}</Text>
              <Text style={styles.teamRecord}>{item.homeTeam?.record || ''}</Text>
            </View>
            <Text style={getTeamScoreStyle(item, false)}>{item.homeTeam?.score || '0'}</Text>
          </View>
        </View>

        {/* Game Info */}
        <View style={styles.gameFooter}>
          <Text style={styles.venue}>{item.venue || ''}</Text>
          {item.broadcasts && item.broadcasts.length > 0 && (
            <Text style={styles.broadcast}>{item.broadcasts.join(', ')}</Text>
          )}
          {/* Show bases for live games */}
          {item.isLive && item.situation?.bases && (
            <View style={styles.basesContainer}>
              <Text style={styles.basesLabel}>Bases: </Text>
              <Text style={styles.basesText}>
                {(() => {
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#002D72" />
        <Text style={styles.loadingText}>Loading MLB Scoreboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Date Filter Buttons */}
      <View style={styles.dateFilterContainer}>
        <TouchableOpacity 
          style={[styles.dateFilterButton, selectedDateFilter === 'yesterday' && styles.activeFilterButton]}
          onPress={() => handleDateFilterChange('yesterday')}
        >
          <Text style={[styles.dateFilterText, selectedDateFilter === 'yesterday' && styles.activeFilterText]}>
            Yesterday
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.dateFilterButton, selectedDateFilter === 'today' && styles.activeFilterButton]}
          onPress={() => handleDateFilterChange('today')}
        >
          <Text style={[styles.dateFilterText, selectedDateFilter === 'today' && styles.activeFilterText]}>
            Today
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.dateFilterButton, selectedDateFilter === 'upcoming' && styles.activeFilterButton]}
          onPress={() => handleDateFilterChange('upcoming')}
        >
          <Text style={[styles.dateFilterText, selectedDateFilter === 'upcoming' && styles.activeFilterText]}>
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
            colors={['#002D72']}
          />
        }
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          !loading && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No games scheduled</Text>
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
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  listContainer: {
    padding: 16,
  },
  gameCard: {
    backgroundColor: 'white',
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
    color: '#002D72',
    fontWeight: '600',
  },
  basesText: {
    fontSize: 12,
    color: '#666',
  },
  teamLogoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  dateHeader: {
    backgroundColor: '#002D72',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
  },
  dateHeaderText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  dateFilterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  dateFilterButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    minWidth: 80,
    alignItems: 'center',
  },
  activeFilterButton: {
    backgroundColor: '#002D72',
  },
  dateFilterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  activeFilterText: {
    color: 'white',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});

export default MLBScoreboardScreen;
