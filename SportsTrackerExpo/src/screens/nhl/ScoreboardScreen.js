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
import { NHLService } from '../../services/NHLService';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';

const NHLScoreboardScreen = ({ navigation }) => {
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

  const getCacheDuration = (filter) => (filter === 'today' || filter === 'upcoming') ? 30000 : 300000;

  const getYesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d; };
  const getToday = () => new Date();
  const getTomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d; };

  const formatDateForAPI = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`; // ESPN NHL expects YYYYMMDD for many endpoints
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
      const data = await NHLService.getScoreboard(formattedStart, formattedEnd);

      let processed;
      if (!data || !data.events || data.events.length === 0) {
        processed = [{ type: 'no-games', message: getNoGamesMessage(dateFilter) }];
      } else {
        const grouped = groupGamesByDate(data.events.map(e => NHLService.formatGameForMobile(e)).filter(Boolean));
        processed = [];
        Object.keys(grouped).sort((a,b) => new Date(a) - new Date(b)).forEach(date => {
          processed.push({ type: 'header', date: formatDateHeader(date) });
          processed.push(...grouped[date]);
        });
      }

      setGameCache(prev => ({ ...prev, [dateFilter]: processed }));
      setCacheTimestamps(prev => ({ ...prev, [dateFilter]: Date.now() }));
      if (dateFilter === selectedDateFilter) setGames(processed);
    } catch (e) {
      if (!silent) { Alert.alert('Error', 'Failed to load NHL games'); console.error(e); }
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
    const s = String(clock).trim();
    // If clock is all zeros like '0:00' or '00:00' treat as not meaningful
    if (/^0+(:0+)*$/i.test(s.replace(/\s/g, ''))) return false;
    return /\d/.test(s);
  };

  // Normalize some abbreviations ESPN uses to match our logo keys
  const normalizeAbbreviation = (abbrev) => {
    if (!abbrev) return abbrev;
    const a = String(abbrev).toLowerCase();
    const map = { lak: 'la', sjs: 'sj', tbl: 'tb' };
    return (map[a] || abbrev).toString();
  };

  const isLiveGame = (item) => {
    if (!item) return false;
    // Treat games with 'End of' in the status as live (end-of-period short pause)
    const statusText = (item.status || '').toString();
    const isEndOf = /end of/i.test(statusText);
    return (!item.isCompleted) && (isEndOf || hasMeaningfulClock(item.displayClock));
  };

  const getGameTimeText = (item) => {
    const isLive = isLiveGame(item);
    if (isLive && item.displayClock === '0:00') return 'INT';
    if (isLive) return item.displayClock;
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

  // Losing team styling helpers (mirror MLB logic)
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
    if (!item.awayTeam || !item.homeTeam) return theme.text;
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

  const isTeamLosing = (item, isAwayTeam) => {
    if (!item.awayTeam || !item.homeTeam) return false;
    const isGameFinal = item.isCompleted || item.statusType === 'F' || item.statusType === 'O';
    if (!isGameFinal) return false;
    const awayScore = parseInt(item.awayTeam.score || '0');
    const homeScore = parseInt(item.homeTeam.score || '0');
    if (awayScore === homeScore) return false;
    return isAwayTeam ? (awayScore < homeScore) : (homeScore < awayScore);
  };

  const handleDateFilterChange = (f) => {
    setSelectedDateFilter(f);
    const cached = gameCache[f];
    const cacheTime = cacheTimestamps[f];
    const isValid = cached && (Date.now() - cacheTime) < getCacheDuration(f);
    if (isValid) setGames(cached); else setLoading(true);
  };

  const onRefresh = async () => { setRefreshing(true); await loadScoreboard(false, selectedDateFilter); setRefreshing(false); };

  const navigateToGameDetails = (gameId) => { if (!gameId) return; navigation.navigate('GameDetails', { gameId, sport: 'nhl' }); };

  // Team navigation function with proper ID handling
  const navigateToTeam = (team) => {
    if (!team || !team.id) {
      console.warn('NavigateToTeam: Invalid team object', team);
      return;
    }
    
    const teamData = {
      teamId: team.id,
      abbreviation: team.abbreviation,
      displayName: team.displayName,
      sport: 'nhl'
    };
    
    navigation.navigate('TeamPage', teamData);
  };

  // Helper function to get NHL team ID for favorites
  const getNHLTeamId = (team) => {
    return team?.id || team?.teamId || null;
  };

  const renderDateHeader = (date) => (
    <View style={[styles.dateHeader, { backgroundColor: colors.primary, borderBottomColor: theme.border }]}>
      <Text allowFontScaling={false} style={[styles.dateHeaderText, { color: '#fff' }]}>{date}</Text>
    </View>
  );

  const renderGameCard = ({ item }) => {
    if (item.type === 'header') return renderDateHeader(item.date);
    if (item.type === 'no-games') return (<View style={styles.emptyContainer}><Text allowFontScaling={false} style={[styles.emptyText, { color: theme.textSecondary }]}>{item.message}</Text></View>);

  const isLive = isLiveGame(item);
  // Period text (NHL specific) - fallbacks for different shapes
  const periodText = item.situation?.period || item.situation?.periodName || item.period || item.periodName || item.statusDetail || null;

  const getOrdinalSuffix = (num) => {
    if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
    switch (num % 10) {
      case 1: return `${num}st`;
      case 2: return `${num}nd`;
      case 3: return `${num}rd`;
      default: return `${num}th`;
    }
  };

    return (
      <TouchableOpacity style={[styles.gameCard, { backgroundColor: theme.surface }]} onPress={() => navigateToGameDetails(item.id)}>
        <View style={styles.gameHeader}>
          <Text allowFontScaling={false} style={[styles.gameStatus, { color: theme.text }]}>{item.status}</Text>
          {/* Show live clock or start time for scheduled/finished games */}
          <Text allowFontScaling={false} style={[styles.gameClock, { color: theme.textSecondary }]}>{getGameTimeText(item)}</Text>
        </View>

        <View style={styles.teamsContainer}>
          {/* Away Team */}
          <View style={styles.teamRow}>
            <TouchableOpacity onPress={() => navigateToTeam(item.awayTeam)} style={styles.teamLogoContainer}>
              <Image source={{ uri: getTeamLogoUrl('nhl', normalizeAbbreviation(item.awayTeam.abbreviation)) || item.awayTeam.logo }} style={[styles.teamLogo, isTeamLosing(item, true) ? styles.losingTeamLogo : null]} />
            </TouchableOpacity>
            <View style={styles.teamInfo}>
              <View style={styles.teamNameRow}>
                {isFavorite(getNHLTeamId(item.awayTeam), 'nhl') && (
                  <Ionicons 
                    name="star" 
                    size={14} 
                    color={colors.primary} 
                    style={styles.favoriteIcon} 
                  />
                )}
                <Text allowFontScaling={false} style={[getTeamNameStyle(item, true), { color: isFavorite(getNHLTeamId(item.awayTeam), 'nhl') ? colors.primary : getTeamNameColor(item, true) }]}>
                  {item.awayTeam.displayName}
                </Text>
              </View>
              <Text allowFontScaling={false} style={[styles.teamRecord, { color: theme.textSecondary }]}>{item.awayTeam.record}</Text>
            </View>
            <Text allowFontScaling={false} style={[getTeamScoreStyle(item, true), { color: getScoreColor(item, true) }]}>{(isLive || item.isCompleted) ? (item.awayTeam.score ?? '') : ''}</Text>
          </View>

          {/* Home Team */}
          <View style={styles.teamRow}>
            <TouchableOpacity onPress={() => navigateToTeam(item.homeTeam)} style={styles.teamLogoContainer}>
              <Image source={{ uri: getTeamLogoUrl('nhl', normalizeAbbreviation(item.homeTeam.abbreviation)) || item.homeTeam.logo }} style={[styles.teamLogo, isTeamLosing(item, false) ? styles.losingTeamLogo : null]} />
            </TouchableOpacity>
            <View style={styles.teamInfo}>
              <View style={styles.teamNameRow}>
                {isFavorite(getNHLTeamId(item.homeTeam), 'nhl') && (
                  <Ionicons 
                    name="star" 
                    size={14} 
                    color={colors.primary} 
                    style={styles.favoriteIcon} 
                  />
                )}
                <Text allowFontScaling={false} style={[getTeamNameStyle(item, false), { color: isFavorite(getNHLTeamId(item.homeTeam), 'nhl') ? colors.primary : getTeamNameColor(item, false) }]}>
                  {item.homeTeam.displayName}
                </Text>
              </View>
              <Text allowFontScaling={false} style={[styles.teamRecord, { color: theme.textSecondary }]}>{item.homeTeam.record}</Text>
            </View>
            <Text allowFontScaling={false} style={[getTeamScoreStyle(item, false), { color: getScoreColor(item, false) }]}>{(isLive || item.isCompleted) ? (item.homeTeam.score ?? '') : ''}</Text>
          </View>
        </View>

        <View style={[styles.gameFooter, { borderTopColor: theme.border }]}>
          <Text allowFontScaling={false} style={[styles.venue, { color: theme.textSecondary }]}>{item.venue || ''}</Text>
          {item.broadcasts && item.broadcasts.length > 0 && (<Text allowFontScaling={false} style={[styles.broadcast, { color: theme.textSecondary }]}>{item.broadcasts.join(', ')}</Text>)}
          {periodText && isLive && (
            <Text allowFontScaling={false} style={[styles.periodText, { color: colors.primary, fontWeight: 'bold' }]}>{getOrdinalSuffix(periodText)} Period</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.textSecondary }]}>Loading NHL Scoreboard...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.dateFilterContainer, { backgroundColor: theme.surface }]}>
        <TouchableOpacity style={[styles.dateFilterButton, { backgroundColor: selectedDateFilter === 'yesterday' ? colors.primary : theme.surfaceSecondary }]} onPress={() => handleDateFilterChange('yesterday')}>
          <Text allowFontScaling={false} style={[styles.dateFilterText, { color: selectedDateFilter === 'yesterday' ? '#fff' : theme.text }]}>Yesterday</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.dateFilterButton, { backgroundColor: selectedDateFilter === 'today' ? colors.primary : theme.surfaceSecondary }]} onPress={() => handleDateFilterChange('today')}>
          <Text allowFontScaling={false} style={[styles.dateFilterText, { color: selectedDateFilter === 'today' ? '#fff' : theme.text }]}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.dateFilterButton, { backgroundColor: selectedDateFilter === 'upcoming' ? colors.primary : theme.surfaceSecondary }]} onPress={() => handleDateFilterChange('upcoming')}>
          <Text allowFontScaling={false} style={[styles.dateFilterText, { color: selectedDateFilter === 'upcoming' ? '#fff' : theme.text }]}>Upcoming</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={games}
        renderItem={renderGameCard}
        keyExtractor={(item, index) => item.type === 'header' ? `header-${item.date}` : (item.type === 'no-games' ? `no-games-${index}` : item.id || `game-${index}`)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (!loading && (<View style={styles.emptyContainer}><Text allowFontScaling={false} style={[styles.emptyText, { color: theme.textSecondary }]}>No games scheduled</Text></View>))}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16 },
  listContainer: { padding: 16 },
  gameCard: { borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3.84, elevation: 5 },
  gameHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  gameStatus: { fontSize: 14, fontWeight: '600' },
  gameClock: { fontSize: 14 },
  teamsContainer: { marginBottom: 12 },
  teamRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  teamLogo: { width: 40, height: 40, marginRight: 12 },
  teamLogoContainer: { flexDirection: 'row', alignItems: 'center' },
  teamInfo: { flex: 1 },
  teamName: { fontSize: 16, fontWeight: '600' },
  teamNameRow: { flexDirection: 'row', alignItems: 'center' },
  favoriteIcon: { marginRight: 4 },
  teamRecord: { fontSize: 12, marginTop: 2 },
  teamScore: { fontSize: 24, fontWeight: 'bold', minWidth: 40, textAlign: 'center' },
  losingTeamScore: { color: '#999' },
  losingTeamName: { color: '#999' },
  losingTeamLogo: { opacity: 0.35 },
  gameFooter: { borderTopWidth: 1, paddingTop: 8 },
  venue: { fontSize: 12, marginBottom: 2 },
  broadcast: { fontSize: 12, fontStyle: 'italic' },
  dateHeader: { paddingVertical: 12, paddingHorizontal: 16, marginVertical: 8, borderRadius: 8 },
  dateHeaderText: { fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  dateFilterContainer: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1 },
  dateFilterButton: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, minWidth: 80, alignItems: 'center' },
  dateFilterText: { fontSize: 14, fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 50 },
  emptyText: { fontSize: 16, textAlign: 'center' }
});

export default NHLScoreboardScreen;
