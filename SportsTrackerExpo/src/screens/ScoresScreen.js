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

const ScoresScreen = ({ route, navigation }) => {
  const { sport } = route.params;
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

  // Helper functions for date management - matching NFLScoreboardScreen logic
  const getYesterday = () => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date;
  };

  const getToday = () => {
    const date = new Date();
    return date;
  };

  const getTomorrow = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date;
  };

  const getUpcoming = () => {
    const tomorrow = getTomorrow();
    const endDate = new Date(tomorrow);
    endDate.setDate(endDate.getDate() + 5); // +6 days total from tomorrow
    return {
      startDate: tomorrow,
      endDate: endDate
    };
  };

  const getDateForFilter = (filter) => {
    switch (filter) {
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
        return getUpcoming();
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

  // Create a hash for comparison to detect changes
  const createGamesHash = (gamesData) => {
    if (!gamesData || !Array.isArray(gamesData)) return '';
    
    return gamesData.map(game => {
      const homeScore = game.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home')?.score || '0';
      const awayScore = game.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away')?.score || '0';
      const status = game.status?.type?.description || 'Unknown';
      const clock = game.status?.displayClock || '';
      return `${game.id}-${homeScore}-${awayScore}-${status}-${clock}`;
    }).join('|');
  };

  // Check if cache is still valid
  const isCacheValid = (filter) => {
    const timestamp = cacheTimestamps[filter];
    const cacheDuration = getCacheDuration(filter);
    return (Date.now() - timestamp) < cacheDuration;
  };

  const loadGames = async (dateFilter = selectedDateFilter, silentUpdate = false) => {
    try {
      if (!silentUpdate) {
        setLoading(true);
      }

      // Check cache first
      if (gameCache[dateFilter] && isCacheValid(dateFilter)) {
        setGames(gameCache[dateFilter]);
        if (!silentUpdate) {
          setLoading(false);
        }
        return;
      }

      const dateRange = getDateForFilter(dateFilter);
      
      // Only use NFL service for now, can be extended for other sports
      let gamesData;
      if (sport === 'nfl') {
        const startDateStr = formatDateForAPI(dateRange.startDate);
        const endDateStr = formatDateForAPI(dateRange.endDate);
        
        const scoreboard = await NFLService.getScoreboard(startDateStr, endDateStr);
        gamesData = scoreboard.events || [];
      } else {
        // Placeholder for other sports
        gamesData = [];
      }

      // Create hash for change detection
      const newHash = createGamesHash(gamesData);

      // For silent updates, only update if there are actual changes
      if (silentUpdate && gameCache[dateFilter]) {
        const oldHash = createGamesHash(gameCache[dateFilter]);
        if (newHash === oldHash) {
          return; // No changes, skip update
        }
      }

      // Update cache
      setGameCache(prev => ({
        ...prev,
        [dateFilter]: gamesData
      }));
      
      setCacheTimestamps(prev => ({
        ...prev,
        [dateFilter]: Date.now()
      }));

      setGames(gamesData);
      setLastUpdateHash(newHash);
      
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

  // Preload data for all filters
  const preloadAllData = async () => {
    if (hasPreloadedRef.current) return;
    hasPreloadedRef.current = true;

    const filters = ['yesterday', 'today', 'upcoming'];
    
    for (const filter of filters) {
      if (!gameCache[filter] || !isCacheValid(filter)) {
        try {
          const dateRange = getDateForFilter(filter);
          let gamesData;
          
          if (sport === 'nfl') {
            const startDateStr = formatDateForAPI(dateRange.startDate);
            const endDateStr = formatDateForAPI(dateRange.endDate);
            
            const scoreboard = await NFLService.getScoreboard(startDateStr, endDateStr);
            gamesData = scoreboard.events || [];
          } else {
            gamesData = [];
          }
          
          setGameCache(prev => ({
            ...prev,
            [filter]: gamesData
          }));
          
          setCacheTimestamps(prev => ({
            ...prev,
            [filter]: Date.now()
          }));
          
          // If this is the currently selected filter, update the display
          if (filter === selectedDateFilter) {
            setGames(gamesData);
            setLoading(false);
          }
        } catch (error) {
          console.error(`Error preloading ${filter} games:`, error);
        }
      }
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    // Clear cache for current filter to force fresh data
    setCacheTimestamps(prev => ({
      ...prev,
      [selectedDateFilter]: 0
    }));
    loadGames(selectedDateFilter, false);
  };

  // Set up auto-refresh only for live games
  useEffect(() => {
    if (!isScreenFocused) return;

    const interval = setInterval(() => {
      // Only auto-refresh if there are live games or today's games
      if (selectedDateFilter === 'today' || selectedDateFilter === 'upcoming') {
        loadGames(selectedDateFilter, true);
      }
    }, 30000); // 30 seconds for live updates

    setUpdateInterval(interval);

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [selectedDateFilter, isScreenFocused]);

  // Load initial data and preload others
  useEffect(() => {
    loadGames(selectedDateFilter);
    // Small delay before preloading to not interfere with initial load
    setTimeout(preloadAllData, 1000);
  }, [selectedDateFilter, sport]);

  // Handle screen focus/blur
  useFocusEffect(
    React.useCallback(() => {
      setIsScreenFocused(true);
      
      return () => {
        setIsScreenFocused(false);
        if (updateInterval) {
          clearInterval(updateInterval);
          setUpdateInterval(null);
        }
      };
    }, [updateInterval])
  );

  const handleGamePress = (game) => {
    navigation.navigate('GameDetails', {
      gameId: game.id,
      sport: sport
    });
  };

  const renderGame = ({ item: game }) => {
    const competition = game.competitions?.[0];
    if (!competition) return null;

    const homeTeam = competition.competitors?.find(c => c.homeAway === 'home');
    const awayTeam = competition.competitors?.find(c => c.homeAway === 'away');
    
    if (!homeTeam || !awayTeam) return null;

    const gameStatus = game.status?.type?.description || 'Unknown';
    const isLive = gameStatus.includes('In Progress') || gameStatus.includes('Halftime') || 
                   gameStatus.includes('End of') || gameStatus.includes('Overtime');
    const isFinal = gameStatus.includes('Final');
    
    const displayClock = game.status?.displayClock;
    const period = game.status?.period;
    
    let statusText = gameStatus;
    if (isLive && displayClock) {
      statusText = `${displayClock}`;
      if (period) {
        statusText += ` - ${period === 1 ? '1st' : period === 2 ? '2nd' : period === 3 ? '3rd' : period === 4 ? '4th' : `${period}th`}`;
      }
    }

    return (
      <TouchableOpacity 
        style={[
          styles.gameCard,
          isLive && styles.liveGameCard
        ]} 
        onPress={() => handleGamePress(game)}
        activeOpacity={0.7}
      >
        <View style={styles.gameHeader}>
          <Text style={[
            styles.gameStatus,
            isLive && styles.liveStatus,
            isFinal && styles.finalStatus
          ]}>
            {statusText}
          </Text>
          {isLive && <View style={styles.liveIndicator} />}
        </View>

        <View style={styles.teamsContainer}>
          {/* Away Team */}
          <View style={styles.teamContainer}>
            <Image 
              source={{ uri: NFLService.convertToHttps(awayTeam.team?.logo || awayTeam.team?.logos?.[0]?.href) }}
              style={styles.teamLogo}
              defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=NFL' }}
            />
            <View style={styles.teamInfo}>
              <Text style={styles.teamName}>{awayTeam.team?.displayName || awayTeam.team?.name}</Text>
              <Text style={styles.teamRecord}>
                {awayTeam.records?.[0]?.summary || `${awayTeam.wins || 0}-${awayTeam.losses || 0}`}
              </Text>
            </View>
            <Text style={[
              styles.teamScore,
              isFinal && parseInt(awayTeam.score || '0') < parseInt(homeTeam.score || '0') && styles.losingScore
            ]}>
              {awayTeam.score || '0'}
            </Text>
          </View>

          {/* Home Team */}
          <View style={styles.teamContainer}>
            <Image 
              source={{ uri: NFLService.convertToHttps(homeTeam.team?.logo || homeTeam.team?.logos?.[0]?.href) }}
              style={styles.teamLogo}
              defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=NFL' }}
            />
            <View style={styles.teamInfo}>
              <Text style={styles.teamName}>{homeTeam.team?.displayName || homeTeam.team?.name}</Text>
              <Text style={styles.teamRecord}>
                {homeTeam.records?.[0]?.summary || `${homeTeam.wins || 0}-${homeTeam.losses || 0}`}
              </Text>
            </View>
            <Text style={[
              styles.teamScore,
              isFinal && parseInt(homeTeam.score || '0') < parseInt(awayTeam.score || '0') && styles.losingScore
            ]}>
              {homeTeam.score || '0'}
            </Text>
          </View>
        </View>

        {/* Additional game info */}
        {game.competitions?.[0]?.venue && (
          <Text style={styles.venueText}>
            {game.competitions[0].venue.fullName}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderDateFilter = () => (
    <View style={styles.dateFilterContainer}>
      {[
        { key: 'yesterday', label: 'Yesterday' },
        { key: 'today', label: 'Today' },
        { key: 'upcoming', label: 'Tomorrow' }
      ].map(filter => (
        <TouchableOpacity
          key={filter.key}
          style={[
            styles.dateFilterButton,
            selectedDateFilter === filter.key && styles.activeDateFilterButton
          ]}
          onPress={() => {
            setSelectedDateFilter(filter.key);
          }}
        >
          <Text style={[
            styles.dateFilterText,
            selectedDateFilter === filter.key && styles.activeDateFilterText
          ]}>
            {filter.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (loading && games.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#013369" />
        <Text style={styles.loadingText}>Loading {sport.toUpperCase()} games...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderDateFilter()}
      
      <FlatList
        data={games}
        renderItem={renderGame}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.gamesList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              No {sport.toUpperCase()} games available for {selectedDateFilter}
            </Text>
          </View>
        }
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
  dateFilterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  dateFilterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  activeDateFilterButton: {
    backgroundColor: '#013369',
  },
  dateFilterText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  activeDateFilterText: {
    color: '#fff',
  },
  gamesList: {
    padding: 16,
  },
  gameCard: {
    backgroundColor: '#fff',
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
  liveGameCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF0000',
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gameStatus: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  liveStatus: {
    color: '#FF0000',
    fontWeight: 'bold',
  },
  finalStatus: {
    color: '#333',
    fontWeight: 'bold',
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF0000',
  },
  teamsContainer: {
    marginBottom: 8,
  },
  teamContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
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
    marginBottom: 2,
  },
  teamRecord: {
    fontSize: 12,
    color: '#666',
  },
  teamScore: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    minWidth: 40,
    textAlign: 'center',
  },
  losingScore: {
    color: '#999',
  },
  venueText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});

export default ScoresScreen;
