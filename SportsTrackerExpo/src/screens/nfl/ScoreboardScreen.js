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
import { NFLService } from '../../services/NFLService';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';

const NFLScoreboardScreen = ({ navigation }) => {
  const { theme, colors, getTeamLogoUrl } = useTheme();
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
  
  // Helper function to get NFL team abbreviation from ESPN team data
  const getNFLTeamAbbreviation = (espnTeam) => {
    // First try direct abbreviation if available
    if (espnTeam?.abbreviation) {
      return espnTeam.abbreviation;
    }
    
    // ESPN team ID to abbreviation mapping
    const teamMapping = {
      '2': 'BUF', '15': 'MIA', '17': 'NE', '20': 'NYJ',
      '33': 'BAL', '4': 'CIN', '5': 'CLE', '23': 'PIT',
      '34': 'HOU', '11': 'IND', '30': 'JAX', '10': 'TEN',
      '7': 'DEN', '12': 'KC', '13': 'LV', '24': 'LAC',
      '6': 'DAL', '19': 'NYG', '21': 'PHI', '28': 'WAS',
      '3': 'CHI', '8': 'DET', '9': 'GB', '16': 'MIN',
      '1': 'ATL', '29': 'CAR', '18': 'NO', '27': 'TB',
      '22': 'ARI', '14': 'LAR', '25': 'SF', '26': 'SEA'
    };
    
    const abbr = teamMapping[espnTeam?.id?.toString()];
    if (abbr) {
      return abbr;
    }
    
    console.warn('No NFL abbreviation mapping found for team:', espnTeam?.id);
    return null;
  };
  
  // Helper function to get NFL team ID for favorites
  const getNFLTeamId = (espnTeam) => {
    // ESPN team abbreviations to NFL team IDs mapping
    const teamMapping = {
      'BUF': '2', 'MIA': '15', 'NE': '17', 'NYJ': '20',
      'BAL': '33', 'CIN': '4', 'CLE': '5', 'PIT': '23',
      'HOU': '34', 'IND': '11', 'JAX': '30', 'TEN': '10',
      'DEN': '7', 'KC': '12', 'LV': '13', 'LAC': '24',
      'DAL': '6', 'NYG': '19', 'PHI': '21', 'WAS': '28',
      'CHI': '3', 'DET': '8', 'GB': '9', 'MIN': '16',
      'ATL': '1', 'CAR': '29', 'NO': '18', 'TB': '27',
      'ARI': '22', 'LAR': '14', 'SF': '25', 'SEA': '26'
    };

    console.log('Team abbreviation:', espnTeam.abbreviation, 'ESPN ID:', espnTeam.id);
    
    let nflId = teamMapping[espnTeam.abbreviation];
    
    if (!nflId) {
      console.warn('No NFL ID mapping found for team:', espnTeam.abbreviation, 'ESPN ID:', espnTeam.id, 'Using ESPN ID as fallback');
      return espnTeam.id;
    }
    
    console.log('Final NFL ID:', nflId);
    return nflId;
  };
  
  // TeamLogoImage component with fallback support  
  const TeamLogoImage = React.memo(({ team, style, isLosingTeam = false }) => {
    const [logoSource, setLogoSource] = useState(() => {
      const teamAbbr = getNFLTeamAbbreviation(team);
      if (teamAbbr) {
        return { uri: getTeamLogoUrl('nfl', teamAbbr) };
      } else {
        return require('../../../assets/nfl.png');
      }
    });
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
      const teamAbbr = getNFLTeamAbbreviation(team);
      if (teamAbbr) {
        setLogoSource({ uri: getTeamLogoUrl('nfl', teamAbbr) });
        setRetryCount(0);
      } else {
        setLogoSource(require('../../../assets/nfl.png'));
      }
    }, [team]);

    const handleError = () => {
      if (retryCount === 0) {
        const teamAbbr = getNFLTeamAbbreviation(team);
        if (teamAbbr) {
          // Try alternative URL format
          setLogoSource({ uri: `https://a.espncdn.com/i/teamlogos/nfl/500/${teamAbbr}.png` });
          setRetryCount(1);
        } else {
          setLogoSource(require('../../../assets/nfl.png'));
        }
      } else {
        // Final fallback
        setLogoSource(require('../../../assets/nfl.png'));
      }
    };

    return (
      <Image
        style={[style, isLosingTeam && styles.losingTeamLogo]}
        source={logoSource}
        onError={handleError}
        resizeMode="contain"
      />
    );
  });
  
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
        
        // Group games by date and sort within each date by status then time
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

        // Determine ordering for statuses: Live -> Scheduled -> Finished
        const statusOrder = (item) => {
          // Map common status shapes to order index
          if (!item || item.isCompleted === false && (item.displayClock || (item.status && (item.status.toLowerCase().includes('quarter') || item.status.toLowerCase().includes('half') || item.status.toLowerCase().includes('overtime'))))) return 0; // Live
          if (!item.isCompleted && item.status && (item.status.toLowerCase().includes('pre') || item.status.toLowerCase().includes('scheduled') || item.status.toLowerCase() === 'scheduled')) return 1; // Scheduled
          // Default: Finished
          return 2;
        };

  // Sort dates in chronological order (earliest date first) so grouping is Day -> Status -> Time
  const sortedDates = Object.keys(gamesByDate).sort((a, b) => new Date(a) - new Date(b));

        // Flatten back to array with date headers and sort games within each date
        const groupedGames = [];
        for (const date of sortedDates) {
          groupedGames.push({ type: 'header', date });

          // Sort the games for this date by status order, then by time/clock
          const sortedForDate = gamesByDate[date].sort((g1, g2) => {
            const s1 = statusOrder(g1);
            const s2 = statusOrder(g2);
            if (s1 !== s2) return s1 - s2;

            // Same status group - sort by appropriate time field
            // For Scheduled: sort by start time ascending
            if (s1 === 1) {
              return g1.date - g2.date;
            }

            // For Live: sort by displayClock (descending so games with more time remaining show first), then by start time
            if (s1 === 0) {
              const c1 = parseClockValue(g1.displayClock || '0');
              const c2 = parseClockValue(g2.displayClock || '0');
              if (c1 !== c2) return c2 - c1; // more time remaining first
              return g1.date - g2.date;
            }

            // For Finished: sort by end/start time descending (most recently finished first)
            return g2.date - g1.date;
          });

          sortedForDate.forEach(game => groupedGames.push({ type: 'game', ...game }));
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

  // Convert a displayClock string like "1:46" or "12:34" into total seconds
  const parseClockValue = (clockStr) => {
    if (!clockStr || typeof clockStr !== 'string') return 0;
    // Remove non-digit/colon chars
    const clean = clockStr.replace(/[^0-9:]/g, '');
    const parts = clean.split(':').map(p => parseInt(p, 10) || 0);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return parts[0] || 0;
  };

  const renderDateHeader = (date) => (
    <View style={[styles.dateHeader, { backgroundColor: colors.primary }]}>
      <Text allowFontScaling={false} style={[styles.dateHeaderText, { color: 'white' }]}>{date}</Text>
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

  const getTeamScoreColor = (item, isAwayTeam) => {
    if (!item.awayTeam || !item.homeTeam) return colors.primary;
    
    const isGameFinal = item.isCompleted;
    const awayScore = parseInt(item.awayTeam.score || '0');
    const homeScore = parseInt(item.homeTeam.score || '0');
    const isLosing = isGameFinal && (
      (isAwayTeam && awayScore < homeScore) || 
      (!isAwayTeam && homeScore < awayScore)
    );
    return isLosing ? theme.textSecondary : colors.primary;
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

  const getTeamNameColor = (item, isAwayTeam) => {
    if (!item.awayTeam || !item.homeTeam) return theme.text;
    
    const isGameFinal = item.isCompleted;
    const awayScore = parseInt(item.awayTeam.score || '0');
    const homeScore = parseInt(item.homeTeam.score || '0');
    const isLosing = isGameFinal && (
      (isAwayTeam && awayScore < homeScore) || 
      (!isAwayTeam && homeScore < awayScore)
    );
    return isLosing ? theme.textSecondary : theme.text;
  };

  const isLosingTeam = (item, isAwayTeam) => {
    if (!item.awayTeam || !item.homeTeam) return false;
    
    const isGameFinal = item.isCompleted;
    const awayScore = parseInt(item.awayTeam.score || '0');
    const homeScore = parseInt(item.homeTeam.score || '0');
    return isGameFinal && (
      (isAwayTeam && awayScore < homeScore) || 
      (!isAwayTeam && homeScore < awayScore)
    );
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
        style={[styles.gameCard, { backgroundColor: theme.surface, shadowColor: theme.text }]}
        onPress={() => navigateToGameDetails(item.id)}
      >
        {/* Game Status */}
        <View style={styles.gameHeader}>
          <Text allowFontScaling={false} style={[styles.gameStatus, { color: colors.primary }]}>{getGameStatusText(item)}</Text>
          {getGameTimeText(item) && (
            <Text allowFontScaling={false} style={[styles.gameClock, { color: theme.textSecondary }]}>{getGameTimeText(item)}</Text>
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
                <Text allowFontScaling={false} style={[styles.possessionIndicator, styles.awayPossession]}>🏈</Text>
              )}
              <TeamLogoImage 
                team={item.awayTeam}
                style={styles.teamLogo}
                isLosingTeam={isLosingTeam(item, true)}
              />
            </View>
            <View style={styles.teamInfo}>
              <Text allowFontScaling={false} style={[
                getTeamNameStyle(item, true), 
                { 
                  color: isFavorite(getNFLTeamId(item.awayTeam)) ? colors.primary : getTeamNameColor(item, true) 
                }
              ]}>
                {isFavorite(getNFLTeamId(item.awayTeam)) && '★ '}
                {item.awayTeam?.displayName || 'TBD'}
              </Text>
              <Text allowFontScaling={false} style={[styles.teamRecord, { color: theme.textSecondary }]}>{item.awayTeam?.record || ''}</Text>
            </View>
            <Text allowFontScaling={false} style={[getTeamScoreStyle(item, true), { color: getTeamScoreColor(item, true) }]}>{item.awayTeam?.score || '0'}</Text>
          </View>

          {/* Home Team */}
          <View style={styles.teamRow}>
            <View style={styles.teamLogoContainer}>
              {/* Possession indicator for home team (not during halftime) */}
              {item.situation?.possession && item.homeTeam?.id && 
               item.situation.possession === item.homeTeam.id && 
               item.status && item.status.toLowerCase() !== 'halftime' && (
                <Text allowFontScaling={false} style={[styles.possessionIndicator, styles.homePossession]}>🏈</Text>
              )}
              <TeamLogoImage 
                team={item.homeTeam}
                style={styles.teamLogo}
                isLosingTeam={isLosingTeam(item, false)}
              />
            </View>
            <View style={styles.teamInfo}>
              <Text allowFontScaling={false} style={[
                getTeamNameStyle(item, false), 
                { 
                  color: isFavorite(getNFLTeamId(item.homeTeam)) ? colors.primary : getTeamNameColor(item, false) 
                }
              ]}>
                {isFavorite(getNFLTeamId(item.homeTeam)) && '★ '}
                {item.homeTeam?.displayName || 'TBD'}
              </Text>
              <Text allowFontScaling={false} style={[styles.teamRecord, { color: theme.textSecondary }]}>{item.homeTeam?.record || ''}</Text>
            </View>
            <Text allowFontScaling={false} style={[getTeamScoreStyle(item, false), { color: getTeamScoreColor(item, false) }]}>{item.homeTeam?.score || '0'}</Text>
          </View>
        </View>

        {/* Game Info */}
        <View style={[styles.gameFooter, { borderTopColor: theme.border }]}>
          <Text allowFontScaling={false} style={[styles.venue, { color: theme.textSecondary }]}>{item.venue || ''}</Text>
          {item.broadcasts && item.broadcasts.length > 0 && (
            <Text allowFontScaling={false} style={[styles.broadcast, { color: theme.textSecondary }]}>{item.broadcasts.join(', ')}</Text>
          )}
          {/* Show down and distance for in-progress games (but not halftime) */}
          {item.situation?.downDistanceText && 
           !item.isCompleted && 
           item.status && item.status.toLowerCase() !== 'halftime' && (
            <Text allowFontScaling={false} style={[styles.downDistance, { color: colors.primary }]}>{item.situation.downDistanceText}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.textSecondary }]}>Loading NFL Scoreboard...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Date Filter Buttons */}
      <View style={[styles.dateFilterContainer, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
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
  },
  gameClock: {
    fontSize: 14,
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
  },
  teamRecord: {
    fontSize: 12,
    marginTop: 2,
  },
  teamScore: {
    fontSize: 24,
    fontWeight: 'bold',
    minWidth: 40,
    textAlign: 'center',
  },
  losingTeamScore: {
    opacity: 0.6,
  },
  losingTeamName: {
    opacity: 0.6,
  },
  losingTeamLogo: {
    opacity: 0.5,
  },
  losingTeamScore: {
    color: '#999',
  },
  losingTeamName: {
    color: '#999',
  },
  gameFooter: {
    borderTopWidth: 1,
    paddingTop: 8,
  },
  venue: {
    fontSize: 12,
    marginBottom: 2,
  },
  broadcast: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  downDistance: {
    fontSize: 12,
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
    // Background color applied dynamically
  },
  dateFilterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  activeFilterText: {
    // Color applied dynamically
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

export default NFLScoreboardScreen;
