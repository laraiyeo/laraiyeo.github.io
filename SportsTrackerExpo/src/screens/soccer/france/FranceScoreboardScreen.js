import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Dimensions
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FranceServiceEnhanced } from '../../../services/soccer/FranceServiceEnhanced';
import { useTheme } from '../../../context/ThemeContext';
import { useFavorites } from '../../../context/FavoritesContext';

const { width } = Dimensions.get('window');

const FranceScoreboardScreen = ({ navigation, route }) => {
  const { theme, colors, isDarkMode } = useTheme();
  const { isFavorite } = useFavorites();
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
  
  // TeamLogoImage component with dark mode and fallback support
  const TeamLogoImage = React.memo(({ teamId, style }) => {
    // Initialize with the correct logo source immediately to prevent flashing
    const [logoSource, setLogoSource] = useState(() => {
      if (teamId) {
        const logos = getTeamLogo(teamId, isDarkMode);
        return { uri: logos.primaryUrl };
      } else {
        return require('../../../../assets/soccer.png');
      }
    });
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
      // Only update if teamId or isDarkMode actually changed
      const newLogos = teamId ? getTeamLogo(teamId, isDarkMode) : null;
      const newSource = teamId ? { uri: newLogos.primaryUrl } : require('../../../../assets/soccer.png');
      
      // Check if the new source is different from current
      const currentUri = logoSource?.uri;
      const newUri = newSource?.uri;
      
      if (currentUri !== newUri) {
        setLogoSource(newSource);
        setRetryCount(0);
      }
    }, [teamId, isDarkMode]);

    const handleError = () => {
      if (retryCount === 0) {
        const logos = getTeamLogo(teamId, isDarkMode);
        setLogoSource({ uri: logos.fallbackUrl });
        setRetryCount(1);
      } else {
        // Final fallback - use soccer.png asset for all cases
        setLogoSource(require('../../../../assets/soccer.png'));
      }
    };

    return (
      <Image
        style={style}
        source={logoSource}
        onError={handleError}
        resizeMode="contain"
      />
    );
  });

  // Enhanced logo function with dark mode support and fallbacks
  const getTeamLogo = (teamId, isDarkMode) => {
    const primaryUrl = isDarkMode
      ? `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`
      : `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
    
    const fallbackUrl = isDarkMode
      ? `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`
      : `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`;

    return { primaryUrl, fallbackUrl };
  };
  
  // Cache duration: 30 seconds for today and upcoming (live/soon-to-be-live games), 5 minutes for others
  const getCacheDuration = (filter) => {
    return (filter === 'today' || filter === 'upcoming') ? 30000 : 300000; // 30s for today/upcoming, 5min for others
  };

  const getNoGamesMessage = (dateFilter) => {
    switch (dateFilter) {
      case 'yesterday':
        return 'No matches scheduled for yesterday';
      case 'today':
        return 'No matches scheduled for today';
      case 'upcoming':
        return 'No upcoming matches scheduled';
      default:
        return 'No matches scheduled';
    }
  };

  // Track screen focus to pause/resume updates
  useFocusEffect(
    React.useCallback(() => {
      console.log('FranceScoreboardScreen: Screen focused');
      setIsScreenFocused(true);
      
      return () => {
        console.log('FranceScoreboardScreen: Screen unfocused, clearing intervals');
        setIsScreenFocused(false);
        // Clear any existing interval when screen loses focus
        setUpdateInterval(prevInterval => {
          if (prevInterval) clearInterval(prevInterval);
          return null;
        });
      };
    }, [])
  );

  useEffect(() => {
    console.log('FranceScoreboardScreen: Main useEffect triggered for filter:', selectedDateFilter, 'focused:', isScreenFocused);
    // Load the current filter first
    loadScoreboard();
    
    // Set up continuous fetching for 'today' and 'upcoming' - only if screen is focused
    if ((selectedDateFilter === 'today' || selectedDateFilter === 'upcoming') && isScreenFocused) {
      const interval = setInterval(() => {
        loadScoreboard(true, selectedDateFilter);
      }, 30000); // 30 seconds for soccer
      
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
    console.log('FranceScoreboardScreen: Preload useEffect triggered, hasPreloaded:', hasPreloadedRef.current);
    // Only preload if we haven't done it before
    if (hasPreloadedRef.current) {
      console.log('FranceScoreboardScreen: Skipping preload, already done');
      return;
    }
    
    // Mark that we're doing preloading
    hasPreloadedRef.current = true;
    console.log('FranceScoreboardScreen: Starting preload for other filters');
    
    // Preload the other filters in the background after initial load
    const preloadTimer = setTimeout(() => {
      if (selectedDateFilter !== 'yesterday') {
        console.log('FranceScoreboardScreen: Preloading yesterday data');
        loadScoreboard(true, 'yesterday');
      }
      if (selectedDateFilter !== 'upcoming') {
        console.log('FranceScoreboardScreen: Preloading upcoming data');
        loadScoreboard(true, 'upcoming');
      }
    }, 1000); // Wait 1 second after initial load to preload others
    
    return () => clearTimeout(preloadTimer);
  }, []); // Empty dependency array - only run once on mount

  const loadScoreboard = async (silentUpdate = false, dateFilter = selectedDateFilter) => {
    console.log('FranceScoreboardScreen: loadScoreboard called - silentUpdate:', silentUpdate, 'dateFilter:', dateFilter);
    const now = Date.now();
    const cachedData = gameCache[dateFilter];
    const cacheTime = cacheTimestamps[dateFilter];
    const cacheDuration = getCacheDuration(dateFilter);
    const isCacheValid = cachedData && (now - cacheTime) < cacheDuration;
    
    // If we have valid cached data, show it immediately
    if (isCacheValid && !silentUpdate) {
      console.log('FranceScoreboardScreen: Using cached data for', dateFilter);
      setGames(cachedData);
      setLoading(false);
      return;
    }

    try {
      if (!silentUpdate) {
        setLoading(true);
      }

      console.log('FranceScoreboardScreen: Fetching fresh data for', dateFilter);
      const data = await FranceServiceEnhanced.getScoreboard(dateFilter);
      
      // Process games with enhanced data
      const processedGames = await Promise.all((data.events || []).map(async (game) => {
        // Get team logos
        const awayLogo = await FranceServiceEnhanced.getTeamLogoWithFallback(game.competitions[0]?.competitors[1]?.team?.id);
        const homeLogo = await FranceServiceEnhanced.getTeamLogoWithFallback(game.competitions[0]?.competitors[0]?.team?.id);
        
        return {
          ...game,
          awayLogo,
          homeLogo
        };
      }));

      // Stable enhanced sorting: group by day, then by status priority (live/pre/post),
      // then by scheduled start time to keep order stable while live clocks update.
      const sortedGames = processedGames
        .map((g, idx) => ({ g, idx }))
        .sort((x, y) => {
          const a = x.g;
          const b = y.g;
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();

          // Group by calendar day (floor by UTC day)
          const dayA = Math.floor(dateA / (24 * 60 * 60 * 1000));
          const dayB = Math.floor(dateB / (24 * 60 * 60 * 1000));
          if (dayA !== dayB) return dayA - dayB;

          const statusA = a.status?.type?.state;
          const statusB = b.status?.type?.state;
          const getStatusPriority = (status) => {
            switch (status) {
              case 'in': return 1; // Live games first
              case 'pre': return 2; // Upcoming games second
              case 'post': return 3; // Finished games last
              default: return 4; // Unknown status last
            }
          };

          const pA = getStatusPriority(statusA);
          const pB = getStatusPriority(statusB);
          if (pA !== pB) return pA - pB;

          // Same status and same day - order by scheduled start time
          if (dateA !== dateB) return dateA - dateB;

          // Fall back to original index to ensure stable ordering
          return x.idx - y.idx;
        })
        .map(x => x.g);

      // Create hash for change detection
      const currentHash = JSON.stringify(sortedGames.map(g => ({
        id: g.id,
        status: g.status?.type?.state,
        awayScore: g.competitions[0]?.competitors[1]?.score,
        homeScore: g.competitions[0]?.competitors[0]?.score,
        clock: g.status?.displayClock
      })));

      // Update cache
      setGameCache(prev => ({
        ...prev,
        [dateFilter]: sortedGames
      }));
      setCacheTimestamps(prev => ({
        ...prev,
        [dateFilter]: now
      }));

      // Only update state if this is the currently selected filter
      if (dateFilter === selectedDateFilter) {
        setGames(sortedGames);
        
        // Check if there were actual changes
        if (currentHash !== lastUpdateHash) {
          setLastUpdateHash(currentHash);
          console.log('FranceScoreboardScreen: Data updated for', dateFilter);
        }
      }

      setLoading(false);
    } catch (error) {
      console.error('FranceScoreboardScreen: Error loading scoreboard:', error);
      if (!silentUpdate) {
        setLoading(false);
        Alert.alert('Error', 'Failed to load matches. Please try again.');
      }
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // Clear cache for current filter to force fresh data
    setCacheTimestamps(prev => ({
      ...prev,
      [selectedDateFilter]: 0
    }));
    await loadScoreboard(false, selectedDateFilter);
    setRefreshing(false);
  };

  const handleDateFilterChange = (filter) => {
    if (filter === selectedDateFilter) return;
    
    console.log('FranceScoreboardScreen: Changing filter to:', filter);
    setSelectedDateFilter(filter);
    
    // Check if we have cached data for this filter
    const now = Date.now();
    const cachedData = gameCache[filter];
    const cacheTime = cacheTimestamps[filter];
    const cacheDuration = getCacheDuration(filter);
    const isCacheValid = cachedData && (now - cacheTime) < cacheDuration;
    
    if (isCacheValid) {
      console.log('FranceScoreboardScreen: Using cached data for filter change to:', filter);
      setGames(cachedData);
      setLoading(false);
    } else {
      console.log('FranceScoreboardScreen: No valid cache for filter:', filter, '- will fetch fresh data');
    }
  };

  const getMatchStatus = (game) => {
    const status = game.status;
    const state = status?.type?.state;
    
    if (state === 'pre') {
      // Match not started - show date and time
      const date = new Date(game.date);
      const today = new Date();
      const isToday = date.toDateString() === today.toDateString();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const isYesterday = date.toDateString() === yesterday.toDateString();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const isTomorrow = date.toDateString() === tomorrow.toDateString();
      
      let dateText = '';
      if (isToday) {
        dateText = 'Today';
      } else if (isYesterday) {
        dateText = 'Yesterday';
      } else if (isTomorrow) {
        dateText = 'Tomorrow';
      } else {
        dateText = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
      
      const timeText = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      return {
        text: 'Scheduled',
        time: timeText,
        detail: dateText,
        isLive: false,
        isPre: true,
        isPost: false
      };
    } else if (state === 'in') {
      // Match in progress - show clock time and half info
      const displayClock = status.displayClock || "0'";
      const period = status.period;
      
      // Check if it's halftime
      if (status.type?.description === "Halftime") {
        return {
          text: 'Live',
          time: status.type.description, // "Halftime"
          detail: status.type.shortDetail, // "HT"
          isLive: true,
          isPre: false,
          isPost: false
        };
      }
      
      // Determine half based on period
      let halfText = '';
      if (period === 1) {
        halfText = '1st Half';
      } else if (period === 2) {
        halfText = '2nd Half';
      } else if (period > 2) {
        halfText = 'Extra Time';
      } else {
        halfText = 'Live';
      }
      
      return {
        text: 'Live',
        time: displayClock,
        detail: halfText,
        isLive: true,
        isPre: false,
        isPost: false
      };
    } else {
      // Match finished
      return {
        text: 'Final',
        time: '',
        detail: status.type?.description || '',
        isLive: false,
        isPre: false,
        isPost: true
      };
    }
  };

  const handleGamePress = (game) => {
    console.log('FranceScoreboardScreen: Game pressed:', game.id);
    navigation.navigate('FranceGameDetails', {
      gameId: game.id,
      sport: 'French',
      competition: game.competitionName || 'France',
      homeTeam: game.competitions[0]?.competitors[0]?.team,
      awayTeam: game.competitions[0]?.competitors[1]?.team
    });
  };

  const renderDateFilter = () => {
    const filters = [
      { key: 'yesterday', label: 'Yesterday' },
      { key: 'today', label: 'Today' },
      { key: 'upcoming', label: 'Upcoming' }
    ];

    return (
      <View style={[styles.filterContainer, { backgroundColor: theme.surface }]}>
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[
              styles.filterButton,
              selectedDateFilter === filter.key && { backgroundColor: colors.primary }
            ]}
            onPress={() => handleDateFilterChange(filter.key)}
          >
            <Text allowFontScaling={false}
              style={[
                styles.filterText,
                { color: selectedDateFilter === filter.key ? '#fff' : theme.text }
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderGameItem = ({ item: game }) => {
    const competition = game.competitions[0];
    const homeTeam = competition?.competitors[0];
    const awayTeam = competition?.competitors[1];
    const matchStatus = getMatchStatus(game);

    return (
      <TouchableOpacity
        style={[styles.gameCard, { backgroundColor: theme.surface }]}
        onPress={() => handleGamePress(game)}
        activeOpacity={0.7}
      >
        {/* League Header */}
        <View style={[styles.leagueHeader, { backgroundColor: theme.border }]}>
          <Text allowFontScaling={false} style={[styles.leagueText, { color: colors.primary }]}>
            {game.competitionName || 'La Liga'}
          </Text>
        </View>

        {/* Match Content */}
        <View style={styles.matchContent}>
          {/* Home Team Section */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoRow}>
              <TeamLogoImage
                teamId={homeTeam?.team?.id}
                style={[
                  styles.teamLogo,
                  matchStatus.isPost && homeTeam?.score < awayTeam?.score && styles.losingTeamLogo
                ]}
              />
              {(matchStatus.isLive || matchStatus.isPost) && (
                <Text allowFontScaling={false} style={[
                  styles.teamScore, 
                  { color: theme.text },
                  matchStatus.isPost && homeTeam?.score < awayTeam?.score && styles.losingScore
                ]}>
                  {homeTeam?.score || '0'}
                </Text>
              )}
            </View>
            <Text allowFontScaling={false} style={[
              styles.teamAbbreviation, 
              { color: isFavorite(homeTeam?.team?.id) ? colors.primary : theme.text },
              matchStatus.isPost && homeTeam?.score < awayTeam?.score && styles.losingTeamName
            ]}>
              {isFavorite(homeTeam?.team?.id) ? '★ ' : ''}{homeTeam?.team?.abbreviation || homeTeam?.team?.displayName || 'TBD'}
            </Text>
          </View>

          {/* Status Section */}
          <View style={styles.statusSection}>
            <Text allowFontScaling={false} style={[
              styles.gameStatus,
              { color: matchStatus.isLive ? theme.error : theme.text }
            ]}>
              {matchStatus.text}
            </Text>
            
            {matchStatus.time && (
              <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                {matchStatus.time}
              </Text>
            )}
            
            {matchStatus.detail && (
              <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                {matchStatus.detail}
              </Text>
            )}
          </View>

          {/* Away Team Section */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoRow}>
              {(matchStatus.isLive || matchStatus.isPost) && (
                <Text allowFontScaling={false} style={[
                  styles.teamScore, 
                  { color: theme.text },
                  matchStatus.isPost && awayTeam?.score < homeTeam?.score && styles.losingScore
                ]}>
                  {awayTeam?.score || '0'}
                </Text>
              )}
              <TeamLogoImage
                teamId={awayTeam?.team?.id}
                style={[
                  styles.teamLogo,
                  matchStatus.isPost && awayTeam?.score < homeTeam?.score && styles.losingTeamLogo
                ]}
              />
            </View>
            <Text allowFontScaling={false} style={[
              styles.teamAbbreviation, 
              { color: isFavorite(awayTeam?.team?.id) ? colors.primary : theme.text },
              matchStatus.isPost && awayTeam?.score < homeTeam?.score && styles.losingTeamName
            ]}>
              {isFavorite(awayTeam?.team?.id) ? '★ ' : ''}{awayTeam?.team?.abbreviation || awayTeam?.team?.displayName || 'TBD'}
            </Text>
          </View>
        </View>

        {/* Venue Section */}
        {competition?.venue?.fullName && (
          <View style={[styles.venueSection, { borderTopColor: theme.border }]}>
            <Text allowFontScaling={false} style={[styles.venueText, { color: theme.textSecondary }]}>
              {competition.venue.fullName}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading && games.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {renderDateFilter()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.text }]}>
            Loading matches...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderDateFilter()}
      
      {games.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text allowFontScaling={false} style={[styles.emptyText, { color: theme.textSecondary }]}>
            {getNoGamesMessage(selectedDateFilter)}
          </Text>
        </View>
      ) : (
        <FlatList
          data={games}
          renderItem={renderGameItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    borderRadius: 20,
    alignItems: 'center',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  listContainer: {
    padding: 16,
  },
  gameCard: {
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    overflow: 'hidden',
  },
  leagueHeader: {
    backgroundColor: '#f8f9fa',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  leagueText: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  matchContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 12,
  },
  teamSection: {
    flex: 1,
    alignItems: 'center',
  },
  teamLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamLogo: {
    width: 40,
    height: 40,
  },
  losingTeamLogo: {
    opacity: 0.5,
  },
  teamScore: {
    fontSize: 24,
    fontWeight: 'bold',
    marginHorizontal: 8,
  },
  losingScore: {
    color: '#999',
  },
  teamAbbreviation: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  losingTeamName: {
    color: '#999',
  },
  statusSection: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  gameStatus: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  gameDateTime: {
    fontSize: 11,
    marginBottom: 2,
  },
  venueSection: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  venueText: {
    fontSize: 11,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default FranceScoreboardScreen;
