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
import { NFLService } from '../services/NFLService';

const NFLScoreboardScreen = ({ navigation }) => {
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
    return `${year}${month}${day}`;
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
      console.log('NFLScoreboardScreen: Screen focused');
      setIsScreenFocused(true);
      
      return () => {
        console.log('NFLScoreboardScreen: Screen unfocused, clearing intervals');
        setIsScreenFocused(false);
        // Clear any existing interval when screen loses focus
        setUpdateInterval(prevInterval => {
          if (prevInterval) {
            clearInterval(prevInterval);
          }
          return null;
        });
      };
    }, []) // Remove updateInterval dependency to prevent re-runs
  );

  useEffect(() => {
    console.log('NFLScoreboardScreen: Main useEffect triggered for filter:', selectedDateFilter, 'focused:', isScreenFocused);
    // Load the current filter first
    loadScoreboard();
    
    // Set up continuous fetching for 'today' and 'upcoming' - only if screen is focused
    if ((selectedDateFilter === 'today' || selectedDateFilter === 'upcoming') && isScreenFocused) {
      const interval = setInterval(() => {
        if (isScreenFocused) {
          loadScoreboard(true); // Silent update
        }
      }, 2000);
      
      setUpdateInterval(interval);
      
      return () => {
        if (interval) {
          clearInterval(interval);
        }
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
    console.log('NFLScoreboardScreen: Preload useEffect triggered, hasPreloaded:', hasPreloadedRef.current);
    // Only preload if we haven't done it before
    if (hasPreloadedRef.current) {
      console.log('NFLScoreboardScreen: Skipping preload, already done');
      return;
    }
    
    // Mark that we're doing preloading
    hasPreloadedRef.current = true;
    console.log('NFLScoreboardScreen: Starting preload for other filters');
    
    // Preload the other filters in the background after initial load
    const preloadTimer = setTimeout(() => {
      if (selectedDateFilter !== 'yesterday') {
        console.log('NFLScoreboardScreen: Preloading yesterday data');
        loadScoreboard(true, 'yesterday');
      }
      if (selectedDateFilter !== 'upcoming') {
        console.log('NFLScoreboardScreen: Preloading upcoming data');
        loadScoreboard(true, 'upcoming');
      }
    }, 1000); // Wait 1 second after initial load to preload others
    
    return () => clearTimeout(preloadTimer);
  }, []); // Empty dependency array - only run once on mount

  const loadScoreboard = async (silentUpdate = false, dateFilter = selectedDateFilter) => {
    console.log('NFLScoreboardScreen: loadScoreboard called - silentUpdate:', silentUpdate, 'dateFilter:', dateFilter);
    const now = Date.now();
    const cachedData = gameCache[dateFilter];
    const cacheTime = cacheTimestamps[dateFilter];
    const cacheDuration = getCacheDuration(dateFilter);
    const isCacheValid = cachedData && (now - cacheTime) < cacheDuration;
    
    // If we have valid cached data, show it immediately
    if (isCacheValid && !silentUpdate) {
      console.log('NFLScoreboardScreen: Using cached data for', dateFilter);
      setGames(cachedData);
      setLoading(false);
      
      // Still fetch in background for today's and upcoming games to check for updates
      if (dateFilter === 'today' || dateFilter === 'upcoming') {
        loadScoreboard(true, dateFilter); // Silent background update
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
      console.log('NFLScoreboardScreen: Making API call for', dateFilter);
      console.log('NFLScoreboardScreen: startDate object:', startDate);
      console.log('NFLScoreboardScreen: endDate object:', endDate);
      console.log('NFLScoreboardScreen: formatted startDate:', formattedStartDate);
      console.log('NFLScoreboardScreen: formatted endDate:', formattedEndDate);
      const scoreboardData = await NFLService.getScoreboard(formattedStartDate, formattedEndDate);
      
      let processedGames;
      
      if (!scoreboardData || !scoreboardData.events || scoreboardData.events.length === 0) {
        // No games for this date range
        processedGames = [{ type: 'no-games', message: getNoGamesMessage(dateFilter) }];
      } else {
        const formattedGames = scoreboardData.events.map(game => 
          NFLService.formatGameForMobile(game)
        );
        
        // Check if any games are still in progress
        const hasLiveGames = formattedGames.some(game => !game.isCompleted);
        
        // If no live games and we have an active interval, stop it
        if (!hasLiveGames && updateInterval) {
          clearInterval(updateInterval);
          setUpdateInterval(null);
          console.log('All games are final, stopping updates');
        }
        
        // Group games by date with latest first
        const gamesByDate = formattedGames.reduce((acc, game) => {
          const gameDate = game.date.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "2-digit", 
            day: "2-digit",
          });
          if (!acc[gameDate]) acc[gameDate] = [];
          acc[gameDate].push(game);
          return acc;
        }, {});

        // Sort dates in reverse chronological order (latest first)
        const sortedDates = Object.keys(gamesByDate).sort(
          (a, b) => new Date(b) - new Date(a)
        );

        // Flatten back to array with date headers
        const groupedGames = [];
        for (const date of sortedDates) {
          groupedGames.push({ type: 'header', date });
          gamesByDate[date].forEach(game => {
            groupedGames.push({ type: 'game', ...game });
          });
        }
        
        processedGames = groupedGames;
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
      
      // Update display if this is for the current filter
      if (dateFilter === selectedDateFilter) {
        setGames(processedGames);
      }
      
    } catch (error) {
      if (!silentUpdate) {
        Alert.alert('Error', 'Failed to load NFL scoreboard');
      }
      console.error('Error loading scoreboard:', error);
      
      // If we have cached data and there's an error, keep showing cached data
      if (cachedData && dateFilter === selectedDateFilter) {
        setGames(cachedData);
      }
    } finally {
      if (!silentUpdate) {
        setLoading(false);
      }
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
      // Show cached data immediately
      setGames(cachedData);
      setLoading(false);
      
      // For today's and upcoming games, still check for updates in background
      if (filter === 'today' || filter === 'upcoming') {
        loadScoreboard(true, filter);
      }
    } else {
      // No valid cache, load fresh data
      loadScoreboard(false, filter);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadScoreboard(false, selectedDateFilter);
    setRefreshing(false);
  };

  const navigateToGameDetails = async (gameId) => {
    if (!gameId) return;
    
    // Start navigation immediately but preload drives in background
    navigation.navigate('GameDetails', { gameId, sport: 'nfl' });
    
    // Preload drives data for better experience (non-blocking)
    try {
      await NFLService.getDrives(gameId);
    } catch (error) {
      console.warn('Failed to preload drives data:', error);
    }
  };

  const getGameStatusText = (item) => {
    if (!item.status) return 'TBD';
    
    // Special handling for halftime
    if (item.status.toLowerCase() === 'halftime') {
      return 'Halftime';
    }
    // Check if game is in progress (not final, not pre-game)
    if (item.status.toLowerCase().includes('quarter') || 
        item.status.toLowerCase().includes('half') ||
        item.status.toLowerCase().includes('overtime')) {
      return item.status; // Return the quarter info directly
    }
    return item.status; // Return original status for other cases
  };

  const getGameTimeText = (item) => {
    // For finished games, show start time instead of clock
    if (item.isCompleted) {
      return item.date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
    
    // For halftime, don't show any time text (status already shows "Halftime")
    if (item.status && item.status.toLowerCase() === 'halftime') {
      return '';
    }
    
    // For scheduled games (not started yet), show game start time
    if (item.status && (item.status.toLowerCase() === 'scheduled' || 
        item.status.toLowerCase().includes('pre') || 
        !item.status.toLowerCase().includes('quarter') && 
        !item.status.toLowerCase().includes('half') && 
        !item.status.toLowerCase().includes('overtime') && 
        !item.status.toLowerCase().includes('final'))) {
      return item.date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
    
    // For in-progress games, show clock if available
    return item.displayClock || '';
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
              {/* Possession indicator for away team (not during halftime) */}
              {item.situation?.possession && item.awayTeam?.id && 
               item.situation.possession === item.awayTeam.id && 
               item.status && item.status.toLowerCase() !== 'halftime' && (
                <Text style={[styles.possessionIndicator, styles.awayPossession]}>🏈</Text>
              )}
              <Image 
                source={{ uri: item.awayTeam?.logo }} 
                style={styles.teamLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=NFL' }}
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
                defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=NFL' }}
              />
              {/* Possession indicator for home team (not during halftime) */}
              {item.situation?.possession && item.homeTeam?.id && 
               item.situation.possession === item.homeTeam.id && 
               item.status && item.status.toLowerCase() !== 'halftime' && (
                <Text style={[styles.possessionIndicator, styles.homePossession]}>🏈</Text>
              )}
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
          {/* Show down and distance for in-progress games (but not halftime) */}
          {item.situation?.shortDownDistanceText && 
           !item.isCompleted && 
           item.status && item.status.toLowerCase() !== 'halftime' && (
            <Text style={styles.downDistance}>{item.situation.shortDownDistanceText}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#013369" />
        <Text style={styles.loadingText}>Loading NFL Scoreboard...</Text>
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
            colors={['#013369']}
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
    color: '#013369',
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
    color: '#013369',
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
  downDistance: {
    fontSize: 12,
    color: '#013369',
    fontWeight: '600',
    marginTop: 2,
  },
  teamLogoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  possessionIndicator: {
    fontSize: 12,
    position: 'absolute',
    zIndex: 10,
  },
  awayPossession: {
    right: -5,
    top: -2,
  },
  homePossession: {
    left: -5,
    top: -2,
  },
  dateHeader: {
    backgroundColor: '#013369',
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
    backgroundColor: '#013369',
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

export default NFLScoreboardScreen;
