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
import { Ionicons } from '@expo/vector-icons';
import { NBAService } from '../../services/NBAService';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';

const TeamLogo = ({ teamAbbreviation, size, style, iconStyle }) => {
  const { colors, getTeamLogoUrl } = useTheme();
  const [imageError, setImageError] = useState(false);
  
  const logoUri = getTeamLogoUrl('nba', teamAbbreviation);
  
  if (!logoUri || imageError) {
    return (
      <Ionicons 
        name="basketball" 
        size={size} 
        color={colors.primary} 
        style={iconStyle}
      />
    );
  }
  
  return (
    <Image
      source={{ uri: logoUri }}
      style={style}
      onError={() => setImageError(true)}
    />
  );
};

const NBAScoreboardScreen = ({ navigation }) => {
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const { isFavorite } = useFavorites();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDateFilter, setSelectedDateFilter] = useState('today');
  const [gameCache, setGameCache] = useState({ yesterday: null, today: null, upcoming: null });
  const [cacheTimestamps, setCacheTimestamps] = useState({ yesterday: 0, today: 0, upcoming: 0 });
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const [updateInterval, setUpdateInterval] = useState(null);
  const hasPreloadedRef = useRef(false);
  const hasLoggedFirstGameRef = useRef(false);

  const getCacheDuration = (filter) => (filter === 'today' || filter === 'upcoming') ? 30000 : 300000;

  const getYesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d; };
  const getToday = () => new Date();
  const getTomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d; };

  const formatDateForAPI = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`; // ESPN NBA expects YYYYMMDD
  };

  const getDateRange = (dateFilter) => {
    switch (dateFilter) {
      case 'yesterday': { const d = getYesterday(); return { startDate: d, endDate: d }; }
      case 'today': { const d = getToday(); return { startDate: d, endDate: d }; }
      case 'upcoming': { const start = getTomorrow(); const end = new Date(start); end.setDate(end.getDate() + 5); return { startDate: start, endDate: end }; }
      default: return { startDate: getToday(), endDate: getToday() };
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      setIsScreenFocused(true);
      return () => {
        setIsScreenFocused(false);
        if (updateInterval) {
          clearInterval(updateInterval);
        }
      };
    }, [])
  );

  useEffect(() => {
    loadScoreboard();
    if ((selectedDateFilter === 'today' || selectedDateFilter === 'upcoming') && isScreenFocused) {
      const interval = setInterval(() => loadScoreboard(true, selectedDateFilter), 2000);
      setUpdateInterval(interval);
      return () => clearInterval(interval);
    } else {
      if (updateInterval) { clearInterval(updateInterval); setUpdateInterval(null); }
    }
  }, [selectedDateFilter, isScreenFocused]);

  useEffect(() => {
    if (hasPreloadedRef.current) return;
    hasPreloadedRef.current = true;
    const t = setTimeout(() => {
      if (selectedDateFilter !== 'yesterday') loadScoreboard(true, 'yesterday');
      if (selectedDateFilter !== 'upcoming') loadScoreboard(true, 'upcoming');
    }, 1000);
    return () => clearTimeout(t);
  }, []);

  const getNoGamesMessage = (filter) => {
    if (filter === 'yesterday') return 'No games scheduled for yesterday';
    if (filter === 'today') return 'No games scheduled for today';
    return 'No upcoming games scheduled';
  };

  const loadScoreboard = async (silent = false, dateFilter = selectedDateFilter) => {
    try {
      const now = Date.now();
      const cached = gameCache[dateFilter];
      const cacheTime = cacheTimestamps[dateFilter];
      const cacheDuration = getCacheDuration(dateFilter);
      const isCacheValid = cached && (now - cacheTime) < cacheDuration;

      if (isCacheValid && !silent) { setGames(cached); setLoading(false); if (dateFilter === 'today' || dateFilter === 'upcoming') loadScoreboard(true, dateFilter); return; }
      if (!isCacheValid && !silent) setLoading(true);

      const { startDate, endDate } = getDateRange(dateFilter);
      const formattedStart = formatDateForAPI(startDate);
      const formattedEnd = formatDateForAPI(endDate);
      const data = await NBAService.getScoreboard(formattedStart, formattedEnd);

      let processed;
      if (!data || !data.events || data.events.length === 0) {
        processed = [{ type: 'no-games', message: getNoGamesMessage(dateFilter) }];
      } else {
        const grouped = groupGamesByDate(data.events.map(e => NBAService.formatGameForMobile(e)).filter(Boolean));
        processed = [];
        Object.keys(grouped).sort((a,b) => new Date(a) - new Date(b)).forEach(date => {
          processed.push({ type: 'header', date: formatDateHeader(date) });
          processed.push(...grouped[date]);
        });
      }

      // One-time console.log of the first actual game item (skip headers/no-games)
      if (!hasLoggedFirstGameRef.current) {
        const firstGame = processed.find(p => p && p.type !== 'header' && p.type !== 'no-games');
        if (firstGame) {
          // Log only once
          console.log('[Scoreboard] First game retrieved:', firstGame);
          hasLoggedFirstGameRef.current = true;
        }
      }

      setGameCache(prev => ({ ...prev, [dateFilter]: processed }));
      setCacheTimestamps(prev => ({ ...prev, [dateFilter]: Date.now() }));
      if (dateFilter === selectedDateFilter) setGames(processed);
    } catch (e) {
      if (!silent) { Alert.alert('Error', 'Failed to load NBA games'); console.error(e); }
    } finally {
      if (!silent) { setLoading(false); setRefreshing(false); }
    }
  };

  const groupGamesByDate = (gamesArr) => {
    const groups = {};
    gamesArr.forEach(g => {
      const dateKey = new Date(g.date).toDateString();
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(g);
    });
    // sort within
    Object.keys(groups).forEach(k => {
      groups[k].sort((a,b) => {
        // live first (use isLiveGame which ignores zero clocks)
        const p = (g) => g.isCompleted ? 2 : (isLiveGame(g) ? 0 : 1);
        const pa = p(a), pb = p(b);
        if (pa !== pb) return pa - pb;
        return new Date(a.date) - new Date(b.date);
      });
    });
    return groups;
  };

  const formatDateHeader = (dateString) => {
    const d = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };

  // Return display text for the top-right of the game header
  const hasMeaningfulClock = (clock) => {
    if (!clock) return false;
    // clock might be an object with displayValue/summary
    const clockStr = (typeof clock === 'object' && clock !== null)
      ? (clock.displayValue || clock.summary || '')
      : String(clock);
    const s = clockStr.trim();
    // If clock is all zeros like '0:00' or '00:00' treat as not meaningful
    if (/^0+(:0+)*$/i.test(s.replace(/\s/g, ''))) return false;
    return /\d/.test(s);
  };

  // Normalize some abbreviations ESPN uses to match our logo keys
  const normalizeAbbreviation = (abbrev) => {
    if (!abbrev) return abbrev;
    const a = String(abbrev).toLowerCase();
    const map = {
    };
    return (map[a] || abbrev).toString();
  };

  const isLiveGame = (item) => {
    // Check for various live game status values
    if (item.gameStatus !== 'live' && item.gameStatus !== 'in') return false;
    // NBA games show quarter info and halftime
    const statusText = (item.status || '').toString();
    const isHalftime = /halftime/i.test(statusText);
    const isEndOf = /end of/i.test(statusText);
    return (!item.isCompleted) && (isHalftime || isEndOf || hasMeaningfulClock(item.displayClock));
  };

  const getGameTimeText = (item) => {
    const isLive = isLiveGame(item);
    if (isLive) {
      // item.displayClock might be an object with displayValue/summary
      const clockRaw = item.displayClock;
      const clock = (typeof clockRaw === 'object' && clockRaw !== null)
        ? (clockRaw.displayValue || clockRaw.summary || '')
        : String(clockRaw || '');
      return clock;
    }
    // For scheduled or finished games show the start time
    if (item.date) {
      try {
        const d = new Date(item.date);
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      } catch (e) {
        return '';
      }
    }
    return '';
  };

  const getStatusColor = (item) => {
    if (item.isCompleted) return theme.success;
    if (isLiveGame(item)) return colors.primary;
    return theme.textSecondary;
  };

  const getStatusText = (item) => {
    if (item.isCompleted) return 'Final';
    
    const isLive = isLiveGame(item);
    console.log('getStatusText debug:', {
      gameId: item.id,
      gameStatus: item.gameStatus,
      status: item.status,
      isCompleted: item.isCompleted,
      isLive: isLive,
      displayClock: item.displayClock
    });
    
    if (isLive) {
      // Construct live status from available fields
      const clock = item.displayClock || '';
      const period = item.period || 1;
      
      let periodText;
      if (period === 1) periodText = '1st';
      else if (period === 2) periodText = '2nd';
      else if (period === 3) periodText = '3rd';
      else if (period === 4) periodText = '4th';
      else if (period === 5) periodText = 'OT';
      else periodText = `${period - 4}OT`;
      
      if (item.status && /halftime/i.test(item.status)) {
        return 'Halftime';
      }

      if (clock) {
        return `${clock} - ${periodText}`;
      }
      return `Q${period}`;
    }
    return getGameTimeText(item);
  };

  const handleGamePress = (item) => {
    if (item.type === 'no-games' || item.type === 'header') return;
    navigation.navigate('GameDetails', { 
      gameId: item.id, 
      sport: 'nba',
      homeTeam: item.homeTeam,
      awayTeam: item.awayTeam
    });
  };

  const handleTeamPress = (team) => {
    navigation.navigate('TeamPage', { 
      teamId: team.id, 
      sport: 'nba',
      teamName: team.displayName,
      teamAbbreviation: team.abbreviation
    });
  };

  // Helper function to get NBA team ID for favorites
  const getNBATeamId = (team) => {
    const abbrToIdMap = {
      'atl': '1', 'bos': '2', 'bkn': '17', 'cha': '30', 'chi': '4', 'cle': '5',
      'dal': '6', 'den': '7', 'det': '8', 'gs': '9', 'hou': '10', 'ind': '11',
      'lac': '12', 'lal': '13', 'mem': '29', 'mia': '14', 'mil': '15', 'min': '16',
      'no': '3', 'nyk': '18', 'okc': '25', 'orl': '19', 'phi': '20', 'phx': '21',
      'por': '22', 'sac': '23', 'sa': '24', 'tor': '28', 'uta': '26', 'wsh': '27'
    };
    return team?.id || abbrToIdMap[String(team?.abbreviation).toLowerCase()] || null;
  };

  const renderDateFilter = () => (
    <View style={[styles.filterContainer, { backgroundColor: theme.surface }]}>
      {['yesterday', 'today', 'upcoming'].map(filter => (
        <TouchableOpacity
          key={filter}
          style={[
            styles.filterButton,
            { backgroundColor: selectedDateFilter === filter ? colors.primary : 'transparent' }
          ]}
          onPress={() => setSelectedDateFilter(filter)}
        >
          <Text
            allowFontScaling={false}
            style={[
              styles.filterText,
              { color: selectedDateFilter === filter ? '#fff' : theme.text }
            ]}
          >
            {filter === 'yesterday' ? 'Yesterday' : filter === 'today' ? 'Today' : 'Upcoming'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderGameItem = ({ item }) => {
    if (item.type === 'no-games') {
      return (
        <View style={[styles.noGamesContainer, { backgroundColor: theme.surface }]}>
          <Ionicons name="basketball-outline" size={48} color={theme.textSecondary} />
          <Text allowFontScaling={false} style={[styles.noGamesText, { color: theme.textSecondary }]}>
            {item.message}
          </Text>
        </View>
      );
    }

    if (item.type === 'header') {
      return (
        <View style={[styles.dateHeader, { backgroundColor: theme.background }]}>
          <Text allowFontScaling={false} style={[styles.dateHeaderText, { color: theme.text }]}>
            {item.date}
          </Text>
        </View>
      );
    }

    const statusText = getStatusText(item);
    const statusColor = getStatusColor(item);
    const isLive = isLiveGame(item);
    const isScheduled = item.status === 'Scheduled';

    const awayWinner = item.isCompleted && !isLive && item.awayTeam.score > item.homeTeam.score;
    const homeWinner = item.isCompleted && !isLive && item.homeTeam.score > item.awayTeam.score;

    return (
      <TouchableOpacity
        style={[styles.gameCard, { backgroundColor: theme.surface }]}
        onPress={() => handleGamePress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.gameHeader}>
          <View style={styles.gameStatus}>
            <Text
              allowFontScaling={false}
              style={[
                styles.statusText,
                { color: statusColor },
                isLive && styles.liveStatusText
              ]}
            >
              {statusText}
            </Text>
            {isLive && <View style={[styles.liveDot, { backgroundColor: colors.primary }]} />}
          </View>
        </View>

        <View style={styles.gameContent}>
          {/* Away Team */}
          <TouchableOpacity
            style={styles.teamRow}
            onPress={() => handleTeamPress(item.awayTeam)}
            activeOpacity={0.7}
          >
            <View style={styles.teamInfo}>
              <TeamLogo 
                teamAbbreviation={normalizeAbbreviation(item.awayTeam.abbreviation)}
                size={32}
                style={[styles.teamLogo, { opacity : (isLive || isScheduled) ? 1 : (awayWinner ? 1 : 0.6) }]}
                iconStyle={{ marginRight: 12 }}
              />
              <View style={styles.teamDetails}>
                <View style={styles.teamNameContainer}>
                  {isFavorite(item.awayTeam.id, 'nba') && (
                    <Ionicons name="star" size={14} color={colors.primary} style={styles.favoriteIcon} />
                  )}
                  <Text allowFontScaling={false} style={[styles.teamName, { color: (isLive || isScheduled) ? (isFavorite(item.awayTeam.id, 'nba') ? colors.primary : theme.text) : (awayWinner ? colors.primary : theme.textSecondary) }]}>
                    {item.awayTeam.displayName}
                  </Text>
                </View>
                <Text allowFontScaling={false} style={[styles.teamRecord, { color: theme.textSecondary }]}>
                  {typeof item.awayTeam.record === 'object' && item.awayTeam.record !== null
                    ? (item.awayTeam.record.displayValue || item.awayTeam.record.summary || '')
                    : (item.awayTeam.record || '')}
                </Text>
              </View>
            </View>
            <Text allowFontScaling={false} style={[styles.teamScore, { color: (isLive || isScheduled) ? theme.text : (awayWinner ? colors.primary : theme.textSecondary) }]}>
              {item.status === 'Scheduled' ? '' : item.awayTeam.score || '-'}
            </Text>
          </TouchableOpacity>

          {/* Home Team */}
          <TouchableOpacity
            style={styles.teamRow}
            onPress={() => handleTeamPress(item.homeTeam)}
            activeOpacity={0.7}
          >
            <View style={styles.teamInfo}>
              <TeamLogo 
                teamAbbreviation={normalizeAbbreviation(item.homeTeam.abbreviation)}
                size={32}
                style={[styles.teamLogo, { opacity : (isLive || isScheduled) ? 1 : (homeWinner ? 1 : 0.6) }]}
                iconStyle={{ marginRight: 12 }}
              />
              <View style={styles.teamDetails}>
                <View style={styles.teamNameContainer}>
                  {isFavorite(item.homeTeam.id, 'nba') && (
                    <Ionicons name="star" size={14} color={colors.primary} style={styles.favoriteIcon} />
                  )}
                  <Text allowFontScaling={false} style={[styles.teamName, { color: (isLive || isScheduled) ? (isFavorite(item.homeTeam.id, 'nba') ? colors.primary : theme.text) : (homeWinner ? colors.primary : theme.textSecondary) }]}>
                    {item.homeTeam.displayName}
                  </Text>
                </View>
                <Text allowFontScaling={false} style={[styles.teamRecord, { color: theme.textSecondary }]}>
                  {typeof item.homeTeam.record === 'object' && item.homeTeam.record !== null
                    ? (item.homeTeam.record.displayValue || item.homeTeam.record.summary || '')
                    : (item.homeTeam.record || '')}
                </Text>
              </View>
            </View>
            <Text allowFontScaling={false} style={[styles.teamScore, { color: (isLive || isScheduled) ? theme.text : (homeWinner ? colors.primary : theme.textSecondary) }]}>
              {item.status === 'Scheduled' ? '' : item.homeTeam.score || '-'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Game Info */}
        {(item.venue || item.broadcast) && (
          <View style={styles.gameFooter}>
            {item.venue && (
              <Text allowFontScaling={false} style={[styles.venueText, { color: theme.textSecondary }]}>
                {item.venue}
              </Text>
            )}
            {item.broadcast && (
              <Text allowFontScaling={false} style={[styles.broadcastText, { color: theme.textSecondary }]}>
                {item.broadcast}
              </Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.text }]}>
          Loading NBA games...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderDateFilter()}
      <FlatList
        data={games}
        renderItem={renderGameItem}
        keyExtractor={(item, index) => item.id || `${item.type}-${index}`}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadScoreboard();
            }}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
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
    marginTop: 16,
    fontSize: 16,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  dateHeader: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  dateHeaderText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  gameCard: {
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  gameStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  liveStatusText: {
    fontWeight: 'bold',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 6,
  },
  gameContent: {
    gap: 12,
  },
  teamRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  teamLogo: {
    width: 32,
    height: 32,
    marginRight: 12,
  },
  teamDetails: {
    flex: 1,
  },
  teamNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamName: {
    fontSize: 16,
    fontWeight: '600',
  },
  favoriteIcon: {
    marginRight: 6,
  },
  teamRecord: {
    fontSize: 12,
    marginTop: 2,
  },
  teamScore: {
    fontSize: 20,
    fontWeight: 'bold',
    minWidth: 30,
    textAlign: 'right',
  },
  gameFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    gap: 4,
  },
  venueText: {
    fontSize: 12,
  },
  broadcastText: {
    fontSize: 12,
  },
  noGamesContainer: {
    padding: 40,
    alignItems: 'center',
    borderRadius: 12,
    marginBottom: 16,
  },
  noGamesText: {
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
});

export default NBAScoreboardScreen;