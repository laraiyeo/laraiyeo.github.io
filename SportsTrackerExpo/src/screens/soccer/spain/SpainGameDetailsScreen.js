import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  RefreshControl
} from 'react-native';
import { SpainServiceEnhanced } from '../../../services/soccer/SpainServiceEnhanced';
import { useTheme } from '../../../context/ThemeContext';

const { width } = Dimensions.get('window');

const SpainGameDetailsScreen = ({ route, navigation }) => {
  const { gameId, sport, competition, homeTeam, awayTeam } = route?.params || {};
  const { theme, colors, isDarkMode } = useTheme();
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updateInterval, setUpdateInterval] = useState(null);
  const [lastUpdateHash, setLastUpdateHash] = useState('');
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [activeTab, setActiveTab] = useState('stats');
  const [loadingStats, setLoadingStats] = useState(false);
  const scrollViewRef = useRef(null);
  const stickyHeaderOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadGameDetails();
    
    // Set up auto-refresh for live games
    const interval = setInterval(() => {
      if (gameData && gameData.header?.competitions?.[0]?.status?.type?.state === 'in') {
        loadGameDetails(true); // Silent update for live games
      }
    }, 30000); // 30 seconds for soccer
    
    setUpdateInterval(interval);
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [gameId]);

  const loadGameDetails = async (silentUpdate = false) => {
    try {
      if (!silentUpdate) {
        setLoading(true);
      }

      console.log('Loading Spain game details for:', gameId);
      const data = await SpainServiceEnhanced.getGameDetails(gameId);
      
      // Process the data similar to soccer web logic
      const processedData = await processGameData(data);
      
      // Create hash for change detection
      const currentHash = JSON.stringify({
        homeScore: processedData.header?.competitions?.[0]?.competitors?.[0]?.score,
        awayScore: processedData.header?.competitions?.[0]?.competitors?.[1]?.score,
        status: processedData.header?.competitions?.[0]?.status?.type?.state,
        clock: processedData.header?.competitions?.[0]?.status?.displayClock
      });

      if (currentHash !== lastUpdateHash) {
        setGameData(processedData);
        setLastUpdateHash(currentHash);
        console.log('Game data updated');
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading Spain game details:', error);
      if (!silentUpdate) {
        setLoading(false);
        Alert.alert('Error', 'Failed to load game details. Please try again.');
      }
    }
  };

  const processGameData = async (data) => {
    // Get team logos
    const homeTeamId = data.header?.competitions?.[0]?.competitors?.[0]?.team?.id;
    const awayTeamId = data.header?.competitions?.[0]?.competitors?.[1]?.team?.id;
    
    const [homeLogo, awayLogo] = await Promise.all([
      homeTeamId ? SpainServiceEnhanced.getTeamLogoWithFallback(homeTeamId) : null,
      awayTeamId ? SpainServiceEnhanced.getTeamLogoWithFallback(awayTeamId) : null
    ]);

    // Process scorers (similar to soccer web renderScorersBox)
    const processScorers = (team) => {
      const scorers = team?.statistics?.find(stat => stat.name === 'scorers')?.athletes || [];
      return scorers.map(scorer => ({
        displayName: scorer.athlete?.displayName || 'Unknown',
        clock: scorer.clock || '',
        penaltyKick: scorer.penaltyKick || false
      }));
    };

    const homeScorers = processScorers(data.header?.competitions?.[0]?.competitors?.[0]);
    const awayScorers = processScorers(data.header?.competitions?.[0]?.competitors?.[1]);

    return {
      ...data,
      homeLogo,
      awayLogo,
      homeScorers,
      awayScorers
    };
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadGameDetails();
    setRefreshing(false);
  };

  const handleScroll = (event) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const shouldShow = offsetY > 200;
    
    if (shouldShow !== showStickyHeader) {
      setShowStickyHeader(shouldShow);
      Animated.timing(stickyHeaderOpacity, {
        toValue: shouldShow ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  };

  const getMatchStatus = () => {
    if (!gameData) return { text: '', isLive: false };
    
    const status = gameData.header?.competitions?.[0]?.status;
    const state = status?.type?.state;
    
    if (state === 'pre') {
      // Match not started - show date and time like scoreboard
      const date = new Date(gameData.header.competitions[0].date);
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
        text: timeText,
        detail: dateText,
        isLive: false,
        isPre: true,
        isPost: false
      };
    } else if (state === 'in') {
      return {
        text: status?.displayClock || 'LIVE',
        detail: status?.period ? `${status.period}'` : '',
        isLive: true,
        isPre: false,
        isPost: false
      };
    } else {
      return {
        text: 'FT',
        detail: status?.type?.description || '',
        isLive: false,
        isPre: false,
        isPost: true
      };
    }
  };

  const renderStickyHeader = () => {
    if (!gameData) return null;
    
    const competition = gameData.header?.competitions?.[0];
    const homeTeam = competition?.competitors?.[0];
    const awayTeam = competition?.competitors?.[1];
    const matchStatus = getMatchStatus();

    return (
      <Animated.View
        style={[
          styles.stickyHeader,
          { backgroundColor: theme.surface, opacity: stickyHeaderOpacity }
        ]}
      >
        <View style={styles.stickyContent}>
          {/* Away Team */}
          <View style={styles.stickyTeam}>
            <Image
              source={{ uri: gameData.awayLogo }}
              style={styles.stickyLogo}
              resizeMode="contain"
            />
            <Text style={[styles.stickyScore, { color: theme.text }]}>
              {awayTeam?.score || '0'}
            </Text>
          </View>

          {/* Status */}
          <View style={styles.stickyStatus}>
            <Text style={[styles.stickyStatusText, { color: theme.text }]}>
              {matchStatus.text}
            </Text>
          </View>

          {/* Home Team */}
          <View style={styles.stickyTeam}>
            <Text style={[styles.stickyScore, { color: theme.text }]}>
              {homeTeam?.score || '0'}
            </Text>
            <Image
              source={{ uri: gameData.homeLogo }}
              style={styles.stickyLogo}
              resizeMode="contain"
            />
          </View>
        </View>
      </Animated.View>
    );
  };

  const renderScorersBox = () => {
    if (!gameData || (!gameData.homeScorers?.length && !gameData.awayScorers?.length)) {
      return null;
    }

    const formatScorer = (scorer) => {
      const penaltyText = scorer.penaltyKick ? " (Pen.)" : "";
      const fullName = scorer.displayName;
      const lastName = fullName.split(" ").slice(-1).join(" ");
      const displayName = width <= 375 ? (lastName || fullName) : fullName;
      return `${displayName} ${scorer.clock}${penaltyText}`;
    };

    return (
      <View style={[styles.scorersContainer, { backgroundColor: theme.surface }]}>
        <Text style={[styles.scorersTitle, { color: theme.text }]}>Goal Scorers</Text>
        <View style={styles.scorersBox}>
          <View style={styles.scorersColumn}>
            <Text style={[styles.scorersHeader, { color: theme.textSecondary }]}>
              {gameData.header?.competitions?.[0]?.competitors?.[1]?.team?.displayName}
            </Text>
            {gameData.awayScorers?.length > 0 ? (
              gameData.awayScorers.map((scorer, index) => (
                <Text key={index} style={[styles.scorerText, { color: theme.text }]}>
                  {formatScorer(scorer)}
                </Text>
              ))
            ) : (
              <Text style={[styles.noScorers, { color: theme.textSecondary }]}>No scorers</Text>
            )}
          </View>

          <View style={styles.soccerBallContainer}>
            <Text style={styles.soccerBallEmoji}>⚽</Text>
          </View>

          <View style={styles.scorersColumn}>
            <Text style={[styles.scorersHeader, { color: theme.textSecondary }]}>
              {gameData.header?.competitions?.[0]?.competitors?.[0]?.team?.displayName}
            </Text>
            {gameData.homeScorers?.length > 0 ? (
              gameData.homeScorers.map((scorer, index) => (
                <Text key={index} style={[styles.scorerText, { color: theme.text }]}>
                  {formatScorer(scorer)}
                </Text>
              ))
            ) : (
              <Text style={[styles.noScorers, { color: theme.textSecondary }]}>No scorers</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderMatchHeader = () => {
    if (!gameData) return null;

    const competition = gameData.header?.competitions?.[0];
    const homeTeam = competition?.competitors?.[0];
    const awayTeam = competition?.competitors?.[1];
    const matchStatus = getMatchStatus();

    // Get team colors
    const homeColor = SpainServiceEnhanced.getTeamColorWithAlternateLogic(homeTeam?.team);
    const awayColor = SpainServiceEnhanced.getTeamColorWithAlternateLogic(awayTeam?.team);

    return (
      <View style={[styles.headerContainer, { backgroundColor: theme.surface }]}>
        {/* Competition Info */}
        <View style={styles.competitionContainer}>
          <Text style={[styles.competitionText, { color: theme.textSecondary }]}>
            {gameData.competitionName || 'Spain'}
          </Text>
          {gameData.header?.season && (
            <Text style={[styles.seasonText, { color: theme.textSecondary }]}>
              {gameData.header.season.displayName}
            </Text>
          )}
        </View>

        {/* Match Info */}
        <View style={styles.matchContainer}>
          {/* Away Team */}
          <View style={styles.teamSection}>
            <Image
              source={{ uri: gameData.awayLogo }}
              style={styles.teamLogo}
              resizeMode="contain"
            />
            <Text style={[styles.teamName, { color: theme.text }]} numberOfLines={2}>
              {awayTeam?.team?.displayName}
            </Text>
            <View style={[
              styles.scoreBox,
              matchStatus.isLive && { backgroundColor: `#${awayColor}20` }
            ]}>
              <Text style={[styles.scoreText, { color: theme.text }]}>
                {awayTeam?.score || '0'}
              </Text>
            </View>
          </View>

          {/* Status */}
          <View style={styles.statusSection}>
            <View style={[
              styles.statusBadge,
              matchStatus.isLive && { backgroundColor: colors.danger },
              matchStatus.isPre && { backgroundColor: colors.primary },
              !matchStatus.isLive && !matchStatus.isPre && { backgroundColor: theme.textTertiary }
            ]}>
              <Text style={[
                styles.statusText,
                { color: matchStatus.isLive || matchStatus.isPre ? '#fff' : theme.text }
              ]}>
                {matchStatus.text}
              </Text>
              {matchStatus.detail && (
                <Text style={[
                  styles.statusDetail,
                  { color: matchStatus.isLive || matchStatus.isPre ? '#fff' : theme.textSecondary }
                ]}>
                  {matchStatus.detail}
                </Text>
              )}
            </View>
          </View>

          {/* Home Team */}
          <View style={styles.teamSection}>
            <Image
              source={{ uri: gameData.homeLogo }}
              style={styles.teamLogo}
              resizeMode="contain"
            />
            <Text style={[styles.teamName, { color: theme.text }]} numberOfLines={2}>
              {homeTeam?.team?.displayName}
            </Text>
            <View style={[
              styles.scoreBox,
              matchStatus.isLive && { backgroundColor: `#${homeColor}20` }
            ]}>
              <Text style={[styles.scoreText, { color: theme.text }]}>
                {homeTeam?.score || '0'}
              </Text>
            </View>
          </View>
        </View>

        {/* Match Details */}
        {competition?.venue && (
          <View style={styles.venueContainer}>
            <Text style={[styles.venueText, { color: theme.textSecondary }]}>
              📍 {competition.venue.fullName}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderTabs = () => {
    const tabs = [
      { key: 'stats', label: 'Match Stats' },
      { key: 'lineups', label: 'Lineups' },
      { key: 'commentary', label: 'Commentary' }
    ];

    return (
      <View style={[styles.tabContainer, { backgroundColor: theme.surface }]}>
        <View style={styles.tabRow}>
          {tabs.map((tab, index) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab,
                activeTab === tab.key && { backgroundColor: colors.primary },
                index === tabs.length - 1 && styles.lastTab // Remove margin from last tab
              ]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === tab.key ? '#fff' : theme.text }
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'stats':
        return renderStatsTab();
      case 'lineups':
        return renderLineupsTab();
      case 'commentary':
        return renderCommentaryTab();
      default:
        return renderStatsTab();
    }
  };

  const renderStatsTab = () => {
    // Implement match statistics similar to soccer web
    return (
      <View style={styles.tabContent}>
        <Text style={[styles.comingSoonText, { color: theme.textSecondary }]}>
          Match statistics coming soon...
        </Text>
      </View>
    );
  };

  const renderCommentaryTab = () => {
    // Implement match commentary similar to soccer web
    return (
      <View style={styles.tabContent}>
        <Text style={[styles.comingSoonText, { color: theme.textSecondary }]}>
          Match commentary coming soon...
        </Text>
      </View>
    );
  };

  const renderLineupsTab = () => {
    // Implement team lineups similar to soccer web
    return (
      <View style={styles.tabContent}>
        <Text style={[styles.comingSoonText, { color: theme.textSecondary }]}>
          Team lineups coming soon...
        </Text>
      </View>
    );
  };

  if (loading && !gameData) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>
          Loading match details...
        </Text>
      </View>
    );
  }

  if (!gameData) {
    return (
      <View style={[styles.container, styles.errorContainer, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.text }]}>
          Failed to load match details
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={() => loadGameDetails()}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderStickyHeader()}
      
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {renderMatchHeader()}
        {renderScorersBox()}
        {renderTabs()}
        {renderTabContent()}
      </ScrollView>
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
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  stickyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stickyTeam: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stickyLogo: {
    width: 24,
    height: 24,
    marginHorizontal: 8,
  },
  stickyScore: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  stickyStatus: {
    flex: 0.6,
    alignItems: 'center',
  },
  stickyStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  headerContainer: {
    padding: 20,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  competitionContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  competitionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  seasonText: {
    fontSize: 12,
    marginTop: 4,
  },
  matchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamSection: {
    flex: 1,
    alignItems: 'center',
  },
  teamLogo: {
    width: 48,
    height: 48,
    marginBottom: 8,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
    minHeight: 36,
  },
  scoreBox: {
    minWidth: 40,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statusSection: {
    flex: 0.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 80,
  },
  statusText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  statusDetail: {
    fontSize: 11,
    marginTop: 2,
  },
  venueContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  venueText: {
    fontSize: 12,
  },
  scorersContainer: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  scorersTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  scorersBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  scorersColumn: {
    flex: 1,
  },
  scorersHeader: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  scorerText: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  noScorers: {
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  soccerBallContainer: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soccerBallEmoji: {
    fontSize: 24,
  },
  tabContainer: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    padding: 4,
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tab: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    alignItems: 'center',
  },
  lastTab: {
    marginRight: 0,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabContent: {
    margin: 16,
    minHeight: 200,
  },
  comingSoonText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
});

export default SpainGameDetailsScreen;