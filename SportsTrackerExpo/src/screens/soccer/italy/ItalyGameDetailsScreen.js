import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
  LayoutAnimation,
  UIManager,
  Dimensions,
  RefreshControl,
  Modal
} from 'react-native';
import { WebView } from 'react-native-webview';
import Svg, { Line, Circle, Defs, LinearGradient, Stop, Path } from 'react-native-svg';
import { ItalyServiceEnhanced } from '../../../services/soccer/ItalyServiceEnhanced';
import { useTheme } from '../../../context/ThemeContext';
import { useFavorites } from '../../../context/FavoritesContext';

const { width } = Dimensions.get('window');

// Convert HTTP URLs to HTTPS to avoid mixed content issues
const convertToHttps = (url) => {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
};

const ItalyGameDetailsScreen = ({ route, navigation }) => {
  const { gameId, sport, competition, homeTeam, awayTeam } = route?.params || {};
  const { theme, colors, isDarkMode } = useTheme();
  const { isFavorite } = useFavorites();
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updateInterval, setUpdateInterval] = useState(null);
  const [lastUpdateHash, setLastUpdateHash] = useState('');
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [activeTab, setActiveTab] = useState('stats');
  const [loadingStats, setLoadingStats] = useState(false);
  const [playsData, setPlaysData] = useState(null);
  const [openPlays, setOpenPlays] = useState(new Set());
  const [loadingPlays, setLoadingPlays] = useState(false);
  const [lineupData, setLineupData] = useState({ 
    homeLineup: [], 
    awayLineup: [], 
    homeFormation: '4-3-3', 
    awayFormation: '4-3-3' 
  });
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerPopupVisible, setPlayerPopupVisible] = useState(false);
  const [statsData, setStatsData] = useState(null);
  const [loadingMatchStats, setLoadingMatchStats] = useState(false);
  
  // Streaming state
  const [availableStreams, setAvailableStreams] = useState({});
  const [currentStreamType, setCurrentStreamType] = useState('admin');
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [showStreamModal, setShowStreamModal] = useState(false);
  
  const scrollViewRef = useRef(null);
  const stickyHeaderOpacity = useRef(new Animated.Value(0)).current;
  const lastPlaysHashRef = useRef('');

  // Function to get team logo URLs with dark mode support
  const getTeamLogoUrls = (teamId, isDarkMode) => {
    if (!teamId) return { primaryUrl: '', fallbackUrl: '' };
    
    const baseUrl = `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
    const darkUrl = `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`;
    
    if (isDarkMode) {
      return {
        primaryUrl: darkUrl,
        fallbackUrl: baseUrl
      };
    } else {
      return {
        primaryUrl: baseUrl,
        fallbackUrl: darkUrl
      };
    }
  };

  // TeamLogoImage component with dark mode and fallback support
  const TeamLogoImage = ({ teamId, style, isScoring = false }) => {
    const [logoSource, setLogoSource] = useState(null);
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
      const loadLogo = async () => {
        if (teamId) {
          try {
            if (isScoring) {
              // For scoring plays, always use dark variant
              const darkUrl = `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`;
              setLogoSource({ uri: darkUrl });
            } else {
              // For non-scoring, use normal dark mode logic
              const { primaryUrl, fallbackUrl } = getTeamLogoUrls(teamId, isDarkMode);
              setLogoSource({ uri: primaryUrl });
            }
          } catch (error) {
            console.error('Error loading team logo:', error);
            setLogoSource(require('../../../../assets/soccer.png'));
          }
        } else {
          setLogoSource(require('../../../../assets/soccer.png'));
        }
        setRetryCount(0);
      };
      
      loadLogo();
    }, [teamId, isDarkMode, isScoring]);

    const handleError = () => {
      if (retryCount === 0 && teamId) {
        if (isScoring) {
          // For scoring plays, fallback to regular variant
          const regularUrl = `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
          setRetryCount(1);
          setLogoSource({ uri: regularUrl });
        } else {
          // For non-scoring, try the fallback URL (opposite dark mode variant)
          const { fallbackUrl } = getTeamLogoUrls(teamId, isDarkMode);
          setRetryCount(1);
          setLogoSource({ uri: fallbackUrl });
        }
      } else {
        // Final fallback to soccer.png
        setLogoSource(require('../../../../assets/soccer.png'));
      }
    };

    // Get the default source - use actual logo first, then soccer.png
    const getDefaultSource = () => {
      if (teamId) {
        if (isScoring) {
          // For scoring plays, use dark variant as default
          const darkUrl = `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`;
          return { uri: darkUrl };
        } else {
          // For non-scoring, use normal logic
          const { primaryUrl } = getTeamLogoUrls(teamId, isDarkMode);
          return { uri: primaryUrl };
        }
      }
      return require('../../../../assets/soccer.png');
    };

    return (
      <Image
        style={style}
        source={logoSource || getDefaultSource()}
        defaultSource={getDefaultSource()}
        onError={handleError}
      />
    );
  };

  // Enhanced logo function with dark mode support and fallbacks
  const getTeamLogo = async (teamId, isDarkMode) => {
    // Use the service's enhanced logo logic with caching and fallbacks
    const logoUrl = await ItalyServiceEnhanced.getTeamLogoWithFallback(teamId);
    return { primaryUrl: logoUrl, fallbackUrl: logoUrl };
  };

  // Compute a stable key for a play. Prefer explicit id, fall back to a fingerprint of core fields.
  const computePlayKey = (play) => {
    if (!play) return `play-unknown`;
    if (play.id) return String(play.id);
    if (play.uid) return String(play.uid);
    // Try to extract team id if available
    const extractTeamId = (teamObj) => {
      try {
        if (!teamObj) return '';
        if (typeof teamObj === 'string') {
          const m = teamObj.match(/teams\/(\d+)/);
          if (m) return m[1];
          return teamObj;
        }
        if (teamObj.id) return String(teamObj.id);
        if (teamObj.$ref) {
          const m2 = String(teamObj.$ref).match(/teams\/(\d+)/);
          if (m2) return m2[1];
        }
        if (teamObj.team) {
          if (teamObj.team.id) return String(teamObj.team.id);
          if (teamObj.team.$ref) {
            const m3 = String(teamObj.team.$ref).match(/teams\/(\d+)/);
            if (m3) return m3[1];
          }
        }
      } catch (e) {}
      return '';
    };

    // Build a compact, stable fingerprint that avoids volatile fields like the live clock
    const parts = [];
    if (play.period) parts.push(`p${play.period.number || play.period}`);
    // Team identity (stable)
    if (play.team) parts.push(`t${extractTeamId(play.team)}`);
    // Play type id (stable)
    if (play.type && (play.type.id || play.type.name)) parts.push(`ty${play.type.id || play.type.name}`);
    // Use a stable timestamp/sequence if available
    if (play.startTime) parts.push(`s${play.startTime}`);
    if (play.sequence) parts.push(`q${play.sequence}`);

    // Fallback: small slice of text if nothing else available (non-volatile)
    if (parts.length === 0) {
      const txt = (play.text || play.shortText || '').replace(/\s+/g, ' ').trim();
      if (txt) return `x${txt.substring(0, 60)}`;
      return JSON.stringify({ type: play.type, team: play.team }).substring(0, 80);
    }

    return parts.join('|');
  };

  // Incremental update helper: prepend new plays, and patch in-place updated plays to avoid full list replacement.
  const scrollYRef = useRef(0);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const playsFetchingRef = useRef(false);

  const updatePlaysDataIncremental = (fetchedPlays) => {
    if (!Array.isArray(fetchedPlays)) return;

    setPlaysData((prevPlays) => {
      // If we don't have existing data, just set it
      if (!Array.isArray(prevPlays) || prevPlays.length === 0) {
        return fetchedPlays;
      }

      // Build map of existing keys -> index
      const existingIndexByKey = new Map();
      prevPlays.forEach((p, i) => existingIndexByKey.set(computePlayKey(p), i));

      const patchedPlays = prevPlays.slice(); // shallow copy
  let changed = false;
      const newPlaysBatch = [];
  let addedCount = 0;
  let patchedCount = 0;

      // fetchedPlays are most-recent-first
      for (let i = 0; i < fetchedPlays.length; i++) {
        const p = fetchedPlays[i];
        const key = computePlayKey(p);
        if (!existingIndexByKey.has(key)) {
          // New play: collect to prepend later (keep fetched order)
          newPlaysBatch.push(p);
          addedCount++;
        } else {
          const idx = existingIndexByKey.get(key);
          const existing = patchedPlays[idx];
          // Only patch if content changed
          if (JSON.stringify(existing) !== JSON.stringify(p)) {
            patchedPlays[idx] = p;
            changed = true;
            patchedCount++;
          }
        }
      }

      if (newPlaysBatch.length > 0) {
        // Prepend new plays in same order (most-recent-first)
        const updated = [...newPlaysBatch, ...patchedPlays];
        changed = true;

        // Try to preserve scroll position after inserting at top
        try {
          const y = scrollYRef.current || 0;
          // Use setTimeout to wait for layout to settle then restore offset
          setTimeout(() => {
            if (scrollViewRef.current && typeof scrollViewRef.current.scrollTo === 'function') {
              scrollViewRef.current.scrollTo({ y, animated: false });
            }
          }, 50);
        } catch (e) {
          // ignore
        }

        console.log('[ItalyGameDetails] incremental update: added=', addedCount, 'patched=', patchedCount);
        return updated;
      }

      if (changed) {
        console.log('[ItalyGameDetails] incremental update: added=', addedCount, 'patched=', patchedCount);
        return patchedPlays;
      }
      return prevPlays; // no-op: keep same reference to avoid re-render
    });
  };

  // Helper to pick readable text color (black or white) for a given hex background
  const getContrastColor = (hex) => {
    try {
      if (!hex) return '#000';
      const h = hex.replace('#', '');
      const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      // Perceived brightness
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness > 186 ? '#000' : '#fff';
    } catch (e) {
      return '#000';
    }
  };

  const getTeamScore = (teamType) => {
    if (!gameData) return '0';
    
    // Use processed scores first, fallback to original structure
    if (gameData.processedScores) {
      return teamType === 'home' ? 
        (gameData.processedScores.home?.toString() || '0') : 
        (gameData.processedScores.away?.toString() || '0');
    }
    
    // Fallback to original structure
    const competition = gameData.header?.competitions?.[0];
    const team = teamType === 'home' ? competition?.competitors?.[0] : competition?.competitors?.[1];
    return team?.score?.value?.toString() || team?.score?.toString() || '0';
  };

  const getTeamShootoutScore = (teamType) => {
    if (!gameData) return null;
    
    console.log(`[getTeamShootoutScore] Getting ${teamType} shootout score`);
    console.log(`[getTeamShootoutScore] gameData.processedShootoutScores:`, gameData.processedShootoutScores);
    
    // Use processed shootout scores first (similar to how getTeamScore works)
    if (gameData.processedShootoutScores) {
      const shootoutScore = teamType === 'home' ? 
        gameData.processedShootoutScores.home : 
        gameData.processedShootoutScores.away;
      console.log(`[getTeamShootoutScore] Processed ${teamType} shootout score:`, shootoutScore);
      return shootoutScore !== undefined && shootoutScore !== null ? shootoutScore.toString() : null;
    }
    
    // Fallback to original structure
    const competition = gameData.header?.competitions?.[0];
    const team = teamType === 'home' ? competition?.competitors?.[0] : competition?.competitors?.[1];
    
    console.log(`[getTeamShootoutScore] Fallback - ${teamType} team score object:`, team?.score);
    
    // Look for shootout score in the same way as regular score
    if (team?.score?.shootout !== undefined && team?.score?.shootout !== null) {
      console.log(`[getTeamShootoutScore] Found ${teamType} shootout in fallback:`, team.score.shootout);
      return team.score.shootout.toString();
    }
    
    console.log(`[getTeamShootoutScore] No ${teamType} shootout score found`);
    return null;
  };

  const hasShootout = () => {
    if (!gameData) return false;
    
    console.log(`[hasShootout] Checking for shootout`);
    console.log(`[hasShootout] gameData.processedShootoutScores:`, gameData.processedShootoutScores);
    
    // Check processed shootout scores first (similar to getTeamScore pattern)
    if (gameData.processedShootoutScores) {
      const result = (gameData.processedShootoutScores.home !== undefined && gameData.processedShootoutScores.home !== null) ||
             (gameData.processedShootoutScores.away !== undefined && gameData.processedShootoutScores.away !== null);
      console.log(`[hasShootout] Processed shootout check result:`, result);
      return result;
    }
    
    // Fallback to original structure
    const competition = gameData.header?.competitions?.[0];
    const homeTeam = competition?.competitors?.[0];
    const awayTeam = competition?.competitors?.[1];
    
    console.log(`[hasShootout] Fallback - homeTeam score:`, homeTeam?.score);
    console.log(`[hasShootout] Fallback - awayTeam score:`, awayTeam?.score);
    
    // Check if shootout scores exist (indicating a penalty shootout occurred)
    const result = (homeTeam?.score?.shootout !== undefined && homeTeam?.score?.shootout !== null) ||
           (awayTeam?.score?.shootout !== undefined && awayTeam?.score?.shootout !== null);
    console.log(`[hasShootout] Fallback shootout check result:`, result);
    return result;
  };

  // Determine winner/loser using shootout scores first if they exist (similar to team page logic)
  const determineWinnerWithShootout = () => {
    if (!gameData) return { homeIsWinner: false, awayIsWinner: false, isDraw: false };
    
    const matchStatus = getMatchStatus();
    if (matchStatus.isLive || matchStatus.isPre) {
      return { homeIsWinner: false, awayIsWinner: false, isDraw: false };
    }
    
    const homeScore = getTeamScore('home');
    const awayScore = getTeamScore('away');
    const homeShootoutScore = getTeamShootoutScore('home');
    const awayShootoutScore = getTeamShootoutScore('away');
    
    // If shootout scores exist, use them to determine winner
    if (homeShootoutScore !== null && awayShootoutScore !== null) {
      const homeShootout = parseInt(homeShootoutScore);
      const awayShootout = parseInt(awayShootoutScore);
      
      if (homeShootout > awayShootout) {
        return { homeIsWinner: true, awayIsWinner: false, isDraw: false };
      } else if (awayShootout > homeShootout) {
        return { homeIsWinner: false, awayIsWinner: true, isDraw: false };
      }
      // If shootout scores are equal, it's still a draw (shouldn't happen but safety)
      return { homeIsWinner: false, awayIsWinner: false, isDraw: true };
    }
    
    // Fall back to regular scores
    const homeScoreNum = parseInt(homeScore);
    const awayScoreNum = parseInt(awayScore);
    
    if (homeScoreNum > awayScoreNum) {
      return { homeIsWinner: true, awayIsWinner: false, isDraw: false };
    } else if (awayScoreNum > homeScoreNum) {
      return { homeIsWinner: false, awayIsWinner: true, isDraw: false };
    } else {
      return { homeIsWinner: false, awayIsWinner: false, isDraw: true };
    }
  };

  const handleScroll = (event) => {
    const offsetY = event?.nativeEvent?.contentOffset?.y || 0;
    scrollYRef.current = offsetY;
    const shouldShow = offsetY > 120;
    if (shouldShow !== showStickyHeader) {
      setShowStickyHeader(shouldShow);
      Animated.timing(stickyHeaderOpacity, {
        toValue: shouldShow ? 1 : 0,
        duration: 350,
        useNativeDriver: true,
      }).start();
    }
  };

  useEffect(() => {
    loadGameDetails();

    // Adaptive polling: when the game is live and the Plays tab is active, poll faster (10s).
    // Otherwise poll at a default 30s interval.
    const isLive = gameData && gameData.header?.competitions?.[0]?.status?.type?.state === 'in';
    const delay = (isLive && activeTab === 'plays') ? 4000 : 30000;

    const interval = setInterval(() => {
      try {
        if (isLive) {
          loadGameDetails(true); // Silent update for live games
        }
      } catch (e) {
        // ignore
      }
    }, delay);

    setUpdateInterval(interval);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [gameId, gameData, activeTab]);

  // Reload data when the screen comes into focus (useful when navigating back)
  useFocusEffect(
    React.useCallback(() => {
      console.log('[ItalyGameDetails] useFocusEffect triggered');
      loadGameDetails();
      // Only clear plays and stats data when the gameId changes, not on every focus
      // This prevents losing data when navigating back from other screens with same gameId
      
      return () => {
        // no-op cleanup
      };
    }, [gameId])
  );

  // Enable LayoutAnimation on Android
  useEffect(() => {
    if (UIManager && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // Clear data when gameId changes (different game)
  useEffect(() => {
    console.log('[ItalyGameDetails] gameId changed - clearing data states');
    setPlaysData(null);
    setStatsData(null);
  }, [gameId]);

  const loadGameDetails = async (silentUpdate = false) => {
    try {
      if (!silentUpdate) {
        setLoading(true);
      }
      console.log('[ItalyGameDetails] loadGameDetails START', { gameId, silentUpdate });
      console.debug('[ItalyGameDetails] requesting game details for', gameId);
      const data = await ItalyServiceEnhanced.getGameDetails(gameId);
      
      // Process the data similar to soccer web logic
      const processedData = await processGameData(data);
      
      // Create hash for change detection
      const currentHash = JSON.stringify({
        homeScore: processedData.processedScores?.home,
        awayScore: processedData.processedScores?.away,
        status: processedData.header?.competitions?.[0]?.status?.type?.state,
        clock: processedData.header?.competitions?.[0]?.status?.displayClock,
        period: processedData.header?.competitions?.[0]?.status?.period
      });

      if (currentHash !== lastUpdateHash) {
        setGameData(processedData);
        setLastUpdateHash(currentHash);
        console.log('[ItalyGameDetails] Game data updated - hash changed', currentHash);
        
        // Clear stats data when game state changes to ensure fresh stats are fetched
        setStatsData(null);
        
        // Fetch lineup data when game data is updated
        const lineupResult = await fetchLineupData();
        setLineupData(lineupResult);
        console.log('[ItalyGameDetails] Lineup data updated:', lineupResult);
        
        // Do not forcibly clear playsData here; the plays effect will compare hashes and merge/refresh
      } else {
        console.debug('[ItalyGameDetails] Game data hash unchanged');
      }

      setLoading(false);
      console.log('[ItalyGameDetails] loadGameDetails END', { gameId, silentUpdate });
    } catch (error) {
      console.error('Error loading Italy game details:', error);
      if (!silentUpdate) {
        setLoading(false);
        Alert.alert('Error', 'Failed to load game details. Please try again.');
      }
    }
  };

  const processGameData = async (data) => {
    // Get team info by homeAway property
    const competition = data.header?.competitions?.[0];
    const competitors = competition?.competitors || [];
    
    // Find home and away teams based on homeAway property
    const homeCompetitor = competitors.find(comp => comp.homeAway === 'home');
    const awayCompetitor = competitors.find(comp => comp.homeAway === 'away');
    
    const homeTeamId = homeCompetitor?.team?.id;
    const awayTeamId = awayCompetitor?.team?.id;
    
    const [homeLogo, awayLogo] = await Promise.all([
      homeTeamId ? ItalyServiceEnhanced.getTeamLogoWithFallback(homeTeamId) : null,
      awayTeamId ? ItalyServiceEnhanced.getTeamLogoWithFallback(awayTeamId) : null
    ]);

    let homeScore = null;
    let awayScore = null;
    let homeShootoutScore = null;
    let awayShootoutScore = null;

    try {
      // Fetch scores if the game has started
      if (homeCompetitor?.score?.$ref) {
        console.log('Fetching home score from:', homeCompetitor.score.$ref);
        const homeScoreResponse = await fetch(convertToHttps(homeCompetitor.score.$ref));
        const homeScoreData = await homeScoreResponse.json();
        console.log('Full home score data:', homeScoreData);
        homeScore = homeScoreData.value;
        homeShootoutScore = homeScoreData.shootout;
        console.log('Home score fetched:', homeScore, 'Shootout:', homeShootoutScore);
      }

      if (awayCompetitor?.score?.$ref) {
        console.log('Fetching away score from:', awayCompetitor.score.$ref);
        const awayScoreResponse = await fetch(convertToHttps(awayCompetitor.score.$ref));
        const awayScoreData = await awayScoreResponse.json();
        console.log('Full away score data:', awayScoreData);
        awayScore = awayScoreData.value;
        awayShootoutScore = awayScoreData.shootout;
        console.log('Away score fetched:', awayScore, 'Shootout:', awayShootoutScore);
      }
    } catch (error) {
      console.error('Error fetching scores:', error);
      // Fallback to any existing score values
      homeScore = homeCompetitor?.score?.value || 0;
      awayScore = awayCompetitor?.score?.value || 0;
      homeShootoutScore = homeCompetitor?.score?.shootout;
      awayShootoutScore = awayCompetitor?.score?.shootout;
    }

    // If no $ref URLs, check for direct score values
    if (homeScore === null) {
      homeScore = homeCompetitor?.score?.value || homeCompetitor?.score || 0;
    }
    if (awayScore === null) {
      awayScore = awayCompetitor?.score?.value || awayCompetitor?.score || 0;
    }
    
    // If no shootout scores from $ref, check for direct values
    if (homeShootoutScore === null || homeShootoutScore === undefined) {
      homeShootoutScore = homeCompetitor?.shootoutScore;
    }
    if (awayShootoutScore === null || awayShootoutScore === undefined) {
      awayShootoutScore = awayCompetitor?.shootoutScore;
    }

    console.log('Final scores - Home:', homeScore, 'Away:', awayScore);
    console.log('Final shootout scores - Home:', homeShootoutScore, 'Away:', awayShootoutScore);

    // Process scorers (similar to soccer web renderScorersBox)
    const processScorers = (team) => {
      const scorers = team?.statistics?.find(stat => stat.name === 'scorers')?.athletes || [];
      return scorers.map(scorer => ({
        displayName: scorer.athlete?.displayName || 'Unknown',
        clock: scorer.clock || '',
        penaltyKick: scorer.penaltyKick || false
      }));
    };

    const homeScorers = processScorers(homeCompetitor);
    const awayScorers = processScorers(awayCompetitor);

    return {
      ...data,
      homeLogo,
      awayLogo,
      homeScorers,
      awayScorers,
      // Add processed scores to the data
      processedScores: {
        home: homeScore,
        away: awayScore
      },
      // Add processed shootout scores to the data
      processedShootoutScores: {
        home: homeShootoutScore,
        away: awayShootoutScore
      },
      // Also update the competitors with proper home/away order
      homeCompetitor,
      awayCompetitor
    };
  };

  // Toggle function for plays (track by stable play key/id instead of index)
  const togglePlay = (playKey) => {
    // Animate layout changes for immediate, snappy expansion
    try {
      // Animate opacity only with a short duration to avoid layout size/position morphing
      const animConfig = LayoutAnimation.create(
        120,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity
      );
      LayoutAnimation.configureNext(animConfig);
    } catch (e) {
      // ignore if LayoutAnimation not available
    }

    const newOpenPlays = new Set(openPlays);
    if (newOpenPlays.has(playKey)) {
      newOpenPlays.delete(playKey);
    } else {
      newOpenPlays.add(playKey);
    }
    setOpenPlays(newOpenPlays);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // Clear stats data to ensure fresh data is fetched
    setStatsData(null);
    await loadGameDetails();
    setRefreshing(false);
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
      // Match in progress - show clock time and half info
      const displayClock = status.type.shortDetail || "0'";
      const period = status.period;
      
      // Check if it's halftime
      if (status.type?.description === "Halftime") {
        return {
          text: 'HT',
          detail: 'Halftime',
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
        text: displayClock,
        detail: halfText,
        isLive: true,
        isPre: false,
        isPost: false
      };
    } else {
      return {
        text: 'FT',
        detail: 'Full Time',
        isLive: false,
        isPre: false,
        isPost: true
      };
    }
  };

  // Streaming functionality based on scoreboard.js logic (lines 1692-2743)
  const STREAM_API_BASE = 'https://streamed.pk/api';

  const normalizeTeamName = (teamName) => {
    // Special cases for specific team names (from scoreboard.js)
    const specialCases = {
      'paris saint germain': 'psg',
      'paris saint-germain': 'psg',
      'tottenham hotspur': 'tottenham-hotspur',
      'tottenham': 'tottenham-hotspur',
      'manchester united': 'manchester-united',
      'manchester city': 'manchester-city',
      'real madrid': 'real-madrid',
      'atletico madrid': 'atletico-madrid',
      'bayern munich': 'bayern-munich',
      'borussia dortmund': 'borussia-dortmund',
      'stade rennais': 'rennes',
      'marseille': 'olympique-marseille',
      'lafc': 'los-angeles-fc',
      'sporting kansas city': 'sporting-kc',
      'chicago fire fc': 'chicago-fire',
      'st. louis city sc': 'st-louis-city',
      'afc bournemouth': 'bournemouth',
      'bournemouth': 'bournemouth',
      'west ham united': 'west-ham-united',
      'west ham': 'west-ham-united',
      'brighton & hove albion': 'brighton',
      'brighton': 'brighton',
      'crystal palace': 'crystal-palace',
      'newcastle united': 'newcastle-united',
      'newcastle': 'newcastle-united',
      'wolverhampton wanderers': 'wolves',
      'wolves': 'wolves',
      'nottingham forest': 'nottingham-forest',
      'fulham': 'fulham',
      'burnley': 'burnley',
      'sheffield united': 'sheffield-united',
      'luton town': 'luton-town',
      'millwall': 'millwall',
      'preston north end': 'preston',
      'coventry city': 'coventry-city',
      'swansea city': 'swansea-city',
      'swansea': 'swansea-city',
      'norwich city': 'norwich-city',
      'norwich': 'norwich-city',
      'watford': 'watford',
      'sunderland': 'sunderland',
      'middlesbrough': 'middlesbrough',
      'hull city': 'hull-city',
      'cardiff city': 'cardiff-city',
      'cardiff': 'cardiff-city'
    };
    
    const lowerName = teamName.toLowerCase();
    if (specialCases[lowerName]) {
      return specialCases[lowerName];
    }
    
    // Convert team names to streaming format with proper special character handling
    return teamName.toLowerCase()
      // First, convert special characters to ASCII equivalents (matching API format)
      .replace(/á/g, 'a')
      .replace(/é/g, 'e')
      .replace(/í/g, 'i')
      .replace(/ó/g, 'o')
      .replace(/ú/g, 'u')
      .replace(/ü/g, 'u')
      .replace(/ñ/g, 'n')
      .replace(/ç/g, 'c')
      .replace(/ß/g, 'ss')
      // Handle accented characters that become multiple characters
      .replace(/ë/g, 'e')
      .replace(/ï/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ä/g, 'a')
      .replace(/å/g, 'a')
      .replace(/ø/g, 'o')
      // Convert spaces to hyphens
      .replace(/\s+/g, '-')
      // Remove any remaining non-alphanumeric characters except hyphens
      .replace(/[^a-z0-9\-]/g, '')
      // Clean up multiple hyphens
      .replace(/-+/g, '-')
      // Remove leading/trailing hyphens
      .replace(/^-+|-+$/g, '')
      // Remove common prefixes/suffixes (be more conservative)
      .replace(/^afc-/, '')  // Remove "AFC " prefix
      .replace(/-afc$/, '')  // Remove " AFC" suffix
      // Keep "FC " prefix as it's often part of the official name
  };

  const fetchLiveMatches = async () => {
    try {
      console.log(`Fetching live matches from API...`);
      const response = await fetch(convertToHttps(`${STREAM_API_BASE}/matches/live`));

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const allMatches = await response.json();
      console.log(`Found ${allMatches.length} total live matches`);

      // Debug: Check what category values are in the API response
      if (allMatches.length > 0) {
        const uniqueCategories = [...new Set(allMatches.map(match => match.category || match.sport).filter(category => category))];
        console.log('Available categories in API:', uniqueCategories);

        // Show sample of matches with their category values
        console.log('Sample matches with category values:');
        for (let i = 0; i < Math.min(5, allMatches.length); i++) {
          const match = allMatches[i];
          const categoryValue = match.category || match.sport || 'undefined';
          console.log(`  Match ${i+1}: "${match.title}" - Category: "${categoryValue}"`);
        }
      }

      // Filter matches by category (for soccer: football or other)
      const relevantCategories = ['football', 'other'];
      const matches = allMatches.filter(match => {
        const matchCategory = match.category || match.sport;
        return relevantCategories.includes(matchCategory);
      });
      console.log(`Filtered to ${matches.length} soccer matches (${relevantCategories.join(' or ')})`);
      return matches;
    } catch (error) {
      console.error('Error fetching live matches:', error);
      return [];
    }
  };

  const fetchStreamsForSource = async (source, sourceId) => {
    try {
      console.log(`Fetching streams for ${source}/${sourceId}...`);
      const response = await fetch(convertToHttps(`${STREAM_API_BASE}/stream/${source}/${sourceId}`));

      if (!response.ok) {
        throw new Error(`Stream API request failed: ${response.status}`);
      }

      const streams = await response.json();
      console.log(`Found ${streams.length} streams for ${source}`);
      return streams;
    } catch (error) {
      console.error(`Error fetching streams for ${source}/${sourceId}:`, error);
      return [];
    }
  };

  const findMatchStreams = async (homeTeamName, awayTeamName) => {
    try {
      console.log(`Looking for streams: ${homeTeamName} vs ${awayTeamName}`);

      // Fetch live matches for soccer (football and other categories)
      let matches = await fetchLiveMatches();

      // Debug: Check if we got any matches and what they look like
      console.log(`After filtering: Got ${matches.length} soccer matches`);
      if (matches.length === 0) {
        console.log('No soccer matches found! This could be due to:');
        console.log('1. API category field name changed');
        console.log('2. Category value is different than expected');
        console.log('3. No football or other category matches currently live');

        // Try fallback: search all matches if no football matches found
        console.log('Trying fallback: searching all matches...');
        try {
          const allMatchesResponse = await fetch(convertToHttps(`${STREAM_API_BASE}/matches/live`));
          if (allMatchesResponse.ok) {
            const allMatchesData = await allMatchesResponse.json();
            console.log(`Fallback: Found ${allMatchesData.length} total matches`);
            // Use all matches as fallback
            matches = allMatchesData;
          }
        } catch (fallbackError) {
          console.error('Fallback fetch failed:', fallbackError);
        }
      } else {
        console.log('Sample filtered matches:');
        for (let i = 0; i < Math.min(3, matches.length); i++) {
          const match = matches[i];
          console.log(`  ${i+1}. "${match.title}" - Sport: "${match.sport}"`);
        }
      }

      // Try to find our match
      const homeNormalized = normalizeTeamName(homeTeamName).toLowerCase();
      const awayNormalized = normalizeTeamName(awayTeamName).toLowerCase();

      console.log(`Normalized names: ${homeNormalized} vs ${awayNormalized}`);

      // Check if both teams have the same first word (city name) - this causes confusion
      const homeFirstWord = homeNormalized.split('-')[0];
      const awayFirstWord = awayNormalized.split('-')[0];
      const hasSameCity = homeFirstWord === awayFirstWord;

      console.log(`Team analysis: Home first word: "${homeFirstWord}", Away first word: "${awayFirstWord}", Same city: ${hasSameCity}`);

      let bestMatch = null;
      let bestScore = 0;

      // Debug: Show first few matches to understand API format
      if (matches.length > 0) {
        console.log('Sample matches from API:');
        for (let i = 0; i < Math.min(10, matches.length); i++) {
          const match = matches[i];
          console.log(`  ${i+1}. Title: "${match.title}"`);
          if (match.teams) {
            console.log(`     Teams: ${match.teams.home?.name || 'N/A'} vs ${match.teams.away?.name || 'N/A'}`);
          }
          if (match.sources) {
            console.log(`     Sources: ${match.sources.map(s => s.source).join(', ')}`);
          }
        }
      }

      // Quick pre-filter to reduce processing - look for obvious matches first
      const quickMatches = matches.slice(0, Math.min(matches.length, 100)).filter(match => {
        const title = match.title.toLowerCase();

        if (hasSameCity) {
          // If teams have same city, require BOTH full team names to be present
          const hasHomeTeam = title.includes(homeNormalized) ||
                             (match.teams?.home?.name?.toLowerCase().includes(homeNormalized));
          const hasAwayTeam = title.includes(awayNormalized) ||
                             (match.teams?.away?.name?.toLowerCase().includes(awayNormalized));
          return hasHomeTeam && hasAwayTeam;
        } else {
          // Normal case: require BOTH teams to have some match, not just one
          const homeHasMatch = title.includes(homeNormalized.split('-')[0]) ||
                              title.includes(homeNormalized.split('-')[1] || '') ||
                              (match.teams?.home?.name?.toLowerCase().includes(homeNormalized.split('-')[0]));
          const awayHasMatch = title.includes(awayNormalized.split('-')[0]) ||
                              title.includes(awayNormalized.split('-')[1] || '') ||
                              (match.teams?.away?.name?.toLowerCase().includes(awayNormalized.split('-')[0]));

          // Require BOTH teams to match, not just one
          return homeHasMatch && awayHasMatch;
        }
      });

      // If we found quick matches, prioritize them
      const matchesToProcess = quickMatches.length > 0 ? quickMatches : matches.slice(0, Math.min(matches.length, 100));

      console.log(`Processing ${matchesToProcess.length} matches (${quickMatches.length > 0 ? 'pre-filtered' : 'full set'})`);

      // Process the filtered matches
      for (let i = 0; i < matchesToProcess.length; i++) {
        const match = matchesToProcess[i];

        if (!match.sources || match.sources.length === 0) continue;

        const matchTitle = match.title.toLowerCase();
        let totalScore = 0;

        // Multiple matching strategies with rough/fuzzy matching
        const strategies = [
          // Strategy 1: Rough name matching in title (more flexible)
          () => {
            let score = 0;
            const titleWords = matchTitle.split(/[\s\-]+/);

            if (hasSameCity) {
              // For same-city teams, require both full team names to be present
              if (matchTitle.includes(homeNormalized) && matchTitle.includes(awayNormalized)) {
                score += 1.0; // High score for exact matches
              } else {
                // Check for partial matches but be more strict
                const homeParts = homeNormalized.split('-').filter(word => word.length > 2);
                const awayParts = awayNormalized.split('-').filter(word => word.length > 2);

                let homeMatches = 0;
                let awayMatches = 0;

                homeParts.forEach(part => {
                  if (titleWords.some(word => word.includes(part))) homeMatches++;
                });
                awayParts.forEach(part => {
                  if (titleWords.some(word => word.includes(part))) awayMatches++;
                });

                // Require at least 2 parts to match for each team when they have same city
                if (homeMatches >= 2 && awayMatches >= 2) {
                  score += 0.8;
                } else if (homeMatches >= 1 && awayMatches >= 1) {
                  score += 0.4;
                }
              }
            } else {
              // Normal case: check if major parts of team names appear in title
              // Be more strict - require longer words and better matches
              const homeParts = homeNormalized.split('-').filter(word => word.length > 3); // Increased from 2 to 3
              const awayParts = awayNormalized.split('-').filter(word => word.length > 3); // Increased from 2 to 3

              let homeScore = 0;
              let awayScore = 0;

              homeParts.forEach(part => {
                if (titleWords.some(word => word.includes(part) && word.length > 2)) homeScore += 0.3;
                if (part.length > 4) homeScore += 0.2; // Bonus for longer, more specific words
              });
              awayParts.forEach(part => {
                if (titleWords.some(word => word.includes(part) && word.length > 2)) awayScore += 0.3;
                if (part.length > 4) awayScore += 0.2; // Bonus for longer, more specific words
              });

              // Require at least one significant match for each team
              if (homeParts.length > 0 && homeScore > 0) score += Math.min(homeScore, 0.8);
              if (awayParts.length > 0 && awayScore > 0) score += Math.min(awayScore, 0.8);
            }

            return score;
          },
          // Strategy 2: Check team objects if available (rough matching)
          () => {
            let score = 0;
            if (match.teams) {
              const homeApiName = match.teams.home?.name?.toLowerCase() || '';
              const awayApiName = match.teams.away?.name?.toLowerCase() || '';

              if (hasSameCity) {
                // For same-city teams, require both API team names to match our normalized names
                if (homeApiName.includes(homeNormalized) && awayApiName.includes(awayNormalized)) {
                  score += 1.2; // Very high score for exact API matches
                } else {
                  // Check for partial matches but be more strict
                  const homeParts = homeNormalized.split('-').filter(word => word.length > 2);
                  const awayParts = awayNormalized.split('-').filter(word => word.length > 2);

                  let homeMatches = 0;
                  let awayMatches = 0;

                  homeParts.forEach(part => {
                    if (homeApiName.includes(part)) homeMatches++;
                  });
                  awayParts.forEach(part => {
                    if (awayApiName.includes(part)) awayMatches++;
                  });

                  // Require at least 2 parts to match for each team when they have same city
                  if (homeMatches >= 2 && awayMatches >= 2) {
                    score += 0.9;
                  } else if (homeMatches >= 1 && awayMatches >= 1) {
                    score += 0.5;
                  }
                }
              } else {
                // Normal case: rough matching against API team names
                const homeParts = homeNormalized.split('-').filter(word => word.length > 3); // Increased from 2 to 3
                const awayParts = awayNormalized.split('-').filter(word => word.length > 3); // Increased from 2 to 3

                let homeMatches = 0;
                let awayMatches = 0;

                homeParts.forEach(part => {
                  if (homeApiName.includes(part) && part.length > 2) homeMatches++;
                });
                awayParts.forEach(part => {
                  if (awayApiName.includes(part) && part.length > 2) awayMatches++;
                });

                // Require more specific matches
                if (homeMatches > 0 && awayMatches > 0) {
                  score += 0.4; // Reduced from 0.6
                } else if (homeMatches > 0 || awayMatches > 0) {
                  score += 0.2; // Reduced from 0.6
                }
              }
            }
            return score;
          },
          // Strategy 3: Soccer-specific abbreviations and common names
          () => {
            const abbreviations = {
              'tottenham': ['tottenham', 'spurs', 'tottenham-hotspur', 'hotspur', 'spurs-fc'],
              'bournemouth': ['bournemouth', 'afc-bournemouth', 'bournemouth-afc', 'cherries'],
              'manchester': ['manchester', 'manchester-united', 'manchester-city', 'man-utd', 'man-city', 'manc'],
              'united': ['united', 'man-united', 'manchester-united', 'utd', 'red-devils'],
              'city': ['city', 'man-city', 'manchester-city', 'citizens', 'sky-blues'],
              'chelsea': ['chelsea', 'chelsea-fc', 'blues', 'pensioners'],
              'arsenal': ['arsenal', 'arsenal-fc', 'gunners', 'gooners'],
              'liverpool': ['liverpool', 'liverpool-fc', 'reds', 'kop'],
              'everton': ['everton', 'everton-fc', 'toffees', 'blues'],
              'aston': ['aston-villa', 'villa', 'villans', 'claret-and-blue'],
              'west': ['west-brom', 'west-ham', 'bromwich', 'hammers', 'irons'],
              'newcastle': ['newcastle', 'newcastle-united', 'magpies', 'toon-army'],
              'brighton': ['brighton', 'brighton-hove-albion', 'seagulls', 'albion'],
              'crystal': ['crystal-palace', 'palace', 'eagles', 'glaziers'],
              'southampton': ['southampton', 'saints', 'southampton-fc'],
              'leicester': ['leicester', 'leicester-city', 'foxes', 'city-foxes'],
              'wolves': ['wolves', 'wolverhampton', 'wanderers', 'wolves-fc'],
              'fulham': ['fulham', 'fulham-fc', 'cottagers', 'whites'],
              'burnley': ['burnley', 'burnley-fc', 'clarets', 'turf-moor'],
              'sheffield': ['sheffield', 'sheffield-united', 'blades', 'sheff-utd'],
              'west-brom': ['west-brom', 'west-bromwich', 'bromwich-albion', 'baggies'],
              'west-ham': ['west-ham', 'west-ham-united', 'hammers', 'irons'],
              'norwich': ['norwich', 'norwich-city', 'canaries', 'yellows'],
              'watford': ['watford', 'watford-fc', 'hornets', 'golden-boys'],
              'brentford': ['brentford', 'brentford-fc', 'bees', 'red-lions'],
              'leeds': ['leeds', 'leeds-united', 'whites', 'peacocks'],
              'cardiff': ['cardiff', 'cardiff-city', 'bluebirds', 'city-bluebirds'],
              'swansea': ['swansea', 'swansea-city', 'swans', 'jack-army'],
              'hull': ['hull', 'hull-city', 'tigers', 'black-and-amber'],
              'middlesbrough': ['middlesbrough', 'boro', 'boro-fc', 'smoggies'],
              'stoke': ['stoke', 'stoke-city', 'potters', 'red-and-white'],
              'sunderland': ['sunderland', 'sunderland-afc', 'black-cats', 'mackems'],
              'birmingham': ['birmingham', 'birmingham-city', 'blues', 'city-blues'],
              'blackburn': ['blackburn', 'blackburn-rovers', 'rovers', 'blue-and-whites'],
              'bolton': ['bolton', 'bolton-wanderers', 'wanderers', 'trotters'],
              'charlton': ['charlton', 'charlton-athletic', 'addicks', 'red-army'],
              'derby': ['derby', 'derby-county', 'rams', 'county-rams'],
              'ipswich': ['ipswich', 'ipswich-town', 'tractor-boys', 'blues'],
              'luton': ['luton', 'luton-town', 'hatters', 'town-hatters'],
              'millwall': ['millwall', 'millwall-fc', 'lions', 'south-london'],
              'nottingham': ['nottingham', 'nottingham-forest', 'forest', 'tricky-trees'],
              'preston': ['preston', 'preston-north-end', 'north-end', 'lilywhites'],
              'reading': ['reading', 'reading-fc', 'royals', 'biscuitmen'],
              'rotherham': ['rotherham', 'rotherham-united', 'millers', 'red-millers'],
              'wigan': ['wigan', 'wigan-athletic', 'latics', 'tics']
            };

            let score = 0;
            const titleWords = matchTitle.split(/[\s\-]+/);

            // Check home team abbreviations (be more selective)
            const homeParts = homeNormalized.split('-');
            homeParts.forEach(part => {
              if (abbreviations[part]) {
                // Only give points if the abbreviation appears as a complete word, not just substring
                abbreviations[part].forEach(abbr => {
                  if (titleWords.some(word => word === abbr || (word.includes(abbr) && abbr.length > 3))) {
                    score += 0.2; // Reduced from 0.3
                  }
                });
              }
            });

            // Check away team abbreviations (be more selective)
            const awayParts = awayNormalized.split('-');
            awayParts.forEach(part => {
              if (abbreviations[part]) {
                // Only give points if the abbreviation appears as a complete word, not just substring
                abbreviations[part].forEach(abbr => {
                  if (titleWords.some(word => word === abbr || (word.includes(abbr) && abbr.length > 3))) {
                    score += 0.2; // Reduced from 0.3
                  }
                });
              }
            });

            return score;
          }
        ];

        // Apply all strategies and sum scores
        strategies.forEach(strategy => {
          totalScore += strategy();
        });

        console.log(`Match "${match.title.substring(0, 50)}..." score: ${totalScore.toFixed(2)}`);

        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestMatch = match;

          // Early exit if we find a very good match (increased threshold to prevent wrong matches)
          if (bestScore >= 2.0) {
            console.log(`Found excellent match with score ${bestScore}, stopping search early`);
            break;
          }
        }
      }

      if (!bestMatch || bestScore < 0.5) { // Increased from 0.3 to 0.5 for stricter matching
        console.log(`No good matching live match found in API (best score: ${bestScore.toFixed(2)})`);
        console.log(`Searched for: ${homeNormalized} vs ${awayNormalized}`);
        console.log(`Processed: ${matchesToProcess.length} matches out of ${matches.length} total`);
        return {};
      }

      console.log(`Found matching match: ${bestMatch.title} (score: ${bestScore.toFixed(2)})`);

      // VALIDATION: Ensure the matched game actually contains both teams with stricter checking
      const matchedTitle = bestMatch.title.toLowerCase();
      const matchedHomeTeam = bestMatch.teams?.home?.name?.toLowerCase() || '';
      const matchedAwayTeam = bestMatch.teams?.away?.name?.toLowerCase() || '';

      // Check if both teams appear in the title (using flexible word matching like relevance check)
      const homeWords = homeNormalized.split('-').filter(word => word.length > 2);
      const awayWords = awayNormalized.split('-').filter(word => word.length > 2);

      let homeInTitle = false;
      let awayInTitle = false;

      // Check if significant words from each team appear in title or API team names
      homeWords.forEach(word => {
        if (matchedTitle.includes(word) || matchedHomeTeam.includes(word)) homeInTitle = true;
      });
      awayWords.forEach(word => {
        if (matchedTitle.includes(word) || matchedAwayTeam.includes(word)) awayInTitle = true;
      });

      // Additional validation: ensure the matched teams are actually relevant
      // For example, if we're looking for "Manchester City", don't match "Montevideo City Torque"
      let relevantHomeMatches = 0;
      let relevantAwayMatches = 0;

      homeWords.forEach(word => {
        if (matchedTitle.includes(word) || matchedHomeTeam.includes(word)) relevantHomeMatches++;
      });
      awayWords.forEach(word => {
        if (matchedTitle.includes(word) || matchedAwayTeam.includes(word)) relevantAwayMatches++;
      });

      // Require at least 50% of significant words to match for each team
      const homeRelevanceRatio = relevantHomeMatches / Math.max(1, homeWords.length);
      const awayRelevanceRatio = relevantAwayMatches / Math.max(1, awayWords.length);

      if (!homeInTitle || !awayInTitle || homeRelevanceRatio < 0.5 || awayRelevanceRatio < 0.5) {
        console.log(`WARNING: Matched game "${bestMatch.title}" doesn't contain both teams or isn't relevant enough!`);
        console.log(`Expected: ${homeNormalized} vs ${awayNormalized}`);
        console.log(`Found in title: Home=${homeInTitle}, Away=${awayInTitle}`);
        console.log(`API teams: Home="${matchedHomeTeam}", Away="${matchedAwayTeam}"`);
        console.log(`Relevance: Home=${homeRelevanceRatio.toFixed(2)}, Away=${awayRelevanceRatio.toFixed(2)}`);

        // Reject the match if validation fails
        console.log('Rejecting match due to validation failure - teams do not match or are not relevant');
        return {};
      } else {
        console.log(`✓ Validation passed: Matched game contains both teams and is relevant`);
        console.log(`Relevance scores: Home=${homeRelevanceRatio.toFixed(2)}, Away=${awayRelevanceRatio.toFixed(2)}`);
      }

      // Fetch streams for each source
      const streams = {};

      for (const source of bestMatch.sources) {
        const sourceStreams = await fetchStreamsForSource(source.source, source.id);

        // Store the first stream for each source (usually the best quality)
        if (sourceStreams.length > 0) {
          streams[source.source] = sourceStreams[0];
          console.log(`Got stream for ${source.source}: ${sourceStreams[0].embedUrl}`);
        }
      }

      return streams;
    } catch (error) {
      console.error('Error finding match streams:', error);
      return {};
    }
  };

  const loadStreams = async () => {
    if (!gameData) return;
    
    setStreamLoading(true);
    setStreamError(false);
    
    try {
      const competition = gameData.header?.competitions?.[0];
      const homeTeam = gameData.homeCompetitor || competition?.competitors?.find(comp => comp.homeAway === 'home');
      const awayTeam = gameData.awayCompetitor || competition?.competitors?.find(comp => comp.homeAway === 'away');
      
      const homeTeamName = homeTeam?.team?.displayName || '';
      const awayTeamName = awayTeam?.team?.displayName || '';
      
      console.log('Loading streams for:', homeTeamName, 'vs', awayTeamName);
      
      // Use the API-based stream finding logic from scoreboard.js
      const streams = await findMatchStreams(homeTeamName, awayTeamName);
      
      // Convert the API response format to our expected format
      const convertedStreams = {};
      Object.keys(streams).forEach(source => {
        if (streams[source] && streams[source].embedUrl) {
          convertedStreams[source] = streams[source].embedUrl;
        }
      });
      
      setAvailableStreams(convertedStreams);
      
      // Set default stream to first available
      const streamTypes = Object.keys(convertedStreams);
      if (streamTypes.length > 0) {
        setCurrentStreamType(streamTypes[0]);
      }
      
    } catch (error) {
      console.error('Error loading streams:', error);
      setStreamError(true);
    } finally {
      setStreamLoading(false);
    }
  };

  const renderStickyHeader = () => {
    if (!gameData) return null;
    
    const competition = gameData.header?.competitions?.[0];
    // Use processed competitors if available, fallback to original structure
    const homeTeam = gameData.homeCompetitor || competition?.competitors?.find(comp => comp.homeAway === 'home') || competition?.competitors?.[0];
    const awayTeam = gameData.awayCompetitor || competition?.competitors?.find(comp => comp.homeAway === 'away') || competition?.competitors?.[1];
    const matchStatus = getMatchStatus();
    
    // Get winner/loser status using shootout logic
    const { homeIsWinner, awayIsWinner, isDraw } = determineWinnerWithShootout();
    const homeIsLoser = matchStatus.isPost && !isDraw && !homeIsWinner;
    const awayIsLoser = matchStatus.isPost && !isDraw && !awayIsWinner;

    // Format date for display
    const formatDate = () => {
      if (!competition?.date) return '';
      const date = new Date(competition.date);
      const today = new Date();
      const isToday = date.toDateString() === today.toDateString();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const isYesterday = date.toDateString() === yesterday.toDateString();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const isTomorrow = date.toDateString() === tomorrow.toDateString();
      
      if (isToday) return 'Today';
      if (isYesterday) return 'Yesterday';
      if (isTomorrow) return 'Tomorrow';
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    return (
      <Animated.View
        style={[
          styles.stickyHeader,
          { backgroundColor: theme.surface, opacity: stickyHeaderOpacity }
        ]}
      >
        <View style={styles.stickyContent}>
          {/* Home Team (Left) */}
          <View style={styles.stickyTeamContainer}>
            <View style={styles.stickyTeamInfo}>
              <TeamLogoImage 
                teamId={gameData.homeCompetitor?.team?.id}
                style={[
                  styles.stickyLogo,
                  // Apply loser styling if home team is losing (only for finished games)
                  homeIsLoser && {
                    opacity: 0.6
                  }
                ]}
              />
              <Text allowFontScaling={false} style={[
                styles.stickyTeamAbbr, 
                { 
                  color: isFavorite(homeTeam?.team?.id, 'serie a') ? colors.primary : theme.text 
                },
                // Apply loser styling if home team is losing (only for finished games)
                homeIsLoser && {
                  opacity: 0.6
                }
              ]}>
                {isFavorite(homeTeam?.team?.id, 'serie a') && '★ '}
                {homeTeam?.team?.abbreviation || homeTeam?.team?.displayName?.substring(0, 3) || 'TBD'}
              </Text>
            </View>
            {(matchStatus.isLive || matchStatus.isPost) && (
              <View style={styles.scoreContainer}>
                <Text allowFontScaling={false} style={[
                  styles.stickyScore, 
                  { color: theme.text },
                  // Apply loser styling if home team is losing (only for finished games)
                  homeIsLoser && {
                    opacity: 0.6
                  }
                ]}>
                  {getTeamScore('home')}
                </Text>
                {getTeamShootoutScore('home') && (
                  <Text allowFontScaling={false} style={[
                    styles.shootoutScore, 
                    { color: theme.textSecondary },
                    // Apply loser styling if home team is losing
                    homeIsLoser && {
                      opacity: 0.6
                    }
                  ]}>
                    ({getTeamShootoutScore('home')})
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Status (Center) */}
          <View style={styles.stickyStatusContainer}>
            <Text allowFontScaling={false} style={[styles.stickyStatusText, { color: theme.text }]}>
              {matchStatus.isPre ? (
                competition?.date ? new Date(competition.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Scheduled'
              ) : matchStatus.isPost ? (
                'Full Time'
              ) : (
                matchStatus.text
              )}
            </Text>
            <Text allowFontScaling={false} style={[styles.stickyStatusDetail, { color: theme.textSecondary }]}>
              {matchStatus.isPre ? (
                formatDate()
              ) : matchStatus.isPost ? (
                formatDate()
              ) : (
                matchStatus.detail
              )}
            </Text>
          </View>

          {/* Away Team (Right) */}
          <View style={[styles.stickyTeamContainer, { justifyContent: 'flex-end' }]}>
            {(matchStatus.isLive || matchStatus.isPost) && (
              <View style={[styles.scoreContainer, styles.awayScoreContainer]}>
                {getTeamShootoutScore('away') && (
                  <Text allowFontScaling={false} style={[
                    styles.shootoutScore, 
                    { color: theme.textSecondary },
                    // Apply loser styling if away team is losing
                    awayIsLoser && {
                      opacity: 0.6
                    }
                  ]}>
                    ({getTeamShootoutScore('away')})
                  </Text>
                )}
                <Text allowFontScaling={false} style={[
                  styles.stickyScoreAway, 
                  { color: theme.text },
                  // Apply loser styling if away team is losing (only for finished games)
                  awayIsLoser && {
                    opacity: 0.6
                  }
                ]}>
                  {getTeamScore('away')}
                </Text>
              </View>
            )}
            <View style={styles.stickyTeamInfo}>
              <Text allowFontScaling={false} style={[
                styles.stickyTeamAbbr, 
                { 
                  color: isFavorite(awayTeam?.team?.id, 'serie a') ? colors.primary : theme.text 
                },
                // Apply loser styling if away team is losing (only for finished games)
                awayIsLoser && {
                  opacity: 0.6
                }
              ]}>
                {isFavorite(awayTeam?.team?.id, 'serie a') && '★ '}
                {awayTeam?.team?.abbreviation || awayTeam?.team?.displayName?.substring(0, 3) || 'TBD'}
              </Text>
              <TeamLogoImage 
                teamId={gameData.awayCompetitor?.team?.id}
                style={[
                  styles.stickyLogoAway,
                  // Apply loser styling if away team is losing (only for finished games)
                  awayIsLoser && {
                    opacity: 0.6
                  }
                ]}
              />
            </View>
          </View>
        </View>
      </Animated.View>
    );
  };

  const renderHeaderScorersBox = () => {
    const { homeScorers, awayScorers } = scorersData;
    
    // Always show the scorers box if there's game data
    if (!gameData) {
      return null;
    }

    return (
      <View style={styles.headerScorersContainer}>
        {/* Home Scorers (Left) */}
        <View style={styles.headerScorersColumn}>
          {homeScorers.length > 0 ? (
            homeScorers.map((scorer, index) => (
              <Text allowFontScaling={false} key={index} style={[styles.headerScorerText, { color: theme.text }]}>
                {scorer.displayText}
              </Text>
            ))
          ) : (
            <Text allowFontScaling={false} style={[styles.headerScorerText, { color: theme.textSecondary }]}>
              No scorers
            </Text>
          )}
        </View>

        {/* Soccer Ball Separator */}
        <View style={styles.headerSoccerBallContainer}>
          <Text allowFontScaling={false} style={styles.headerSoccerBallEmoji}>⚽</Text>
        </View>

        {/* Away Scorers (Right) */}
        <View style={styles.headerScorersColumn}>
          {awayScorers.length > 0 ? (
            awayScorers.map((scorer, index) => (
              <Text allowFontScaling={false} key={index} style={[styles.headerScorerText, { color: theme.text }]}>
                {scorer.displayText}
              </Text>
            ))
          ) : (
            <Text allowFontScaling={false} style={[styles.headerScorerText, { color: theme.textSecondary }]}>
              No scorers
            </Text>
          )}
        </View>
      </View>
    );
  };

  const processScorersFromPlays = () => {
    if (!playsData || !Array.isArray(playsData)) {
      return { homeScorers: [], awayScorers: [] };
    }

    const homeScorersMap = new Map();
    const awayScorersMap = new Map();

    // Filter scoring plays - be more flexible with goal types but exclude shootout goals
    const scoringPlays = playsData
      .filter(play => {
        // Check for scoring plays that are goals
        const isGoal = play.scoringPlay && (
          play.type?.id === "70" || // Standard goal
          play.type?.id === "71" || // Penalty goal
          play.type?.name?.toLowerCase().includes('goal') ||
          play.text?.toLowerCase().includes('goal') ||
          play.shortText?.toLowerCase().includes('goal')
        );
        
        // Check if it's a shootout goal and exclude it
        const isShootout = play.shootout || 
                          play.text?.toLowerCase().includes('shootout') ||
                          play.shortText?.toLowerCase().includes('shootout') ||
                          play.type?.name?.toLowerCase().includes('shootout');
        
        return isGoal && !isShootout;
      })
      .sort((a, b) => {
        // Sort by clock value (earliest first)
        const aTime = a.clock?.value || 0;
        const bTime = b.clock?.value || 0;
        return aTime - bTime;
      });

    scoringPlays.forEach(play => {
      // Find the scorer in participants
      const scorer = play.participants?.find(p => p.type === "scorer");
      if (!scorer?.athlete) {
        return;
      }

      const athleteId = scorer.athlete.$ref || scorer.athlete.id;
      const time = play.clock?.displayValue || '';
      
      // Check for own goal and penalty
      const isOwnGoal = play.ownGoal || play.text?.toLowerCase().includes('own goal') || 
                       play.shortText?.toLowerCase().includes('own goal') ||
                       play.type?.name?.toLowerCase().includes('own goal');
      const isPenalty = play.penaltyKick || 
                       play.text?.toLowerCase().includes('penalty') ||
                       play.shortText?.toLowerCase().includes('penalty');
      
      // Format time with appropriate suffix
      let timeWithSuffix = time;
      if (isOwnGoal) {
        timeWithSuffix = `${time} (OG.)`;
      } else if (isPenalty) {
        timeWithSuffix = `${time} (P.)`;
      }
      
      // Parse clock value for proper sorting, especially for extra time
      let sortingValue = play.clock?.value || 0;
      
      // For extra time (like "45'+4'"), we need to add the extra minutes to the base time
      if (time.includes("'+")) {
        const match = time.match(/(\d+)'\+(\d+)'/);
        if (match) {
          const baseTime = parseInt(match[1]);
          const extraTime = parseInt(match[2]);
          sortingValue = (baseTime * 60) + extraTime; // Convert to seconds for accurate sorting
        }
      } else if (time.includes("'")) {
        const match = time.match(/(\d+)'/);
        if (match) {
          sortingValue = parseInt(match[1]) * 60; // Convert regular minutes to seconds
        }
      }
      
      // Better team identification - use the team from the play or the scorer's team
      let isAwayGoal = false;
      if (play.team) {
        // Extract team ID from play.team
        const playTeamId = typeof play.team === 'string' ? 
          play.team.match(/teams\/(\d+)/)?.[1] : 
          play.team.id || play.team.$ref?.match(/teams\/(\d+)/)?.[1];
        
        // Compare with away team ID from gameData
        const awayTeamId = gameData?.header?.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away')?.team?.id;
        isAwayGoal = playTeamId === awayTeamId?.toString();
      } else {
        // Fallback to score comparison (less reliable)
        isAwayGoal = play.awayScore > (play.homeScore || 0);
      }
      
      // Get player name - try multiple sources and clean up
      let playerName = '';
      
      // First try participant name
      if (scorer.athlete.displayName) {
        playerName = scorer.athlete.displayName;
      } else if (scorer.athlete.name) {
        playerName = scorer.athlete.name;
      }
      
      // Fallback to extracting from text
      if (!playerName && play.shortText) {
        // For penalties, shortText might be "Mikel Oyarzabal Penalty Goal"
        if (isPenalty) {
          playerName = play.shortText.replace(/\s*(Penalty|Goal)\s*/gi, '').trim();
        }
        // For own goals, shortText might be "Álex Berenguer Own Goal" 
        else if (isOwnGoal) {
          playerName = play.shortText.replace(/\s*(Own|Goal)\s*/gi, '').trim();
        }
        // Regular goals: "Player Name Goal"
        else {
          playerName = play.shortText.replace(/\s*Goal\s*/gi, '').trim();
        }
      } else if (!playerName && play.text) {
        // Extract from longer text format - try different patterns
        let match;
        
        // For penalties: "Goal! Team Penalty - Scored by Player Name (Penalty)"
        if (isPenalty) {
          match = play.text.match(/Penalty - Scored by ([^(]+)/i) ||
                  play.text.match(/Goal! .+ ([^-]+) - Penalty/i) ||
                  play.text.match(/Goal! .+ ([^(]+) \(Penalty\)/i);
        }
        // For own goals: "Goal! Team Own Goal by Player Name"
        else if (isOwnGoal) {
          match = play.text.match(/Own Goal by ([^(]+)/i) ||
                  play.text.match(/Goal! .+ ([^-]+) - Own Goal/i) ||
                  play.text.match(/Goal! .+ ([^(]+) \(Own Goal\)/i);
        }
        // Regular goals
        else {
          match = play.text.match(/Goal! .+ ([^(]+) \(/) ||
                  play.text.match(/([^-]+) - [^0-9]*\d+'/);
        }
        
        if (match) {
          playerName = match[1].trim();
        }
      }
      
      // Clean up player name - remove common prefixes and suffixes
      if (playerName) {
        playerName = playerName
          .replace(/^(Header|Left footed shot|Right footed shot|Shot|Penalty|Own Goal|Own)\s*-?\s*/i, '')
          .replace(/\s*-\s*(Header|Head|Left footed shot|Right footed shot|Shot|Penalty|Scored|Own Goal|Own|Volley).*$/i, '')
          .replace(/\s*\(.*\)$/i, '') // Remove any remaining parentheses content
          .replace(/\s*Goal\s*/gi, '') // Remove any remaining "Goal" text
          .replace(/\s*-\s*(Header|Head|Left footed|Right footed|Shot|Penalty|Own Goal|Own|Volley)\s*\d+.*$/i, '') // Remove goal type with time
          .trim();
      }

      if (!playerName) {
        return;
      }

      // Add to appropriate team map
      const targetMap = isAwayGoal ? awayScorersMap : homeScorersMap;
      
      if (targetMap.has(athleteId)) {
        // Player already scored, add this time
        const existing = targetMap.get(athleteId);
        existing.times.push(timeWithSuffix);
        // Update sorting value to earliest goal if this is earlier
        if (sortingValue < existing.firstGoalTime) {
          existing.firstGoalTime = sortingValue;
        }
      } else {
        // New scorer - track first goal time for sorting
        targetMap.set(athleteId, {
          name: playerName,
          times: [timeWithSuffix],
          athleteId,
          firstGoalTime: sortingValue // Use parsed sorting value
        });
      }
    });

    // Convert maps to arrays with formatted display and sort by first goal time
    const formatScorers = (scorersMap) => {
      return Array.from(scorersMap.values())
        .sort((a, b) => a.firstGoalTime - b.firstGoalTime) // Sort by time of first goal
        .map(scorer => ({
          displayText: `${scorer.name} ${scorer.times.join(', ')}`,
          name: scorer.name,
          times: scorer.times,
          firstGoalTime: scorer.firstGoalTime
        }));
    };

    const homeScorers = formatScorers(homeScorersMap);
    const awayScorers = formatScorers(awayScorersMap);
    
    return {
      homeScorers,
      awayScorers
    };
  };

  // Memoized scorers data to prevent redundant processing
  const scorersData = useMemo(() => {
    if (!playsData || !Array.isArray(playsData)) {
      return { homeScorers: [], awayScorers: [] };
    }
    return processScorersFromPlays();
  }, [playsData, gameData]);

  const renderScorersBox = () => {
    const { homeScorers, awayScorers } = scorersData;
    
    // Don't show scorers if there's a shootout
    if (hasShootout()) {
      return null;
    }
    
    if (!homeScorers.length && !awayScorers.length) {
      return null;
    }

    return (
      <View style={[styles.scorersContainer, { backgroundColor: theme.surface }]}>
        <Text allowFontScaling={false} style={[styles.scorersTitle, { color: theme.text }]}>Goal Scorers</Text>
        <View style={styles.scorersBox}>
          <View style={styles.scorersColumn}>
            <Text allowFontScaling={false} style={[styles.scorersHeader, { color: theme.textSecondary }]}>
              {gameData.header?.competitions?.[0]?.competitors?.[1]?.team?.displayName}
            </Text>
            {awayScorers.length > 0 ? (
              awayScorers.map((scorer, index) => (
                <Text allowFontScaling={false} key={index} style={[styles.scorerText, { color: theme.text }]}>
                  {scorer.displayText}
                </Text>
              ))
            ) : (
              <Text allowFontScaling={false} style={[styles.noScorers, { color: theme.text }]}>No scorers</Text>
            )}
          </View>

          <View style={styles.soccerBallContainer}>
            <Text allowFontScaling={false} style={styles.soccerBallEmoji}>⚽</Text>
          </View>

          <View style={styles.scorersColumn}>
            <Text allowFontScaling={false} style={[styles.scorersHeader, { color: theme.textSecondary }]}>
              {gameData.header?.competitions?.[0]?.competitors?.[0]?.team?.displayName}
            </Text>
            {homeScorers.length > 0 ? (
              homeScorers.map((scorer, index) => (
                <Text allowFontScaling={false} key={index} style={[styles.scorerText, { color: theme.text }]}>
                  {scorer.displayText}
                </Text>
              ))
            ) : (
              <Text allowFontScaling={false} style={[styles.noScorers, { color: theme.text }]}>No scorers</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderMatchHeader = () => {
    if (!gameData) return null;

    const competition = gameData.header?.competitions?.[0];
    // Use processed competitors if available, fallback to original structure
    const homeTeam = gameData.homeCompetitor || competition?.competitors?.find(comp => comp.homeAway === 'home') || competition?.competitors?.[0];
    const awayTeam = gameData.awayCompetitor || competition?.competitors?.find(comp => comp.homeAway === 'away') || competition?.competitors?.[1];
    const matchStatus = getMatchStatus();
    
    // Get winner/loser status using shootout logic
    const { homeIsWinner, awayIsWinner, isDraw } = determineWinnerWithShootout();
    const homeIsLoser = !matchStatus.isLive && !matchStatus.isPre && !isDraw && !homeIsWinner;
    const awayIsLoser = !matchStatus.isLive && !matchStatus.isPre && !isDraw && !awayIsWinner;

    // Get team colors
    const homeColor = ItalyServiceEnhanced.getTeamColorWithAlternateLogic(homeTeam?.team);
    const awayColor = ItalyServiceEnhanced.getTeamColorWithAlternateLogic(awayTeam?.team);

    return (
      <View style={[styles.headerContainer, { backgroundColor: theme.surface }]}>
        {/* Competition Info */}
        <View style={styles.competitionContainer}>
          <Text allowFontScaling={false} style={[styles.competitionText, { color: theme.textSecondary }]}>
            {gameData.competitionName || 'Italy'}
          </Text>
        </View>

        {/* Match Info */}
        <View style={styles.matchContainer}>
          {/* Home Team (Left) */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoAndScore}>
              <TeamLogoImage 
                teamId={gameData.homeCompetitor?.team?.id}
                style={[
                  styles.teamLogo,
                  // Apply loser styling if home team is losing (only for finished games)
                  homeIsLoser && {
                    opacity: 0.6
                  }
                ]}
              />
              <View style={styles.scoreBox}>
                <View style={styles.scoreWithShootout}>
                  <Text allowFontScaling={false} style={[
                    styles.scoreText, 
                    { color: theme.text },
                    // Apply loser styling if home team is losing (only for finished games)
                    homeIsLoser && {
                      opacity: 0.6,
                      fontWeight: '500'
                    }
                  ]}>
                    {getTeamScore('home')}
                  </Text>
                  {getTeamShootoutScore('home') && (
                    <Text allowFontScaling={false} style={[
                      styles.shootoutScore, 
                      { color: theme.textSecondary },
                      // Apply loser styling if home team is losing
                      homeIsLoser && {
                        opacity: 0.6
                      }
                    ]}>
                      ({getTeamShootoutScore('home')})
                    </Text>
                  )}
                </View>
              </View>
            </View>
            <Text allowFontScaling={false} style={[
              styles.teamName, 
              { color: isFavorite(homeTeam?.team?.id, 'serie a') ? colors.primary : theme.text },
              // Apply loser styling if home team is losing (only for finished games)
              homeIsLoser && {
                opacity: 0.6
              }
            ]} numberOfLines={2}>
              {isFavorite(homeTeam?.team?.id, 'serie a') ? '★ ' : ''}{homeTeam?.team?.displayName}
            </Text>
          </View>

          {/* Status */}
          <View style={styles.statusSection}>
            <View style={[
              styles.statusBadge,
              matchStatus.isLive && { backgroundColor: theme.error },
              matchStatus.isPre && { backgroundColor: theme.success },
              !matchStatus.isLive && !matchStatus.isPre && { backgroundColor: theme.textTertiary }
            ]}>
              <Text allowFontScaling={false} style={[
                styles.statusText,
                { color: matchStatus.isLive || matchStatus.isPre ? '#fff' : theme.text }
              ]}>
                {matchStatus.text}
              </Text>
              {matchStatus.detail && (
                <Text allowFontScaling={false} style={[
                  styles.statusDetail,
                  { color: matchStatus.isLive || matchStatus.isPre ? '#fff' : theme.textSecondary }
                ]}>
                  {matchStatus.detail}
                </Text>
              )}
            </View>
            
            {/* Stream Button - Only show for live games */}
            {matchStatus.isLive && (
              <TouchableOpacity
                style={[styles.streamButton, { backgroundColor: colors.primary }]}
                onPress={() => {
                  loadStreams();
                  setShowStreamModal(true);
                }}
              >
                <Text allowFontScaling={false} style={styles.streamButtonText}>Watch Live</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Away Team (Right) */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoAndScore}>
              <View style={styles.scoreBox}>
                <View style={[styles.scoreWithShootout, styles.awayScoreWithShootout]}>
                  {getTeamShootoutScore('away') && (
                    <Text allowFontScaling={false} style={[
                      styles.shootoutScore, 
                      { color: theme.textSecondary },
                      // Apply loser styling if away team is losing
                      awayIsLoser && {
                        opacity: 0.6
                      }
                    ]}>
                      ({getTeamShootoutScore('away')})
                    </Text>
                  )}
                  <Text allowFontScaling={false} style={[
                    styles.scoreText, 
                    { color: theme.text },
                    // Apply loser styling if away team is losing (only for finished games)
                    awayIsLoser && {
                      opacity: 0.6,
                      fontWeight: '500'
                    }
                  ]}>
                    {getTeamScore('away')}
                  </Text>
                </View>
              </View>
              <TeamLogoImage 
                teamId={gameData.awayCompetitor?.team?.id}
                style={[
                  styles.teamLogo,
                  // Apply loser styling if away team is losing (only for finished games)
                  awayIsLoser && {
                    opacity: 0.6
                  }
                ]}
              />
            </View>
            <Text allowFontScaling={false} style={[
              styles.teamName, 
              { color: isFavorite(awayTeam?.team?.id, 'serie a') ? colors.primary : theme.text },
              // Apply loser styling if away team is losing (only for finished games)
              awayIsLoser && {
                opacity: 0.6
              }
            ]} numberOfLines={2}>
              {isFavorite(awayTeam?.team?.id, 'serie a') ? '★ ' : ''}{awayTeam?.team?.displayName}
            </Text>
          </View>
        </View>

        {/* Scorers Box */}
        {renderHeaderScorersBox()}

        {/* Date Info */}
        <View style={styles.timeAndHalfContainer}>
          {competition?.date && (
            <Text allowFontScaling={false} style={[styles.dateText, { color: theme.textSecondary }]}>
              {new Date(competition.date).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </Text>
          )}
        </View>

        {/* Match Details */}
        {competition?.venue && (
          <View style={styles.venueContainer}>
            <Text allowFontScaling={false} style={[styles.venueText, { color: theme.textSecondary }]}>
              📍 {competition.venue.fullName}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderTabs = () => {
    const tabs = [
      { key: 'stats', label: 'Stats' },
      { key: 'home', label: 'Home' },
      { key: 'away', label: 'Away' },
      { key: 'plays', label: 'Plays' }
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
              <Text allowFontScaling={false}
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
      case 'home':
        return renderHomeTab();
      case 'away':
        return renderAwayTab();
      case 'plays':
        return renderPlaysTab();
      default:
        return renderStatsTab();
    }
  };

  const renderStatsTab = () => {
    if (loadingMatchStats) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.textSecondary }]}>
              Loading match statistics...
            </Text>
          </View>
        </View>
      );
    }

    if (!statsData || !statsData.homeTeam || !statsData.awayTeam) {
      return (
        <View style={styles.tabContent}>
          <Text allowFontScaling={false} style={[styles.comingSoonText, { color: theme.textSecondary }]}>
            Match statistics not available
          </Text>
        </View>
      );
    }

    const { homeTeam, awayTeam, headToHeadData } = statsData;

    // Helper function to get stat value preferring normalizedStats (from competitor.$ref)
    const getStat = (team, statName) => {
      try {
        const ns = team?.normalizedStats;
        if (ns) {
          switch (statName) {
            case 'possessionPct':
              if (ns.possession && ns.possession.num != null) return Number(ns.possession.num);
              if (ns.possession && ns.possession.display) return parseFloat(String(ns.possession.display).replace('%','')) || 0;
              break;
            case 'shotsOnTarget':
              if (ns.shots && ns.shots.onGoal != null) return Number(ns.shots.onGoal);
              if (ns.shots && ns.shots.onGoalDisplay) return parseFloat(ns.shots.onGoalDisplay) || 0;
              break;
            case 'totalShots':
            case 'shotAttempts':
              if (ns.shots && ns.shots.total != null) return Number(ns.shots.total);
              if (ns.shots && ns.shots.totalDisplay) return parseFloat(ns.shots.totalDisplay) || 0;
              break;
            case 'foulsCommitted':
              if (ns.discipline && ns.discipline.fouls != null) return Number(ns.discipline.fouls);
              if (ns.discipline && ns.discipline.foulsDisplay) return parseFloat(ns.discipline.foulsDisplay) || 0;
              break;
            case 'yellowCards':
              if (ns.discipline && ns.discipline.yellow != null) return Number(ns.discipline.yellow);
              if (ns.discipline && ns.discipline.yellowDisplay) return parseFloat(ns.discipline.yellowDisplay) || 0;
              break;
            case 'redCards':
              if (ns.discipline && ns.discipline.red != null) return Number(ns.discipline.red);
              if (ns.discipline && ns.discipline.redDisplay) return parseFloat(ns.discipline.redDisplay) || 0;
              break;
            case 'wonCorners':
              if (ns.setPieces && ns.setPieces.corners != null) return Number(ns.setPieces.corners);
              if (ns.setPieces && ns.setPieces.cornersDisplay) return parseFloat(ns.setPieces.cornersDisplay) || 0;
              break;
            case 'saves':
              if (ns.setPieces && ns.setPieces.saves != null) return Number(ns.setPieces.saves);
              if (ns.setPieces && ns.setPieces.savesDisplay) return parseFloat(ns.setPieces.savesDisplay) || 0;
              break;
            default:
              // If caller asked for a direct stat name that might exist in normalizedStats.shots or other groups
              // attempt to resolve common keys
              if (statName === 'shotsInsideBox' && ns.shots && ns.shots.insideBox != null) return Number(ns.shots.insideBox);
              if (statName === 'shotsOutsideBox' && ns.shots && ns.shots.outsideBox != null) return Number(ns.shots.outsideBox);
          }
        }

        // Fallback: old flattened team.statistics array
        const stat = team.statistics?.find(s => s.name === statName);
        if (stat) {
          const parsed = parseFloat(String(stat.displayValue).replace('%',''));
          return Number.isFinite(parsed) ? parsed : (stat.value != null ? stat.value : 0);
        }
      } catch (err) {
        console.log('[ItalyGameDetails] getStat error:', err);
      }
      return 0;
    };

    // Get possession percentages (prefer normalizedStats)
    const homePossession = (homeTeam?.normalizedStats?.possession?.num != null)
      ? Number(homeTeam.normalizedStats.possession.num)
      : getStat(homeTeam, 'possessionPct');
    const awayPossession = (awayTeam?.normalizedStats?.possession?.num != null)
      ? Number(awayTeam.normalizedStats.possession.num)
      : getStat(awayTeam, 'possessionPct');

    // Get team logos using enhanced service with fallbacks
    const homeLogo = gameData?.homeLogo || 'https://via.placeholder.com/40';
    const awayLogo = gameData?.awayLogo || 'https://via.placeholder.com/40';
    
    // Ensure colors are properly formatted with # prefix
    let homeColor = ItalyServiceEnhanced.getTeamColorWithAlternateLogic(homeTeam?.team) || '#007bff';
    let awayColor = ItalyServiceEnhanced.getTeamColorWithAlternateLogic(awayTeam?.team) || '#28a745';
    
    // Add # prefix if missing
    homeColor = homeColor.startsWith('#') ? homeColor : `#${homeColor}`;
    awayColor = awayColor.startsWith('#') ? awayColor : `#${awayColor}`;

    console.log('Team colors:', { homeColor, awayColor });

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        {/* Stats Section Wrapper */}
        <View style={[styles.statsSection, { backgroundColor: theme.card }]}>
          {/* Main Match Stats Container */}
          <View style={[styles.matchStatsContainer, { backgroundColor: theme.surface }]}>
            <Text allowFontScaling={false} style={[styles.statsHeader, { color: colors.primary }]}>Match Stats</Text>
          
          {/* Teams Header */}
          <View style={styles.statsTeams}>
            <View style={styles.statsTeamHome}>
              <TeamLogoImage 
                teamId={homeTeam?.team?.id}
                style={styles.statsTeamLogo}
              />
              <Text allowFontScaling={false} style={[styles.statsTeamName, { color: theme.text }]}>
                {homeTeam.team.shortDisplayName}
              </Text>
            </View>
            <View style={styles.statsTeamAway}>
              <Text allowFontScaling={false} style={[styles.statsTeamName, { color: theme.text }]}>
                {awayTeam.team.shortDisplayName}
              </Text>
              <TeamLogoImage 
                teamId={awayTeam?.team?.id}
                style={styles.statsTeamLogo}
              />
            </View>
          </View>

          {/* Possession Section */}
          <View style={styles.statsSectionInner}>
            <Text allowFontScaling={false} style={[styles.statsSectionTitle, { color: theme.text }]}>Possession</Text>
            <View style={styles.possessionSection}>
              <View style={styles.possessionCircleContainer}>
                <View style={styles.possessionCircle}>
                  <Svg width={120} height={120} style={styles.possessionSvg}>
                    <Defs>
                      <LinearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <Stop offset="0%" stopColor={awayColor} stopOpacity="1" />
                        <Stop offset={`${awayPossession}%`} stopColor={awayColor} stopOpacity="1" />
                        <Stop offset={`${awayPossession}%`} stopColor={homeColor} stopOpacity="1" />
                        <Stop offset="100%" stopColor={homeColor} stopOpacity="1" />
                      </LinearGradient>
                    </Defs>
                    
                    {/* Background circle */}
                    <Circle
                      cx="60"
                      cy="60"
                      r="50"
                      stroke="#ddd"
                      strokeWidth="20"
                      fill="transparent"
                    />
                    
                    {/* Away team arc */}
                    <Circle
                      cx="60"
                      cy="60"
                      r="50"
                      stroke={awayColor}
                      strokeWidth="20"
                      fill="transparent"
                      strokeDasharray={`${(awayPossession / 100) * 314.159} 314.159`}
                      strokeDashoffset="0"
                      transform="rotate(-90 60 60)"
                    />
                    
                    {/* Home team arc */}
                    <Circle
                      cx="60"
                      cy="60"
                      r="50"
                      stroke={homeColor}
                      strokeWidth="20"
                      fill="transparent"
                      strokeDasharray={`${(homePossession / 100) * 314.159} 314.159`}
                      strokeDashoffset="0"
                      transform={`rotate(${(awayPossession / 100) * 360 - 90} 60 60)`}
                    />
                  </Svg>
                  
                  <View style={[styles.possessionCenter, { backgroundColor: theme.surface }]}>
                    <Text allowFontScaling={false} style={[styles.possessionCenterText, { color: theme.text }]}>
                      Possession
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.possessionValues}>
                <View style={styles.possessionTeam}>
                  <View style={[styles.possessionColor, { backgroundColor: homeColor }]} />
                  <Text allowFontScaling={false} style={[styles.possessionTeamText, { color: theme.text }]}>
                    {homeTeam.team.abbreviation} {homePossession}%
                  </Text>
                </View>
                <View style={styles.possessionTeam}>
                  <Text allowFontScaling={false} style={[styles.possessionTeamText, { color: theme.text }]}>
                    {awayPossession}% {awayTeam.team.abbreviation}
                  </Text>
                  <View style={[styles.possessionColor, { backgroundColor: awayColor }]} />
                </View>
              </View>
            </View>
          </View>

          {/* Shots Section */}
          <View style={styles.statsSectionInner}>
            <Text allowFontScaling={false} style={[styles.statsSectionTitle, { color: theme.text }]}>Shots</Text>
            {/* Prefer normalizedStats where available, fall back to getStat */}
            {(() => {
              const homeShotsOnGoal = homeTeam?.normalizedStats?.shots?.onGoal != null ? homeTeam.normalizedStats.shots.onGoal : getStat(homeTeam, 'shotsOnTarget');
              const awayShotsOnGoal = awayTeam?.normalizedStats?.shots?.onGoal != null ? awayTeam.normalizedStats.shots.onGoal : getStat(awayTeam, 'shotsOnTarget');
              const homeTotalShots = homeTeam?.normalizedStats?.shots?.total != null ? homeTeam.normalizedStats.shots.total : getStat(homeTeam, 'totalShots');
              const awayTotalShots = awayTeam?.normalizedStats?.shots?.total != null ? awayTeam.normalizedStats.shots.total : getStat(awayTeam, 'totalShots');
              return (
                <>
                  {renderStatsRow('Shots on Goal', homeShotsOnGoal, awayShotsOnGoal, homeColor, awayColor)}
                  {renderStatsRow('Shot Attempts', homeTotalShots, awayTotalShots, homeColor, awayColor)}
                </>
              );
            })()}
          </View>

          {/* Discipline Section */}
          <View style={styles.statsSectionInner}>
            <Text allowFontScaling={false} style={[styles.statsSectionTitle, { color: theme.text }]}>Discipline</Text>
            {(() => {
              const homeFouls = homeTeam?.normalizedStats?.discipline?.fouls != null ? homeTeam.normalizedStats.discipline.fouls : getStat(homeTeam, 'foulsCommitted');
              const awayFouls = awayTeam?.normalizedStats?.discipline?.fouls != null ? awayTeam.normalizedStats.discipline.fouls : getStat(awayTeam, 'foulsCommitted');
              const homeYellow = homeTeam?.normalizedStats?.discipline?.yellow != null ? homeTeam.normalizedStats.discipline.yellow : getStat(homeTeam, 'yellowCards');
              const awayYellow = awayTeam?.normalizedStats?.discipline?.yellow != null ? awayTeam.normalizedStats.discipline.yellow : getStat(awayTeam, 'yellowCards');
              const homeRed = homeTeam?.normalizedStats?.discipline?.red != null ? homeTeam.normalizedStats.discipline.red : getStat(homeTeam, 'redCards');
              const awayRed = awayTeam?.normalizedStats?.discipline?.red != null ? awayTeam.normalizedStats.discipline.red : getStat(awayTeam, 'redCards');
              return (
                <>
                  {renderStatsRow('Fouls', homeFouls, awayFouls, homeColor, awayColor)}
                  {renderStatsRow('Yellow Cards', homeYellow, awayYellow, homeColor, awayColor)}
                  {renderStatsRow('Red Cards', homeRed, awayRed, homeColor, awayColor)}
                </>
              );
            })()}
          </View>

          {/* Set Pieces Section */}
          <View style={styles.statsSectionInner}>
            <Text allowFontScaling={false} style={[styles.statsSectionTitle, { color: theme.text }]}>Set Pieces</Text>
            {(() => {
              const homeCorners = homeTeam?.normalizedStats?.setPieces?.corners != null ? homeTeam.normalizedStats.setPieces.corners : getStat(homeTeam, 'wonCorners');
              const awayCorners = awayTeam?.normalizedStats?.setPieces?.corners != null ? awayTeam.normalizedStats.setPieces.corners : getStat(awayTeam, 'wonCorners');
              const homeSaves = homeTeam?.normalizedStats?.setPieces?.saves != null ? homeTeam.normalizedStats.setPieces.saves : getStat(homeTeam, 'saves');
              const awaySaves = awayTeam?.normalizedStats?.setPieces?.saves != null ? awayTeam.normalizedStats.setPieces.saves : getStat(awayTeam, 'saves');
              return (
                <>
                  {renderStatsRow('Corner Kicks', homeCorners, awayCorners, homeColor, awayColor)}
                  {renderStatsRow('Saves', homeSaves, awaySaves, homeColor, awayColor)}
                </>
              );
            })()}
          </View>
        </View>

        {/* Head to Head Container */}
        <View style={[styles.h2hContainer, { backgroundColor: theme.surface }]}>
          <View style={styles.h2hHeader}>
            <Text allowFontScaling={false} style={[styles.h2hTitle, { color: colors.primary }]}>Head To Head Record</Text>
          </View>
          <View style={styles.h2hMatches}>
            {renderHeadToHeadMatches(headToHeadData, homeTeam, awayTeam, homeLogo, awayLogo)}
          </View>
        </View>
        </View>
      </ScrollView>
    );
  };

  // Helper function to render stats row with single bar (like MLB)
  const renderStatsRow = (label, homeValue, awayValue, homeColor, awayColor) => {
    const homeNum = typeof homeValue === 'number' ? homeValue : parseFloat(homeValue) || 0;
    const awayNum = typeof awayValue === 'number' ? awayValue : parseFloat(awayValue) || 0;
    const total = homeNum + awayNum;
    const homePercent = total > 0 ? (homeNum / total) * 100 : 50;
    const awayPercent = total > 0 ? (awayNum / total) * 100 : 50;

    return (
      <View key={label} style={styles.statsRow}>
        <Text allowFontScaling={false} style={[styles.statsValue, styles.statsValueAway, { color: theme.text }]}>
          {homeValue}
        </Text>
        <View style={styles.statsBarContainer}>
          <View style={[styles.statsBar, { backgroundColor: theme.border }]}>
            <View 
              style={[
                styles.statsBarFill, 
                styles.statsBarFillAway,
                { width: `${homePercent}%`, backgroundColor: homeColor }
              ]} 
            />
            <View 
              style={[
                styles.statsBarFill, 
                styles.statsBarFillHome,
                { width: `${awayPercent}%`, backgroundColor: awayColor }
              ]} 
            />
          </View>
          <Text allowFontScaling={false} style={[styles.statsLabel, { color: theme.textSecondary }]}>{label}</Text>
        </View>
        <Text allowFontScaling={false} style={[styles.statsValue, styles.statsValueHome, { color: theme.text }]}>
          {awayValue}
        </Text>
      </View>
    );
  };

  // Helper function to render head-to-head matches
  const renderHeadToHeadMatches = (h2hData, homeTeamData, awayTeamData, homeLogoUrl, awayLogoUrl) => {
    if (!h2hData || h2hData.length === 0) {
      return (
        <Text allowFontScaling={false} style={[styles.h2hNoData, { color: theme.textSecondary }]}>
          No recent head-to-head matches
        </Text>
      );
    }

    // Extract events from the first team data and limit to 5
    const events = h2hData[0]?.events || [];
    
    return events.slice(0, 5).map((event, index) => {
      if (!event) return null;
      
      const date = new Date(event.gameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const isHomeTeamAtHome = event.homeTeamId === homeTeamData?.team?.id;
      const homeTeamInMatch = isHomeTeamAtHome ? 
        (homeTeamData?.team?.abbreviation || homeTeamData?.team?.shortDisplayName || 'HOME') : 
        (awayTeamData?.team?.abbreviation || awayTeamData?.team?.shortDisplayName || 'AWAY');
      const awayTeamInMatch = isHomeTeamAtHome ? 
        (awayTeamData?.team?.abbreviation || awayTeamData?.team?.shortDisplayName || 'AWAY') : 
        (homeTeamData?.team?.abbreviation || homeTeamData?.team?.shortDisplayName || 'HOME');
      const homeTeamIdInMatch = isHomeTeamAtHome ? homeTeamData?.team?.id : awayTeamData?.team?.id;
      const awayTeamIdInMatch = isHomeTeamAtHome ? awayTeamData?.team?.id : homeTeamData?.team?.id;
      const score = `${event.homeTeamScore || '0'}-${event.awayTeamScore || '0'}`;

      return (
        <TouchableOpacity 
          key={index} 
          style={[styles.h2hMatch, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => {
            // Navigate to the game details for this head-to-head match
            if (event.id) {
              // Try to pass a competition hint so the details service queries the correct competition first
              const competitionHint = event.competitionCode || event.competition?.id || event.leagueId || event.league?.id || event.competitionName || event.leagueName || null;
              navigation.navigate('ItalyGameDetails', {
                gameId: event.id,
                sport: 'Italian',
                competitionHint
              });
            }
          }}
        >
          <View style={styles.h2hMatchHeader}>
            <Text allowFontScaling={false} style={[styles.h2hDate, { color: theme.textSecondary }]}>{date}</Text>
            <Text allowFontScaling={false} style={[styles.h2hCompetition, { color: theme.textSecondary }]}>
              {event.leagueName || event.leagueAbbreviation || ''}
            </Text>
          </View>
          <View style={styles.h2hMatchTeams}>
            <View style={styles.h2hTeam}>
              <TeamLogoImage 
                teamId={homeTeamIdInMatch}
                style={styles.h2hTeamLogo}
              />
              <Text allowFontScaling={false} style={[styles.h2hTeamName, { color: theme.text }]}>
                {homeTeamInMatch}
              </Text>
            </View>
            <Text allowFontScaling={false} style={[styles.h2hScore, { color: theme.text }]}>{score}</Text>
            <View style={[styles.h2hTeam, styles.h2hTeamReverse]}>
              <TeamLogoImage 
                teamId={awayTeamIdInMatch}
                style={styles.h2hTeamLogo}
              />
              <Text allowFontScaling={false} style={[styles.h2hTeamName, { color: theme.text }]}>
                {awayTeamInMatch}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    });
  };

  const renderHomeTab = () => {
    if (!gameData) return null;
    
    console.log('GAMEDATA KEYS:', Object.keys(gameData));

    const competition = gameData.header?.competitions?.[0];
    const homeTeam = gameData.homeCompetitor || competition?.competitors?.find(comp => comp.homeAway === 'home') || competition?.competitors?.[0];
    
    // Extract players and formation from fetched lineup data (like scoreboard.js)
    const extractPlayersAndSubs = (teamLineup) => {
      console.log('EXTRACTING FROM LINEUP DATA:', teamLineup.length, teamLineup);
      
      const normalized = (Array.isArray(teamLineup) ? teamLineup : [])
        .map(entry => {
          // Use the data structure from scoreboard.js roster format
          const athlete = entry.athlete || entry;
          const starter = entry.starter === true; // Use direct starter flag
          const position = entry.position || {};
          return {
            athlete: {
              displayName: athlete?.displayName || athlete?.fullName || athlete?.name || athlete?.shortName || '',
              lastName: athlete?.lastName || athlete?.displayName?.split(' ').slice(-1)[0] || '',
              id: athlete?.id || `${entry.jersey || 'unknown'}-${starter ? 'starter' : 'sub'}`
            },
            jersey: entry.jersey || athlete?.jersey || entry.jerseyNumber || '',
            starter: starter,
            position: {
              abbreviation: (position?.abbreviation || position?.code || position?.name || '').toString()
            },
            formationPlace: entry.formationPlace || '0',
            // CRITICAL: Preserve substitution and stats data from original entry
            subbedOutFor: entry.subbedOutFor, // For players on pitch who were substituted
            subbedInFor: entry.subbedInFor,   // For substitutes who came in
            plays: entry.plays,               // For substitution timing
            stats: entry.stats || []          // For player statistics popup
          };
        });
      
      // Filter starters and subs like scoreboard.js does
      const starters = normalized.filter(x => x.starter);
      const subs = normalized.filter(x => !x.starter); // Simply filter non-starters as subs
      const formation = lineupData.homeFormation || '4-3-3'; // Use actual formation from API
      
      console.log('EXTRACTED PLAYERS:', { starters: starters.length, subs: subs.length, formation });
      return { starters, subs, formation };
    };

    const { starters: homeStarters, subs: homeSubs, formation: homeFormation } = extractPlayersAndSubs(lineupData.homeLineup);

    console.log('HOME TAB - homeStarters:', homeStarters.length, homeStarters);
    console.log('HOME TAB - homeFormation:', homeFormation);

    return (
      <View style={styles.tabContent}>
        <View style={[styles.teamTabHeader, { backgroundColor: theme.surface }]}>
          <TeamLogoImage 
            teamId={gameData.homeCompetitor?.team?.id}
            style={styles.teamTabLogo}
          />
          <View style={styles.teamTabInfo}>
            <Text allowFontScaling={false} style={[styles.teamTabName, { color: theme.text }]}>
              {homeTeam?.team?.displayName || 'Home Team'}
            </Text>
            <Text allowFontScaling={false} style={[styles.teamTabDescription, { color: theme.textSecondary }]}>
              {homeTeam?.team?.location || ''} • Home
            </Text>
          </View>
        </View>
        {renderSingleTeamPitch(homeStarters, homeFormation, gameData.homeLogo, homeSubs, 'home', gameData.homeCompetitor?.team?.id)}
      </View>
    );
  };

  const renderAwayTab = () => {
    if (!gameData) return null;
    
    const competition = gameData.header?.competitions?.[0];
    const awayTeam = gameData.awayCompetitor || competition?.competitors?.find(comp => comp.homeAway === 'away') || competition?.competitors?.[1];
    
    const extractPlayersAndSubs = (teamLineup) => {
      console.log('AWAY EXTRACTING FROM LINEUP DATA:', teamLineup.length, teamLineup);
      
      const normalized = (Array.isArray(teamLineup) ? teamLineup : [])
        .map(entry => {
          // Use the data structure from scoreboard.js roster format
          const athlete = entry.athlete || entry;
          const starter = entry.starter === true; // Use direct starter flag
          const position = entry.position || {};
          return {
            athlete: {
              displayName: athlete?.displayName || athlete?.fullName || athlete?.name || athlete?.shortName || '',
              lastName: athlete?.lastName || athlete?.displayName?.split(' ').slice(-1)[0] || '',
              id: athlete?.id || `${entry.jersey || 'unknown'}-${starter ? 'starter' : 'sub'}`
            },
            jersey: entry.jersey || athlete?.jersey || entry.jerseyNumber || '',
            starter: starter,
            position: {
              abbreviation: (position?.abbreviation || position?.code || position?.name || '').toString()
            },
            formationPlace: entry.formationPlace || '0',
            // CRITICAL: Preserve substitution and stats data from original entry
            subbedOutFor: entry.subbedOutFor, // For players on pitch who were substituted
            subbedInFor: entry.subbedInFor,   // For substitutes who came in
            plays: entry.plays,               // For substitution timing
            stats: entry.stats || []          // For player statistics popup
          };
        });
      
      // Filter starters and subs like scoreboard.js does
      const starters = normalized.filter(x => x.starter);
      const subs = normalized.filter(x => !x.starter); // Simply filter non-starters as subs
      const formation = lineupData.awayFormation || '4-3-3'; // Use actual formation from API
      
      console.log('AWAY EXTRACTED PLAYERS:', { starters: starters.length, subs: subs.length, formation });
      return { starters, subs, formation };
    };

    const { starters: awayStarters, subs: awaySubs, formation: awayFormation } = extractPlayersAndSubs(lineupData.awayLineup);

    console.log('AWAY TAB - awayStarters:', awayStarters.length, awayStarters);
    console.log('AWAY TAB - awayFormation:', awayFormation);

    return (
      <View style={styles.tabContent}>
        <View style={[styles.teamTabHeader, { backgroundColor: theme.surface }]}>
          <TeamLogoImage 
            teamId={gameData.awayCompetitor?.team?.id}
            style={styles.teamTabLogo}
          />
          <View style={styles.teamTabInfo}>
            <Text allowFontScaling={false} style={[styles.teamTabName, { color: theme.text }]}>
              {awayTeam?.team?.displayName || 'Away Team'}
            </Text>
            <Text allowFontScaling={false} style={[styles.teamTabDescription, { color: theme.textSecondary }]}>
              {awayTeam?.team?.location || ''} • Away
            </Text>
          </View>
        </View>
        {renderSingleTeamPitch(awayStarters, awayFormation, gameData.awayLogo, awaySubs, 'away', gameData.awayCompetitor?.team?.id)}
      </View>
    );
  };

  // ----- Football pitch rendering (EXACT COPY of scoreboard.js) -----
  const getPositionStyles = (formation) => {
    switch (formation) {
      case "4-2-3-1":
        return {
          "G": { bottom: 2.5, left: 50 }, "CD-L": { bottom: 20, left: 30 }, "CD-R": { bottom: 20, left: 70 },
          "LB": { bottom: 30, left: 15 }, "RB": { bottom: 30, left: 85 }, "LM": { bottom: 45, left: 32.5 },
          "AM-L": { bottom: 65, left: 17.5 }, "AM": { bottom: 65, left: 50 }, "AM-R": { bottom: 65, left: 82.5 },
          "RM": { bottom: 45, left: 67.5 }, "F": { bottom: 85, left: 50 }
        };
      case "3-5-2":
        return {
          "G": { bottom: 2.5, left: 50 }, "CD-L": { bottom: 20, left: 25 }, "CD": { bottom: 20, left: 50 }, 
          "CD-R": { bottom: 20, left: 75 }, "LM": { bottom: 60, left: 15 }, "CM-L": { bottom: 45, left: 25 },
          "AM": { bottom: 45, left: 50 }, "CM-R": { bottom: 45, left: 75 }, "RM": { bottom: 60, left: 85 },
          "CF-L": { bottom: 85, left: 40 }, "CF-R": { bottom: 85, left: 60 }
        };
      case "3-4-1-2":
        return {
          "G": { bottom: 2.5, left: 50 }, "CD-L": { bottom: 20, left: 25 }, "CD": { bottom: 20, left: 50 },
          "CD-R": { bottom: 20, left: 75 }, "LM": { bottom: 42.5, left: 15 }, "CM-L": { bottom: 42.5, left: 37.5 },
          "AM": { bottom: 62.5, left: 50 }, "CM-R": { bottom: 42.5, left: 62.5 }, "RM": { bottom: 42.5, left: 85 },
          "CF-L": { bottom: 85, left: 40 }, "CF-R": { bottom: 85, left: 60 }
        };
      case "3-4-2-1":
        return {
          "G": { bottom: 2.5, left: 50 }, "CD-L": { bottom: 20, left: 25 }, "CD": { bottom: 20, left: 50 },
          "CD-R": { bottom: 20, left: 75 }, "LM": { bottom: 42.5, left: 15 }, "CM-L": { bottom: 42.5, left: 37.5 },
          "CM-R": { bottom: 42.5, left: 62.5 }, "RM": { bottom: 42.5, left: 85 }, "CF-L": { bottom: 65, left: 37.5 }, 
          "F": { bottom: 85, left: 50 }, "CF-R": { bottom: 65, left: 62.5 }
        };
      case "4-1-4-1":
        return {
          "G": { bottom: 2.5, left: 50 }, "CD-L": { bottom: 20, left: 30 }, "CD-R": { bottom: 20, left: 70 },
          "LB": { bottom: 30, left: 15 }, "RB": { bottom: 30, left: 85 }, "LM": { bottom: 70, left: 17.5 },
          "CM-L": { bottom: 62.5, left: 35 }, "CM-R": { bottom: 62.5, left: 65 }, "DM": { bottom: 40, left: 50 },
          "RM": { bottom: 70, left: 82.5 }, "F": { bottom: 85, left: 50 }
        };
      case "4-4-2":
        return {
          "G": { bottom: 2.5, left: 50 }, "CD-L": { bottom: 20, left: 30 }, "CD-R": { bottom: 20, left: 70 },
          "LB": { bottom: 30, left: 10 }, "RB": { bottom: 30, left: 90 }, "LM": { bottom: 55, left: 10 },
          "CM-L": { bottom: 45, left: 30 }, "CM-R": { bottom: 45, left: 70 }, "RM": { bottom: 55, left: 90 },
          "CF-L": { bottom: 85, left: 40 }, "CF-R": { bottom: 85, left: 60 }
        }; 
      case "3-4-3":
        return {
          "G": { bottom: 2.5, left: 50 }, "CD-L": { bottom: 20, left: 30 }, "CD": { bottom: 20, left: 50 },
          "CD-R": { bottom: 20, left: 70 }, "LM": { bottom: 55, left: 10 }, "CM-L": { bottom: 45, left: 30 },
          "CM-R": { bottom: 45, left: 70 }, "RM": { bottom: 55, left: 90 }, "CF-L": { bottom: 80, left: 22.5 },
          "F": { bottom: 85, left: 50 }, "CF-R": { bottom: 80, left: 77.5 }
        }; 
      case "4-1-2-1-2":
        return {
          "G": { bottom: 2.5, left: 50 }, "CD-L": { bottom: 20, left: 30 }, "CD-R": { bottom: 20, left: 70 },
          "LB": { bottom: 30, left: 10 }, "RB": { bottom: 30, left: 90 }, "LM": { bottom: 52.5, left: 17.5 },
          "AM": { bottom: 62.5, left: 50 }, "DM": { bottom: 40, left: 50 }, "RM": { bottom: 52.5, left: 82.5 },
          "CF-L": { bottom: 85, left: 40 }, "CF-R": { bottom: 85, left: 60 }
        };
      case "4-4-1-1":
        return {
          "G": { bottom: 2.5, left: 50 }, "CD-L": { bottom: 20, left: 30 }, "CD-R": { bottom: 20, left: 70 },
          "LB": { bottom: 30, left: 10 }, "RB": { bottom: 30, left: 90 }, "LM": { bottom: 52.5, left: 10 },
          "CM-L": { bottom: 42.5, left: 35 }, "CM-R": { bottom: 42.5, left: 65 }, "RM": { bottom: 52.5, left: 90 },
          "RCF": { bottom: 65, left: 50 }, "F": { bottom: 85, left: 50 }
        };
      case "4-3-1-2":
        return {
          "G": { bottom: 2.5, left: 50 }, "CD-L": { bottom: 20, left: 30 }, "CD-R": { bottom: 20, left: 70 },
          "LB": { bottom: 30, left: 10 }, "RB": { bottom: 30, left: 90 }, "LM": { bottom: 50, left: 22.5 },
          "CM": { bottom: 40, left: 50 }, "RM": { bottom: 50, left: 77.5 }, "AM": { bottom: 62.5, left: 50 }, 
          "M": { bottom: 85, left: 40 }, "CF-R": { bottom: 85, left: 60 }
        };
      case "3-1-4-2":
        return {
          "G": { bottom: 2.5, left: 50 }, "CD-L": { bottom: 20, left: 30 }, "CD": { bottom: 20, left: 50 },
          "CD-R": { bottom: 20, left: 70 }, "SW": { bottom: 40, left: 50 }, "LM": { bottom: 60, left: 15 },
          "CM-L": { bottom: 60, left: 40 }, "CM-R": { bottom: 60, left: 60 }, "RM": { bottom: 60, left: 85 }, 
          "CF-L": { bottom: 85, left: 40 }, "CF-R": { bottom: 85, left: 60 }
        };
      case "5-3-2":
        return {
          "G": { bottom: 2.5, left: 50 }, "LB": { bottom: 30, left: 10 }, "CD-L": { bottom: 20, left: 25 },
          "CD": { bottom: 20, left: 50 }, "CD-R": { bottom: 20, left: 75 }, "RB": { bottom: 30, left: 90 },
          "CM-L": { bottom: 55, left: 30 }, "CM": { bottom: 55, left: 50 }, "CM-R": { bottom: 55, left: 70 },
          "CF-L": { bottom: 85, left: 40 }, "CF-R": { bottom: 85, left: 60 }
        };   
      case "5-4-1":
        return {
          "G": { bottom: 2.5, left: 50 }, "LB": { bottom: 30, left: 5 }, "CD-L": { bottom: 20, left: 25 },
          "CD": { bottom: 20, left: 50 }, "CD-R": { bottom: 20, left: 75 }, "RB": { bottom: 30, left: 95 },
          "LM": { bottom: 55, left: 15 }, "CM-L": { bottom: 55, left: 37.5 }, "CM-R": { bottom: 55, left: 62.5 }, "RM": { bottom: 55, left: 85 },
          "F": { bottom: 85, left: 50 }
        };
      default:
        return {
          "G": { bottom: 2.5, left: 50 }, "CD-L": { bottom: 20, left: 30 }, "CD-R": { bottom: 20, left: 70 },
          "LB": { bottom: 30, left: 10 }, "RB": { bottom: 30, left: 90 }, "LM": { bottom: 50, left: 22.5 },
          "CM": { bottom: 55, left: 50 }, "RM": { bottom: 50, left: 77.5 }, "LF": { bottom: 80, left: 17.5 },
          "F": { bottom: 85, left: 50 }, "RF": { bottom: 80, left: 82.5 }
        };
    }
  };

  const renderPlayer = (player, positionStyle, teamLogo, teamType, teamId) => {
    const name = player.athlete && (player.athlete.lastName || player.athlete.displayName) ? 
                 (player.athlete.lastName || player.athlete.displayName) : 'Unknown Player';
    const jersey = player.jersey || 'N/A';
    
    // Check if player was substituted out (exactly like scoreboard.js)
    const wasSubbedOut = player.subbedOutFor?.athlete;

    // Process player stats like scoreboard.js
    const stats = player.stats && Array.isArray(player.stats) ? player.stats.reduce((acc, stat) => {
      acc[stat.abbreviation] = stat.displayValue;
      return acc;
    }, {}) : {};

    const yellowCard = stats["YC"] === "1";
    const redCard = stats["RC"] === "1";

    const handlePlayerPress = () => {
      setSelectedPlayer({
        ...player,
        stats,
        teamLogo,
        teamId,
        teamType, // Add team type for color determination
        yellowCard,
        redCard
      });
      setPlayerPopupVisible(true);
    };

    return (
      <TouchableOpacity 
        key={`player-${jersey}-${name}`} 
        style={[styles.playerContainer, positionStyle]}
        onPress={handlePlayerPress}
        activeOpacity={0.7}
      >
        <View style={styles.playerCircle}>
          <Text allowFontScaling={false} style={styles.playerNumber}>{jersey}</Text>
        </View>
        <Text allowFontScaling={false} style={styles.playerName} numberOfLines={1}>
          {wasSubbedOut && <Text allowFontScaling={false} style={styles.subArrow}>← </Text>}
          {name}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderTeamPlayers = (players, positionStyles, teamLogo, teamType, teamId) => {
    console.log('renderTeamPlayers called with:', players.length, 'players');
    const starters = players.filter(player => player.starter);
    console.log('Filtered starters:', starters.length, starters);
    
    return starters.map(player => {
        const positionAbbr = player.position && player.position.abbreviation ? player.position.abbreviation : "";
        console.log('Player position:', positionAbbr, 'for player:', player.athlete?.displayName);
        const style = positionStyles[positionAbbr] || {};
        console.log('Position style for', positionAbbr, ':', style);
        const positionStyle = {
          position: 'absolute',
          top: `${100 - (style.bottom || 50) - 6.25}%`, // Shift up by 6.25% for better positioning
          left: `${style.left || 50}%`,
          transform: [{ translateX: '-50%' }, { translateY: '-50%' }], // Center both X and Y like CSS
          alignItems: 'center'
        };
        return renderPlayer(player, positionStyle, teamLogo, teamType, teamId);
      });
  };

  const renderSubstitutes = (subs, teamLogo, teamType) => {
    return (
      <View style={[styles.subsBox, { backgroundColor: theme.surface, borderColor: colors.primary }]}>
        <View style={styles.subsHeader}>
          <TeamLogoImage teamId={teamType === 'home' ? gameData?.homeCompetitor?.team?.id : gameData?.awayCompetitor?.team?.id} style={styles.subsTeamLogo} />
          <Text allowFontScaling={false} style={[styles.subsTitle, { color: theme.text }]}>Subs</Text>
        </View>
        <View style={styles.subsList}>
          {subs.slice(0, 30).map((sub, index) => {
            const name = sub.athlete?.displayName || sub.athlete?.lastName || 'Unknown';
            const jersey = sub.jersey || 'N/A';
            
            // Check if this sub came in for someone (like scoreboard.js)
            const subbedInFor = sub.subbedInFor?.athlete;
            const subTime = sub.plays?.[0]?.clock?.displayValue || '';
            const subOutPlayer = subbedInFor ? 
              `Out: #${sub.subbedInFor.jersey || ''}, ${subbedInFor.displayName || 'Unknown'}` : '';
            
            // Process player stats like scoreboard.js
            const stats = sub.stats && Array.isArray(sub.stats) ? sub.stats.reduce((acc, stat) => {
              acc[stat.abbreviation] = stat.displayValue;
              return acc;
            }, {}) : {};

            const yellowCard = stats["YC"] === "1";
            const redCard = stats["RC"] === "1";

            const handleSubPress = () => {
              setSelectedPlayer({
                ...sub,
                stats,
                teamLogo,
                teamId: teamType === 'home' ? gameData?.homeCompetitor?.team?.id : gameData?.awayCompetitor?.team?.id,
                teamType, // Add team type for color determination
                yellowCard,
                redCard
              });
              setPlayerPopupVisible(true);
            };
            
            return (
              <TouchableOpacity 
                key={`sub-${index}`} 
                style={styles.subsListItemContainer}
                onPress={handleSubPress}
                activeOpacity={0.7}
              >
                <Text allowFontScaling={false} style={[styles.subsListItem, { color: theme.textSecondary }]}>
                  <Text allowFontScaling={false} style={styles.jerseyNumber}>{jersey}</Text> {name}
                  {subbedInFor && <Text allowFontScaling={false} style={styles.subArrowIn}> →</Text>}
                </Text>
                {subbedInFor && (
                  <Text allowFontScaling={false} style={[styles.subDetails, { color: theme.textSecondary }]}>
                    {subTime && <Text allowFontScaling={false} style={styles.subTime}>{subTime} </Text>}
                    <Text allowFontScaling={false} style={styles.subOut}>{subOutPlayer}</Text>
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderFootballPitches = (homePlayers = [], awayPlayers = [], homeFormation = '', awayFormation = '', homeLogo = '', awayLogo = '', homeSubs = [], awaySubs = [], homeTeamId = null, awayTeamId = null) => {
    const homePositionStyles = getPositionStyles(homeFormation);
    const awayPositionStyles = getPositionStyles(awayFormation);

    return (
      <View style={styles.pitchesWrapper}>
        <View style={styles.pitchContainer}>
          <View style={styles.teamInfo}>
            <TeamLogoImage teamId={gameData?.awayCompetitor?.team?.id} style={styles.formTeamLogo} />
            <Text allowFontScaling={false} style={[styles.teamFormation, { color: theme.text }]}>{awayFormation}</Text>
          </View>
          <View style={styles.footballPitch}>
            <View style={styles.centerCircle} />
            <View style={styles.penaltyBox} />
            <View style={styles.goalBox} />
            <View style={styles.penaltyBoxCircle} />
            {renderTeamPlayers(awayPlayers, awayPositionStyles, awayLogo, 'away', awayTeamId)}
          </View>
          {renderSubstitutes(awaySubs, awayLogo, 'away')}
        </View>
        
        <View style={styles.pitchContainer}>
          <View style={styles.teamInfo}>
            <Text allowFontScaling={false} style={[styles.teamFormation, { color: theme.text }]}>{homeFormation}</Text>
            <TeamLogoImage teamId={gameData?.homeCompetitor?.team?.id} style={styles.formTeamLogo} />
          </View>
          <View style={styles.footballPitch}>
            <View style={styles.centerCircle} />
            <View style={styles.penaltyBox} />
            <View style={styles.goalBox} />
            <View style={styles.penaltyBoxCircle} />
            {renderTeamPlayers(homePlayers, homePositionStyles, homeLogo, 'home', homeTeamId)}
          </View>
          {renderSubstitutes(homeSubs, homeLogo, 'home')}
        </View>
      </View>
    );
  };

  const renderSingleTeamPitch = (players, formation, teamLogo, subs, teamType, teamId) => {
    const positionStyles = getPositionStyles(formation);

    return (
      <View style={styles.pitchContainer}>
        <View style={styles.teamInfo}>
          <TeamLogoImage teamId={teamType === 'home' ? gameData?.homeCompetitor?.team?.id : gameData?.awayCompetitor?.team?.id} style={styles.formTeamLogo} />
          <Text allowFontScaling={false} style={[styles.teamFormation, { color: theme.text }]}>{formation}</Text>
        </View>
        <View style={styles.footballPitch}>
          <View style={styles.centerCircle} />
          <View style={styles.penaltyBox} />
          <View style={styles.goalBox} />
          <View style={styles.penaltyBoxCircle} />
          {renderTeamPlayers(players, positionStyles, teamLogo, teamType, teamId)}
        </View>
        {renderSubstitutes(subs, teamLogo, teamType)}
      </View>
    );
  };

  // Fetch lineup data from ESPN lineup API (exactly like scoreboard.js)
  const fetchLineupData = async () => {
    if (!gameId) return { homeLineup: [], awayLineup: [] };
    
    try {
      console.log('[ItalyGameDetails] Fetching lineup data for gameId:', gameId);
      
      // Use the exact same API endpoint as scoreboard.js line 424
      const LINEUP_API_URL = `https://cdn.espn.com/core/soccer/lineups?xhr=1&gameId=${gameId}`;
      const response = await fetch(convertToHttps(LINEUP_API_URL));
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[ItalyGameDetails] Lineup API response:', data);
      
      // Extract rosters and formations exactly like scoreboard.js does
      const rosters = data?.gamepackageJSON?.rosters || [];
      const homeRoster = rosters.find(r => r.homeAway === "home");
      const awayRoster = rosters.find(r => r.homeAway === "away");
      
      const homeLineup = homeRoster?.roster || [];
      const awayLineup = awayRoster?.roster || [];
      
      // Extract actual formations from roster data like scoreboard.js
      const homeFormation = homeRoster?.formation || "4-3-3";
      const awayFormation = awayRoster?.formation || "4-3-3";
      
      console.log('[ItalyGameDetails] Lineup data extracted:', { 
        homeLineup: homeLineup.length, 
        awayLineup: awayLineup.length,
        homeFormation,
        awayFormation,
        rosters: rosters.length,
        homeRoster: homeRoster ? 'found' : 'not found',
        awayRoster: awayRoster ? 'found' : 'not found'
      });
      
      return { homeLineup, awayLineup, homeFormation, awayFormation };
      
    } catch (error) {
      console.error('[ItalyGameDetails] fetchLineupData error:', error);
      return { homeLineup: [], awayLineup: [] };
    }
  };

  // Helper: find first stat entry by candidate names
  const getStat = (flattenedStats, candidates = []) => {
    if (!Array.isArray(flattenedStats)) return null;
    for (let i = 0; i < candidates.length; i++) {
      const name = candidates[i];
      const found = flattenedStats.find(s => s && s.name === name);
      if (found) return found;
    }
    return null;
  };

  // Helper: parse a stat entry into numeric and display value
  const parseStatValue = (statEntry) => {
    if (!statEntry) return { num: null, display: null };
    const name = String(statEntry.name || '').toLowerCase();
    const rawVal = statEntry.value;
    const disp = statEntry.displayValue !== undefined ? String(statEntry.displayValue) : null;

    // If numeric value exists
    if (typeof rawVal === 'number') {
      // If it's likely a percentage (name contains pct or display contains % or value <= 1)
      if (name.includes('pct') || (disp && disp.includes('%')) || rawVal <= 1) {
        const pct = rawVal <= 1 ? rawVal * 100 : rawVal;
        return { num: Number.isFinite(pct) ? pct : null, display: disp || String(pct) };
      }
      return { num: rawVal, display: disp || String(rawVal) };
    }

    // Fallback parse from displayValue
    if (disp !== null) {
      // Trim percent sign if present
      const cleaned = disp.replace('%','').trim();
      const parsed = parseFloat(cleaned);
      if (!Number.isNaN(parsed)) return { num: parsed, display: disp };
      return { num: null, display: disp };
    }

    return { num: null, display: null };
  };

  // Map flattened stats array into a normalized object used by the UI
  const mapTeamStats = (flattenedStats = []) => {
    try {
      const f = Array.isArray(flattenedStats) ? flattenedStats : [];

      // Candidate name lists
      const candidates = {
        possession: ['possessionPct','possession','possessionPercent'],
        shots_total: ['shots','shotAttempts','shotsAttempted','shotsTotal','shotsAttemptedTotal'],
        shots_on_goal: ['shotsOnGoal','shotsOnTarget','shotsOnNet'],
        shots_blocked: ['blockedShots','shotsBlocked'],
        shots_inside: ['shotsInsideBox','shotsInsidePenaltyArea'],
        shots_outside: ['shotsOutsideBox'],
        fouls: ['foulsCommitted','fouls'],
        yellow: ['yellowCards','yellowCard'],
        red: ['redCards','redCard'],
        corners: ['cornerKicks','corners','cornerKick'],
        corners_conceded: ['lostCorners','cornerKicksAgainst'],
        offsides: ['offsides'],
        saves: ['saves','savesTotal']
      };

      const pick = (list) => getStat(f, list);
      const p = parseStatValue;

      const possessionStat = p(pick(candidates.possession));
      const totalShotsStat = p(pick(candidates.shots_total));
      const onGoalStat = p(pick(candidates.shots_on_goal));
      const blockedStat = p(pick(candidates.shots_blocked));
      const insideStat = p(pick(candidates.shots_inside));
      const outsideStat = p(pick(candidates.shots_outside));

      const foulsStat = p(pick(candidates.fouls));
      const yellowStat = p(pick(candidates.yellow));
      const redStat = p(pick(candidates.red));

      const cornersStat = p(pick(candidates.corners));
      const cornersConcededStat = p(pick(candidates.corners_conceded));
      const offsidesStat = p(pick(candidates.offsides));
      const savesStat = p(pick(candidates.saves));

      // Derive off-target if possible: total - onGoal - blocked (only when numbers available)
      let offTargetNum = null;
      if (totalShotsStat.num != null) {
        const total = totalShotsStat.num;
        const on = onGoalStat.num != null ? onGoalStat.num : 0;
        const blocked = blockedStat.num != null ? blockedStat.num : 0;
        const derived = total - on - blocked;
        offTargetNum = Number.isFinite(derived) ? derived : null;
      }

      return {
        possession: { num: possessionStat.num, display: possessionStat.display },
        shots: {
          total: totalShotsStat.num,
          totalDisplay: totalShotsStat.display,
          onGoal: onGoalStat.num,
          onGoalDisplay: onGoalStat.display,
          blocked: blockedStat.num,
          blockedDisplay: blockedStat.display,
          insideBox: insideStat.num,
          insideBoxDisplay: insideStat.display,
          outsideBox: outsideStat.num,
          outsideBoxDisplay: outsideStat.display,
          offTarget: offTargetNum,
        },
        discipline: {
          fouls: foulsStat.num,
          foulsDisplay: foulsStat.display,
          yellow: yellowStat.num,
          yellowDisplay: yellowStat.display,
          red: redStat.num,
          redDisplay: redStat.display
        },
        setPieces: {
          corners: cornersStat.num,
          cornersDisplay: cornersStat.display,
          cornersConceded: cornersConcededStat.num,
          cornersConcededDisplay: cornersConcededStat.display,
          offsides: offsidesStat.num,
          offsidesDisplay: offsidesStat.display,
          saves: savesStat.num,
          savesDisplay: savesStat.display
        }
      };
    } catch (err) {
      console.log('[ItalyGameDetails] mapTeamStats error:', err);
      return {};
    }
  };

  const fetchMatchStats = async () => {
    try {
      if (!gameId) return null;
      
      const MATCH_STATS_API_URL = `https://cdn.espn.com/core/soccer/matchstats?xhr=1&gameId=${gameId}`;
      const response = await fetch(convertToHttps(MATCH_STATS_API_URL));
      
      if (!response.ok) {
        throw new Error(`Stats API responded with status: ${response.status}`);
      }
      
      const matchStatsData = await response.json();
      
      // Extract teams data from CDN response
      const teams = matchStatsData.gamepackageJSON?.boxscore?.teams || [];
      const headToHeadData = matchStatsData.gamepackageJSON?.headToHeadGames || [];

      // Also fetch the authoritative sports.core event resource to find competitor statistics $ref links
      // This ensures we fetch the exact per-competitor statistics resource (as in c1/c2)
      let coreCompetitors = [];
      try {
        const CORE_EVENT_URL = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/ita.1/events/${gameId}?lang=en&region=us`;
        const coreResp = await fetch(convertToHttps(CORE_EVENT_URL));
        if (coreResp.ok) {
          const coreData = await coreResp.json();
          coreCompetitors = coreData?.competitions?.[0]?.competitors || [];
        } else {
          console.log('[ItalyGameDetails] core event resource responded with', coreResp.status);
        }
      } catch (coreErr) {
        console.log('[ItalyGameDetails] Error fetching core event resource:', coreErr);
      }

      // Map competitor by homeAway or team id for easy lookup
      const compMap = {};
      coreCompetitors.forEach(comp => {
        const key = comp.homeAway || comp.id || comp.team?.id;
        if (key) compMap[String(key)] = comp;
      });

      // For each competitor found in core, fetch its statistics.$ref and log first 100 lines
      const statFetchPromises = coreCompetitors.map(async (comp) => {
        try {
          const statRef = comp?.statistics?.$ref || (comp.statistics && typeof comp.statistics === 'string' ? comp.statistics : null);
          if (!statRef) return { comp, rawText: null, parsed: null };
          const sResp = await fetch(convertToHttps(statRef));
          if (!sResp.ok) {
            console.log('[ItalyGameDetails] statRef fetch failed', statRef, sResp.status);
            return { comp, rawText: null, parsed: null };
          }
          const rawText = await sResp.text();
          // Try parse JSON (may be large) for later use
          let parsed = null;
          try { parsed = JSON.parse(rawText); } catch (e) { parsed = null; }
          return { comp, rawText, parsed, statRef };
        } catch (err) {
          console.log('[ItalyGameDetails] Failed to fetch statRef for competitor', comp?.id, err);
          return { comp, rawText: null, parsed: null };
        }
      });

      const statFetchResults = await Promise.all(statFetchPromises);

      // Find home and away stat fetch results and log first 100 lines
      try {
        const homeComp = coreCompetitors.find(c => c.homeAway === 'home');
        const awayComp = coreCompetitors.find(c => c.homeAway === 'away');

        const homeResult = statFetchResults.find(r => r.comp && r.comp.id === (homeComp && homeComp.id));
        const awayResult = statFetchResults.find(r => r.comp && r.comp.id === (awayComp && awayComp.id));

        if (homeResult && homeResult.rawText) {
          const homeLines = homeResult.rawText.split(/\r?\n/).slice(0, 100).join('\n');
        } else {
        }

        if (awayResult && awayResult.rawText) {
          const awayLines = awayResult.rawText.split(/\r?\n/).slice(0, 100).join('\n');
        } else {
        }
      } catch (logErr) {
      }

      // Attach parsed flattened stats to teams where possible for UI compatibility
      try {
        teams.forEach(team => {
          const homeAway = team.homeAway;
          // find matching core comp by homeAway or team id
          const coreComp = coreCompetitors.find(c => c.homeAway === homeAway || (c.team && String(c.team?.id) === String(team.team?.id)));
          const result = statFetchResults.find(r => r.comp && r.comp.id === (coreComp && coreComp.id));
          if (result && result.parsed) {
            // Handle the fact that splits might be an object, not an array
            const flattened = [];
            const splitsData = result.parsed.splits;
            
            // Check if splits is an object with categories, or an array
            if (splitsData && typeof splitsData === 'object') {
              const splitsArray = Array.isArray(splitsData) ? splitsData : [splitsData];
              splitsArray.forEach(split => {
                (split.categories || []).forEach(cat => {
                  (cat.stats || []).forEach(s => {
                    flattened.push({ name: s.name, displayValue: s.displayValue !== undefined ? String(s.displayValue) : (s.value !== undefined ? String(s.value) : ''), value: s.value });
                  });
                });
              });
              team.statistics = flattened;
              console.log(`[ItalyGameDetails] Processed ${flattened.length} stats from $ref for ${homeAway} team`);
            }
          }
        });
      } catch (attachErr) {
        console.log('[ItalyGameDetails] Error attaching parsed stats to teams:', attachErr);
      }

      // If we have gameData and competitor statistics $refs, fetch those and
      // flatten them into a compatible statistics array for the UI.
      try {
        const competition = gameData?.header?.competitions?.[0];
        const competitors = competition?.competitors || [];

        // Build a map from homeAway or team id to the competitor object (which has statistics $ref)
        const compByHomeAway = {};
        competitors.forEach(comp => {
          const key = comp.homeAway || (comp.team && comp.team.id) || null;
          if (key) compByHomeAway[key] = comp;
        });

        // For each team from matchStats CDN, try to fetch the competitor statistics $ref
        await Promise.all(teams.map(async (team) => {
          try {
            const homeAway = team.homeAway;
            const comp = compByHomeAway[homeAway] || competitors.find(c => c.team?.id == team.team?.id);
            const statRef = comp?.statistics?.$ref || comp?.statistics;
            if (statRef && typeof statRef === 'string') {
              // Fetch competitor statistics resource (sports.core API)
              const sResp = await fetch(convertToHttps(statRef));
              if (sResp.ok) {
                const sData = await sResp.json();
                // sData typically contains 'splits' object/array with categories containing 'stats'
                const flattened = [];
                const splitsData = sData.splits;
                
                // Handle splits being either an object or array
                if (splitsData && typeof splitsData === 'object') {
                  const splitsArray = Array.isArray(splitsData) ? splitsData : [splitsData];
                  splitsArray.forEach(split => {
                    const categories = split.categories || [];
                    categories.forEach(cat => {
                      const stats = cat.stats || [];
                      stats.forEach(s => {
                        // Keep name, displayValue and numeric value when present
                        flattened.push({
                          name: s.name,
                          displayValue: s.displayValue !== undefined ? String(s.displayValue) : (s.value !== undefined ? String(s.value) : ''),
                          value: s.value
                        });
                      });
                    });
                  });
                  // Replace/augment the team's statistics with the flattened array
                  team.statistics = flattened;
                  // Also attach a normalized stats object for UI consumption
                  try {
                    team.normalizedStats = mapTeamStats(flattened);
                  } catch(e) {
                    team.normalizedStats = {};
                  }
                }
              }
            }
          } catch (innerErr) {
            console.log('Failed to fetch competitor statistics for team', team.team?.id, innerErr);
          }
        }));
      } catch (mapErr) {
        console.log('Error while attempting to fetch competitor statistics refs:', mapErr);
      }

      const homeTeam = teams.find(team => team.homeAway === 'home');
      const awayTeam = teams.find(team => team.homeAway === 'away');

      // Debug logging: print first 100 flattened stat entries for each team
      try {
        const homeStatsSample = (homeTeam?.statistics || []).slice(0, 100);
        const awayStatsSample = (awayTeam?.statistics || []).slice(0, 100);
        // Also log normalized stats for easier verification
      } catch (logErr) {
      }

      return {
        homeTeam,
        awayTeam,
        headToHeadData
      };
      
    } catch (error) {
      console.error('[ItalyGameDetails] fetchMatchStats error:', error);
      return null;
    }
  };

  const renderPlaysTab = () => {
    if (!gameData) {
      return (
        <View style={styles.tabContent}>
          <Text allowFontScaling={false} style={[styles.comingSoonText, { color: theme.textSecondary }]}>
            Loading plays...
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.tabContent}>
        {renderPlayByPlay()}
      </View>
    );
  };

  // Central fetch used for both initial load and silent updates.
  const fetchPlaysDataInternal = async ({ silent = true } = {}) => {
    // Skip if user is actively scrolling
    if (isUserScrollingRef.current) {
      console.log('[ItalyGameDetails] skipping plays fetch - user is scrolling');
      return;
    }

    if (!gameId) return;

    // Prevent concurrent fetches
    if (playsFetchingRef.current) {
      console.debug('[ItalyGameDetails] plays fetch already in progress - skipping');
      return;
    }

    playsFetchingRef.current = true;
    const initialLoad = !Array.isArray(playsData) || playsData.length === 0;
    if (initialLoad) {
      // only show loading indicator for the initial fetch
      setLoadingPlays(true);
    }

    console.log('[ItalyGameDetails] fetchPlaysData START', { gameId, lastUpdateHash, playsDataCount: playsData ? playsData.length : 0, silent });

    try {
      // Fetch plays data from ESPN API exactly like scoreboard.js
      const PLAYS_API_URL = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/ita.1/events/${gameId}/competitions/${gameId}/plays?lang=en&region=us&limit=1000`;

      const response = await fetch(convertToHttps(PLAYS_API_URL));
      if (!response.ok) {
        throw new Error(`Plays API responded with status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        console.warn('[ItalyGameDetails] No plays data available in response');
        if (initialLoad) setPlaysData([]);
        // Keep lastPlaysHashRef aligned with game-level hash (so we don't repeatedly try)
        lastPlaysHashRef.current = lastUpdateHash;
        return;
      }

      // Sort plays in reverse chronological order (most recent first)
      const fetchedPlays = [...data.items].reverse();

      // Compute a lightweight plays hash (count + top play key + sequence/startTime) to detect changes
      const topPlay = fetchedPlays[0];
      const topKey = topPlay ? computePlayKey(topPlay) : '';
      const topSeq = topPlay?.sequence || topPlay?.startTime || topPlay?.id || '';
      const playsHash = JSON.stringify({ count: fetchedPlays.length, topKey, topSeq });

      if (playsHash !== lastPlaysHashRef.current) {
        console.log('[ItalyGameDetails] plays changed - applying incremental update', { playsHash, prev: lastPlaysHashRef.current });
        updatePlaysDataIncremental(fetchedPlays);
        lastPlaysHashRef.current = playsHash;
      } else {
        console.debug('[ItalyGameDetails] plays hash unchanged - skipping merge');
      }

      console.log('[ItalyGameDetails] fetchPlaysData END - items', fetchedPlays.length);
    } catch (error) {
      console.error('[ItalyGameDetails] Error fetching plays data:', error);
      if (initialLoad) setPlaysData([]);
    } finally {
      playsFetchingRef.current = false;
      if (initialLoad) setLoadingPlays(false);
    }
  };

  // Initial load: when the Plays tab becomes active or the game changes, do a fetch that may show initial loading
  useEffect(() => {
    if (activeTab === 'plays' && gameId) {
      fetchPlaysDataInternal({ silent: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, gameId]);

  // Fetch stats data when stats tab becomes active
  useEffect(() => {
    const loadStats = async () => {
      if (activeTab === 'stats' && gameId && !statsData && !loadingMatchStats) {
        setLoadingMatchStats(true);
        const stats = await fetchMatchStats();
        setStatsData(stats);
        setLoadingMatchStats(false);
      }
    };
    
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, gameId, statsData]);

  // Silent updates: when game details update (lastUpdateHash changes), refresh plays silently if plays tab is active
  useEffect(() => {
    if (activeTab === 'plays' && gameId) {
      fetchPlaysDataInternal({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUpdateHash]);

  // Fetch plays data silently when gameData is loaded (for scorers box functionality)
  useEffect(() => {
    console.log('[ItalyGameDetails] Plays fetch useEffect triggered', {
      hasGameData: !!gameData,
      gameId,
      hasPlaysData: !!playsData,
      playsDataLength: playsData?.length || 0
    });
    
    if (gameData && gameId && !playsData) {
      console.log('[ItalyGameDetails] Fetching plays data for scorers box');
      fetchPlaysDataInternal({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameData, gameId, playsData]);

  // Add scroll listeners to detect user scroll start/stop inside the plays ScrollView
  useEffect(() => {
    const onScroll = (event) => {
      if (!event) return;
      // Mark that user is scrolling; debounce to detect end
      isUserScrollingRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false;
        console.log('[ItalyGameDetails] user stopped scrolling - updates will resume');
      }, 600);
    };

    // Attach to scrollViewRef if available
    const sv = scrollViewRef.current;
    if (sv && sv.props) {
      // We can't directly add DOM listeners in RN; the ScrollView's onScroll already calls handleScroll
      // so we rely on handleScroll writing to scrollYRef and use the timeout logic above.
    }

    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  // Main play-by-play rendering function adapted from scoreboard.js
  const renderPlayByPlay = () => {
    if (!gameData) return null;

    if (loadingPlays) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.text }]}>
            Loading plays...
          </Text>
        </View>
      );
    }

    if (!playsData || playsData.length === 0) {
      return (
        <View style={styles.tabContent}>
          <Text allowFontScaling={false} style={[styles.comingSoonText, { color: theme.textSecondary }]}>
            Play-by-play data is currently unavailable
          </Text>
        </View>
      );
    }

    const competition = gameData.header?.competitions?.[0];
    const homeTeam = gameData.homeCompetitor || competition?.competitors?.find(comp => comp.homeAway === 'home');
    const awayTeam = gameData.awayCompetitor || competition?.competitors?.find(comp => comp.homeAway === 'away');

    const homeLogo = gameData.homeLogo || 'https://via.placeholder.com/40';
    const awayLogo = gameData.awayLogo || 'https://via.placeholder.com/40';

    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        {playsData.map((play, index) => {
          const playKey = computePlayKey(play);
          const isOpen = openPlays.has(playKey);
          const isScoring = play.scoringPlay || false;
          
          // Get scores from the play data - for the last play (index 0), use previous play's scores
          let currentHomeScore, currentAwayScore;
          
          if (index === 0 && playsData.length > 1) {
            // This is the last/most recent play - use the previous play's scores
            currentHomeScore = playsData[1].homeScore || 0;
            currentAwayScore = playsData[1].awayScore || 0;
          } else {
            // For all other plays, use their own scores
            currentHomeScore = play.homeScore || 0;
            currentAwayScore = play.awayScore || 0;
          }
          
          const period = play.period ? play.period.number || 1 : 1;
          const clock = play.clock ? play.clock.displayValue : '';
          const text = play.text || play.shortText || play.type?.text || 'No description available';
          
          // Determine event type and team side
          let eventType = 'gen';
          let teamSide = 'home'; // Default
          // Default marker color: use theme primary when available, otherwise fall back to a blue
          let teamColor = (colors && colors.primary) ? colors.primary : '#007bff'; // Default

          // Helper: extract numeric team id from various possible API shapes.
          const extractTeamId = (teamObj) => {
            if (!teamObj) return null;
            try {
              // If it's a plain string reference
              if (typeof teamObj === 'string') {
                const m = teamObj.match(/teams\/(\d+)/);
                if (m) return m[1];
                return null;
              }

              // If API provides an object with id
              if (teamObj.id) return String(teamObj.id);

              // If API provides a $ref link
              if (teamObj.$ref && typeof teamObj.$ref === 'string') {
                const m = teamObj.$ref.match(/teams\/(\d+)/);
                if (m) return m[1];
              }

              // Nested shapes (rare) - try teamObj.team.$ref or teamObj.team.id
              if (teamObj.team) {
                if (teamObj.team.id) return String(teamObj.team.id);
                if (teamObj.team.$ref) {
                  const m2 = String(teamObj.team.$ref).match(/teams\/(\d+)/);
                  if (m2) return m2[1];
                }
              }
            } catch (e) {
              // ignore
            }
            return null;
          };

          const playTeamId = extractTeamId(play.team);
          const homeId = extractTeamId(homeTeam) || extractTeamId(homeTeam?.team);
          const awayId = extractTeamId(awayTeam) || extractTeamId(awayTeam?.team);

          if (playTeamId) {
            if (String(playTeamId) === String(awayId)) {
              teamSide = 'away';
              teamColor = ItalyServiceEnhanced.getTeamColorWithAlternateLogic(awayTeam?.team || awayTeam) || '#28a745';
            } else if (String(playTeamId) === String(homeId)) {
              teamSide = 'home';
              teamColor = ItalyServiceEnhanced.getTeamColorWithAlternateLogic(homeTeam?.team || homeTeam) || '#007bff';
            }
          }
          
          if (isScoring) {
            eventType = 'goal';
          } else if (text.toLowerCase().includes('yellow card')) {
            eventType = 'card';
          } else if (text.toLowerCase().includes('red card')) {
            eventType = 'red-card';
          } else if (text.toLowerCase().includes('substitution')) {
            eventType = 'substitution';
          } else if (text.toLowerCase().includes('attempt') || text.toLowerCase().includes('saved') || text.toLowerCase().includes('blocked') || text.toLowerCase().includes('missed')) {
            eventType = 'shot';
          } else if (text.toLowerCase().includes('offside')) {
            eventType = 'offside';
          }

          // Extract coordinates for mini field
          const coordinate = play.fieldPositionX !== undefined && play.fieldPositionY !== undefined ? 
            { x: play.fieldPositionX, y: play.fieldPositionY } : null;
            
          const coordinate2 = play.fieldPosition2X !== undefined && play.fieldPosition2Y !== undefined ? 
            { x: play.fieldPosition2X, y: play.fieldPosition2Y } : null;

          // Determine final background and text colors for scoring plays
          const finalTeamColor = (teamColor && typeof teamColor === 'string') ? (teamColor.startsWith('#') ? teamColor : `#${teamColor}`) : (colors?.primary || '#007bff');
          const scoringTextColor = getContrastColor(finalTeamColor);

          // Border left style: only show when we have a resolved team id
          const borderLeftStyle = playTeamId ? { borderLeftWidth: 6, borderLeftColor: finalTeamColor } : { borderLeftWidth: 0 };

          return (
            <View key={computePlayKey(play)} style={[styles.playContainer, { backgroundColor: isScoring ? finalTeamColor : theme.surface }, borderLeftStyle]}>
              <TouchableOpacity 
                style={styles.playHeader}
                onPress={() => togglePlay(playKey)}
              >
                <View style={styles.playMainInfo}>
                  <View style={styles.playTeamsScore}>
                    <View style={styles.teamScoreDisplay}>
                      <TeamLogoImage 
                        teamId={homeTeam?.team?.id}
                        style={styles.teamLogoSmall}
                        isScoring={isScoring}
                      />
                      <Text allowFontScaling={false} style={[styles.scoreSmall, { color: isScoring ? scoringTextColor : theme.text }]}> 
                        {currentHomeScore}
                      </Text>
                    </View>
                    <Text allowFontScaling={false} style={[styles.scoreSeparator, { color: theme.text }]}>-</Text>
                    <View style={styles.teamScoreDisplay}>
                      <Text allowFontScaling={false} style={[styles.scoreSmall, { color: isScoring ? scoringTextColor : theme.text }]}> 
                        {currentAwayScore}
                      </Text>
                      <TeamLogoImage 
                        teamId={awayTeam?.team?.id}
                        style={styles.teamLogoSmall}
                        isScoring={isScoring}
                      />
                    </View>
                  </View>
                  
                  <View style={styles.playSummary}>
                    <View style={styles.playTimePeriod}>
                      {period && (
                        <Text allowFontScaling={false} style={[styles.playPeriod, { color: isScoring ? scoringTextColor : theme.textSecondary }]}> 
                          {period === 1 ? '1st Half' : '2nd Half'}
                        </Text>
                      )}
                      {clock && (
                        <Text allowFontScaling={false} style={[styles.playClock, { color: isScoring ? scoringTextColor : theme.textSecondary }]}> 
                          {clock}
                        </Text>
                      )}
                    </View>
                    <Text allowFontScaling={false} style={[styles.playDescription, { color: isScoring ? scoringTextColor : theme.text }]} numberOfLines={2}>
                      {text}
                    </Text>
                    {isScoring && (
                      <Text allowFontScaling={false} style={[styles.scoreIndicator, { color: scoringTextColor, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, paddingHorizontal: 6 }]}>
                        GOAL
                      </Text>
                    )}
                  </View>
                </View>
                
                <View style={styles.playToggle}>
                  <Text allowFontScaling={false} style={[styles.toggleIcon, { color: isScoring ? scoringTextColor : theme.text }]}> 
                    {isOpen ? '▲' : '▼'}
                  </Text>
                </View>
              </TouchableOpacity>
              
              {isOpen && (
                <View style={styles.playDetails}>
                  <View style={styles.playDetailsContent}>
                    {/* Row layout: Mini field on left, event info on right */}
                    <View style={styles.playDetailsRow}>
                      {coordinate && (
                        <View style={styles.miniFieldContainer}>
                          {renderMiniField(coordinate, coordinate2, eventType, teamSide, teamColor)}
                        </View>
                      )}
                      
                      <View style={[styles.playEventInfo, { backgroundColor: isScoring ? 'rgba(255,255,255,0.2)' : theme.background, flex: 1 }]}> 
                        <Text allowFontScaling={false} style={[styles.playDescription, { color: isScoring ? scoringTextColor : theme.text }]}> 
                          {text}
                        </Text>
                        {clock && (
                          <Text allowFontScaling={false} style={[styles.playClock, { color: theme.textSecondary }]}>
                            {period ? `${period === 1 ? '1st' : '2nd'} Half - ${clock}` : clock}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    );
  };

  // Landscape Mini Field Component - Exact replica of web version
  const renderMiniField = (coordinate, coordinate2, eventType = 'gen', teamSide = 'home', teamColor = '#007bff') => {
    if (!coordinate || coordinate.x === undefined || coordinate.y === undefined) {
      return (
        <View style={styles.miniField}>
          <View style={[styles.fieldContainer, { backgroundColor: '#2d5a2d' }]}>
            <View style={styles.fieldOutline} />
            <View style={styles.centerLine} />
            <View style={styles.centerCircleMini} />
            <View style={styles.penaltyAreaLeft} />
            <View style={styles.penaltyAreaRight} />
            <View style={styles.goalAreaLeft} />
            <View style={styles.goalAreaRight} />
            <View style={styles.goalLeft} />
            <View style={styles.goalRight} />
          </View>
        </View>
      );
    }

    // Exact coordinate system from web version:
    // Field split into 2 halves - right half = home, left half = away
    // X: 0 = far end, 1 = half line (center)
    // Position relative to field outline (white lines), not container
    const espnX = coordinate.x;
    const espnY = coordinate.y;

    // Convert ESPN coordinates with exact web logic
    let leftPercent, topPercent;

    if (teamSide === 'home') {
      // Home team on right half of field
      // X=0 (far right) → 96% left position (near right goal)
      // X=1 (center line) → 50% left position
      leftPercent = 50 + (1 - espnX) * 46; // X=0→96%, X=1→50%
      topPercent = 4 + (espnY * 92); // Y=0→4%, Y=1→96% (within field outline)
    } else {
      // Away team on left half of field  
      // X=0 (far left) → 4% left position (near left goal)
      // X=1 (center line) → 50% left position
      leftPercent = 4 + (espnX * 46); // X=0→4%, X=1→50%
      topPercent = 4 + ((1 - espnY) * 92); // Y=0→96%, Y=1→4% (inverted, within field outline)
    }

    // Constrain to field outline bounds (white lines area)
    const finalLeftPercent = Math.max(4, Math.min(96, leftPercent));
    const finalTopPercent = Math.max(4, Math.min(96, topPercent));

    // Handle second coordinate (ball end position) - always render when available
    let ballEndPosition = null;
    let secondLeftPercent = null;
    let secondTopPercent = null;

    // Don't render the second marker/trajectory if coordinate2 is missing or is exactly (0,0)
    if (
      coordinate2 &&
      coordinate2.x !== undefined &&
      coordinate2.y !== undefined &&
      !(coordinate2.x === 0 && coordinate2.y === 0)
    ) {
      const espnX2 = coordinate2.x;
      const espnY2 = coordinate2.y;

      let leftPercent2, topPercent2;

      if (teamSide === 'home') {
        // Home team on right half
        leftPercent2 = 50 + (1 - espnX2) * 46; // X=0→96%, X=1→50%
        topPercent2 = 4 + (espnY2 * 92); // Y=0→4%, Y=1→96%
      } else {
        // Away team on left half
        leftPercent2 = 4 + (espnX2 * 46); // X=0→4%, X=1→50%
        topPercent2 = 4 + ((1 - espnY2) * 92); // Y=0→96%, Y=1→4% (inverted)
      }

      secondLeftPercent = Math.max(4, Math.min(96, leftPercent2));
      secondTopPercent = Math.max(4, Math.min(96, topPercent2));

      ballEndPosition = (
        <View
          style={[
            styles.eventMarker,
            styles.ballEndMarker,
            {
              left: `${secondLeftPercent}%`,
              top: `${secondTopPercent}%`,
              backgroundColor: teamColor.startsWith('#') ? teamColor : `#${teamColor}`,
            }
          ]}
        />
      );
    }

    // Event class determination - exact web logic
    const eventClass = eventType === 'goal' ? 'goal' : 
                      eventType === 'shot' ? 'attempt' :
                      eventType === 'card' ? 'card' : 
                      eventType === 'red-card' ? 'red-card' :
                      eventType === 'offside' ? 'offside' :
                      eventType === 'substitution' ? 'substitution' : 'goal';

    // Ensure team color has # prefix
    const finalTeamColor = teamColor.startsWith('#') ? teamColor : `#${teamColor}`;

    // Determine marker style based on event type
    const getMarkerStyle = () => {
      const baseStyle = [styles.eventMarker];
      
      switch (eventClass) {
        case 'goal':
          return [...baseStyle, styles.goalMarker, { backgroundColor: finalTeamColor }];
        case 'attempt':
          return [...baseStyle, styles.shotMarker, { backgroundColor: finalTeamColor }];
        case 'card':
          return [...baseStyle, styles.cardMarker];
        case 'red-card':
          return [...baseStyle, styles.redCardMarker];
        case 'substitution':
          return [...baseStyle, styles.substitutionMarker];
        case 'offside':
          return [...baseStyle, styles.offsideMarker];
        default:
          return [...baseStyle, { backgroundColor: finalTeamColor }];
      }
    };

    // Trajectory line component using native React Native (no SVG dependency)
    const TrajectoryLine = () => {
      if (!ballEndPosition || secondLeftPercent === null || secondTopPercent === null) {
        return null;
      }

      // Field pixel dimensions
      const FIELD_WIDTH = 180;
      const FIELD_HEIGHT = 120;

      // Convert start/end percents into pixel coordinates inside the field
      const x1 = (finalLeftPercent / 100) * FIELD_WIDTH;
      const y1 = (finalTopPercent / 100) * FIELD_HEIGHT;
      const x2 = (secondLeftPercent / 100) * FIELD_WIDTH;
      const y2 = (secondTopPercent / 100) * FIELD_HEIGHT;

      
      return (
        // Render SVG covering the whole mini field so coordinates map directly
        <Svg
          width={FIELD_WIDTH}
          height={FIELD_HEIGHT}
          style={{ position: 'absolute', left: 0, top: 0, zIndex: 8 }}
          pointerEvents="none"
        >
          <Line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={finalTeamColor}
            strokeWidth={2}
            strokeOpacity={0.85}
          />
        </Svg>
      );
    };

    return (
      <View style={styles.miniField}>
        <View style={[styles.fieldContainer, { backgroundColor: '#2d5a2d' }]}>
          <View style={styles.fieldOutline} />
          <View style={styles.centerLine} />
          <View style={styles.centerCircleMini} />
          <View style={styles.penaltyAreaLeft} />
          <View style={styles.penaltyAreaRight} />
          <View style={styles.goalAreaLeft} />
          <View style={styles.goalAreaRight} />
          <View style={styles.goalLeft} />
          <View style={styles.goalRight} />
          
          {/* Trajectory line */}
          <TrajectoryLine />
          
          {/* Player position marker */}
          <View
            style={[
              ...getMarkerStyle(),
              {
                left: `${finalLeftPercent}%`,
                top: `${finalTopPercent}%`,
              }
            ]}
          />
          
          {/* Ball end position marker */}
          {ballEndPosition}
        </View>
      </View>
    );
  };

  const renderPlayerPopup = () => {
    if (!selectedPlayer) return null;
    
    const name = selectedPlayer.athlete?.displayName || selectedPlayer.athlete?.lastName || 'Unknown Player';
    const jersey = selectedPlayer.jersey || 'N/A';
    const stats = selectedPlayer.stats || {};
    const yellowCard = selectedPlayer.yellowCard;
    const redCard = selectedPlayer.redCard;
    const playerNameColor = redCard ? '#ff0000' : yellowCard ? '#ffff00' : theme.text;
    const isGoalkeeper = selectedPlayer.position?.abbreviation === "G";

    // Get team color based on team type
    const competition = gameData.header?.competitions?.[0];
    const homeTeam = gameData.homeCompetitor || competition?.competitors?.find(comp => comp.homeAway === 'home');
    const awayTeam = gameData.awayCompetitor || competition?.competitors?.find(comp => comp.homeAway === 'away');
    
    let teamColor = '#000'; // Default black
    if (selectedPlayer.teamType === 'home') {
      teamColor = ItalyServiceEnhanced.getTeamColorWithAlternateLogic(homeTeam?.team) || '#007bff';
    } else if (selectedPlayer.teamType === 'away') {
      teamColor = ItalyServiceEnhanced.getTeamColorWithAlternateLogic(awayTeam?.team) || '#28a745';
    }

    // Ensure the color has a # prefix
    const finalTeamColor = (teamColor && typeof teamColor === 'string') ? 
      (teamColor.startsWith('#') ? teamColor : `#${teamColor}`) : '#000';

    return (
      <Modal
        animationType="fade"
        transparent={true}
        visible={playerPopupVisible}
        onRequestClose={() => setPlayerPopupVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPlayerPopupVisible(false)}
        >
          <TouchableOpacity
            style={[
              styles.playerHoverCard, 
              { 
                backgroundColor: theme.surface,
                shadowColor: finalTeamColor // Use team color for shadow
              }
            ]}
            activeOpacity={1}
            onPress={() => {}} // Prevent modal close when tapping on card
          >
            <TeamLogoImage 
              teamId={selectedPlayer.teamId}
              style={styles.hoverTeamLogo}
            />
            <View style={styles.hoverPlayerName}>
              <Text allowFontScaling={false} style={[styles.hoverJersey, { color: theme.textSecondary }]}>
                {jersey}
              </Text>
              <Text allowFontScaling={false} style={[styles.hoverName, { color: playerNameColor }]}>
                {name}
              </Text>
            </View>
            
            {isGoalkeeper ? (
              <View style={styles.playerStatsContainer}>
                <Text allowFontScaling={false} style={[styles.playerStat, { color: theme.text }]}>
                  SV: {stats["SV"] || "0"} | GA: {stats["GA"] || "0"}
                </Text>
              </View>
            ) : (
              <View style={styles.playerStatsContainer}>
                <Text allowFontScaling={false} style={[styles.playerStat, { color: theme.text }]}>
                  Goals: {stats["G"] || "0"} | Assists: {stats["A"] || "0"}
                </Text>
                <Text allowFontScaling={false} style={[styles.playerStat, { color: theme.text }]}>
                  Shots: {stats["SH"] || "0"} | SOG: {stats["ST"] || "0"}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  if (loading && !gameData) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.text }]}>
          Loading match details...
        </Text>
      </View>
    );
  }

  if (!gameData) {
    return (
      <View style={[styles.container, styles.errorContainer, { backgroundColor: theme.background }]}>
        <Text allowFontScaling={false} style={[styles.errorText, { color: theme.text }]}>
          Failed to load match details
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={() => loadGameDetails()}
        >
          <Text allowFontScaling={false} style={styles.retryText}>Retry</Text>
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
        {renderTabs()}
        {renderTabContent()}
      </ScrollView>
      
      {renderPlayerPopup()}
      
      {/* Stream Modal - Popup style like MLB */}
      <Modal 
        animationType="fade"
        transparent={true}
        visible={showStreamModal} 
        onRequestClose={() => setShowStreamModal(false)}
      >
        <View style={styles.streamModalOverlay}>
          <View style={[styles.streamModalContainer, { backgroundColor: theme.surface }]}>
            {/* Modal Header */}
            <View style={[styles.streamModalHeader, { backgroundColor: theme.surfaceSecondary, borderBottomColor: theme.border }]}>
              <Text allowFontScaling={false} style={[styles.streamModalTitle, { color: colors.primary }]}>Live Stream</Text>
              <TouchableOpacity 
                style={[styles.streamCloseButton, { backgroundColor: theme.surfaceSecondary }]} 
                onPress={() => setShowStreamModal(false)}
              >
                <Text allowFontScaling={false} style={[styles.streamCloseText, { color: colors.primary }]}>×</Text>
              </TouchableOpacity>
            </View>

            {/* Stream Source Buttons */}
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={[styles.streamButtonsContainer, { backgroundColor: theme.surfaceSecondary, borderBottomColor: theme.border }]}
              contentContainerStyle={styles.streamButtonsContent}
            >
              {Object.keys(availableStreams).slice(0, 5).map((source) => (
                <TouchableOpacity
                  key={source}
                  style={[
                    styles.streamSourceButton,
                    { backgroundColor: currentStreamType === source ? colors.primary : theme.surfaceSecondary },
                    { borderColor: theme.border }
                  ]}
                  onPress={() => setCurrentStreamType(source)}
                >
                  <Text allowFontScaling={false} style={[
                    styles.streamSourceButtonText,
                    { color: currentStreamType === source ? '#fff' : colors.primary }
                  ]}>
                    {source.charAt(0).toUpperCase() + source.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* WebView Container */}
            <View style={styles.webViewContainer}>
              {streamLoading && (
                <View style={styles.streamLoadingOverlay}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text allowFontScaling={false} style={[styles.streamLoadingText, { color: '#fff' }]}>Loading stream...</Text>
                </View>
              )}
              {currentStreamType && availableStreams[currentStreamType] && (
                <WebView
                  source={{ uri: availableStreams[currentStreamType] }}
                  style={styles.streamWebView}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  allowsInlineMediaPlayback={true}
                  mediaPlaybackRequiresUserAction={false}
                  onLoadStart={() => setStreamLoading(true)}
                  onLoadEnd={() => setStreamLoading(false)}
                  onError={() => setStreamLoading(false)}
                  userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                  // Block popup navigation within the WebView
                  onShouldStartLoadWithRequest={(request) => {
                    console.log('Italy WebView navigation request:', request.url);
                    
                    // Allow the initial stream URL to load
                    if (request.url === availableStreams[currentStreamType]) {
                      return true;
                    }
                    
                    // Block navigation to obvious popup/ad URLs
                    const popupKeywords = ['popup', 'ad', 'ads', 'click', 'redirect', 'promo'];
                    const hasPopupKeywords = popupKeywords.some(keyword => 
                      request.url.toLowerCase().includes(keyword)
                    );
                    
                    // Block external navigation attempts (popups trying to navigate within WebView)
                    const currentDomain = new URL(availableStreams[currentStreamType]).hostname;
                    let requestDomain = '';
                    try {
                      requestDomain = new URL(request.url).hostname;
                    } catch (e) {
                      console.log('Invalid URL:', request.url);
                      return false;
                    }
                    
                    // Allow same-domain navigation but block cross-domain (likely popups)
                    if (requestDomain !== currentDomain || hasPopupKeywords) {
                      console.log('Blocked Italy popup/cross-domain navigation:', request.url);
                      return false;
                    }
                    
                    return true;
                  }}
                  // Handle when WebView tries to open a new window (popup)
                  onOpenWindow={(syntheticEvent) => {
                    const { nativeEvent } = syntheticEvent;
                    console.log('Blocked Italy popup window:', nativeEvent.targetUrl);
                    // Don't open the popup - just log it
                    return false;
                  }}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>
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
  stickyTeamContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 100,
  },
  stickyTeamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stickyLogo: {
    width: 24,
    height: 24,
    marginRight: 6,
  },
  stickyLogoAway: {
    width: 24,
    height: 24,
    marginLeft: 6,
  },
  stickyTeamAbbr: {
    fontSize: 11,
    fontWeight: '600',
  },
  stickyScore: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  stickyScoreAway: {
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 8,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  awayScoreContainer: {
    flexDirection: 'row',
  },
  shootoutScore: {
    fontSize: 12,
    fontWeight: '500',
    marginHorizontal: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  stickyStatusContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  stickyStatusText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  stickyStatusDetail: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
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
  },
  competitionText: {
    fontSize: 16,
    fontWeight: '600',
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
  teamLogoAndScore: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamLogo: {
    width: 48,
    height: 48,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    minHeight: 36,
  },
  scoreBox: {
    minWidth: 50,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  timeAndHalfContainer: {
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
  },
  timeText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  halfText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dateText: {
    fontSize: 12,
    textAlign: 'center',
  },
  scoreText: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  scoreWithShootout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  awayScoreWithShootout: {
    flexDirection: 'row',
  },
  shootoutScore: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: -2,
    marginHorizontal: 4,
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
  headerScorersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: -10,
  },
  headerScorersColumn: {
    flex: 1,
    alignItems: 'center',
  },
  headerSoccerBallContainer: {
    paddingHorizontal: 16,
  },
  headerSoccerBallEmoji: {
    fontSize: 16,
  },
  headerScorerText: {
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 1,
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
  teamTabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  teamTabLogo: {
    width: 48,
    height: 48,
    marginRight: 16,
  },
  teamTabInfo: {
    flex: 1,
  },
  teamTabName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  teamTabDescription: {
    fontSize: 14,
  },
  // Play-by-play styles
  playContainer: {
    marginVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  playHeader: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playMainInfo: {
    flex: 1,
    marginRight: 16,
  },
  playTeamsScore: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamScoreDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamLogoSmall: {
    width: 20,
    height: 20,
    marginHorizontal: 4,
  },
  scoreSmall: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  scoreSeparator: {
    fontSize: 14,
    fontWeight: 'bold',
    marginHorizontal: 8,
  },
  playSummary: {
    flex: 1,
  },
  playTimePeriod: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  playPeriod: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 8,
  },
  playClock: {
    fontSize: 12,
    fontWeight: '600',
  },
  playDescription: {
    fontSize: 14,
    marginBottom: 4,
  },
  scoreIndicator: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ff6b35',
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  playToggle: {
    padding: 8,
  },
  toggleIcon: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  playDetails: {
    padding: 16,
    paddingTop: 0,
  },
  playDetailsContent: {
    alignItems: 'center',
  },
  playDetailsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  miniFieldContainer: {
    marginRight: 16,
  },
  playEventInfo: {
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    width: '100%',
  },
  // Landscape Mini Field styles (exact replica of web version)
  miniField: {
    width: 180,
    height: 120, // Landscape orientation - wider than tall
    marginVertical: 16,
    alignSelf: 'center',
  },
  fieldContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#2d5a2d',
    borderRadius: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  fieldOutline: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: 4,
  },
  centerLine: {
    position: 'absolute',
    left: '50%',
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: 'white',
    marginLeft: -1,
  },
  centerCircleMini: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 40,
    height: 40,
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: 20,
    marginLeft: -20,
    marginTop: -20,
  },
  penaltyAreaLeft: {
    position: 'absolute',
    left: 4,
    top: '25%',
    bottom: '25%',
    width: 30,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: 'white',
  },
  penaltyAreaRight: {
    position: 'absolute',
    right: 4,
    top: '25%',
    bottom: '25%',
    width: 30,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: 'white',
  },
  goalAreaLeft: {
    position: 'absolute',
    left: 4,
    top: '37.5%',
    bottom: '37.5%',
    width: 15,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: 'white',
  },
  goalAreaRight: {
    position: 'absolute',
    right: 4,
    top: '37.5%',
    bottom: '37.5%',
    width: 15,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: 'white',
  },
  goalLeft: {
    position: 'absolute',
    left: 2,
    top: '42.5%',
    bottom: '42.5%',
    width: 4,
    backgroundColor: 'white',
  },
  goalRight: {
    position: 'absolute',
    right: 2,
    top: '42.5%',
    bottom: '42.5%',
    width: 4,
    backgroundColor: 'white',
  },
  eventMarker: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ff6b35',
    borderWidth: 2,
    borderColor: 'white',
    marginTop: -6,
    marginLeft: -6,
  },
  ballEndMarker: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: -4,
    marginLeft: -4,
    opacity: 0.8,
  },
  goalMarker: {
    backgroundColor: '#00ff00',
  },
  cardMarker: {
    backgroundColor: '#ffff00',
  },
  redCardMarker: {
    backgroundColor: '#ff0000',
  },
  shotMarker: {
    backgroundColor: '#ffa500',
  },
  substitutionMarker: {
    backgroundColor: '#0080ff',
  },
  offsideMarker: {
    backgroundColor: '#800080',
  },
  // Pitch rendering styles (matching scoreboard.js)
  pitchesWrapper: {
    marginTop: 20,
  },
  pitchContainer: {
    marginBottom: 30,
    alignItems: 'center',
    width: '100%', // Allow full width for large pitch
  },
  teamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  formTeamLogo: {
    width: 30,
    height: 30,
    marginHorizontal: 10,
  },
  teamFormation: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  footballPitch: {
    width: width - 20, // Full screen width with small padding (like web)
    height: Math.round((width - 20) * 600 / 610), // Increased height for better player spacing
    backgroundColor: '#006400', // Exact green from CSS
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 10, // Matches CSS
    position: 'relative',
    alignSelf: 'center',
  },
  centerCircle: {
    position: 'absolute',
    top: '-0.5%', // Matches CSS positioning
    left: '50%',
    width: '40.98%', // 250px of 610px from CSS
    height: '20%', // Reduced height for half circle effect
    borderWidth: 2,
    borderColor: '#ffffff',
    borderTopLeftRadius: 0, // No rounding at top
    borderTopRightRadius: 0, // No rounding at top
    borderBottomLeftRadius: 120, // Round the bottom (flipped)
    borderBottomRightRadius: 120, // Round the bottom (flipped)
    backgroundColor: 'transparent',
    transform: [{ translateX: '-50%' }],
  },
  penaltyBox: {
    position: 'absolute',
    bottom: 0,
    left: '20%', // Matches CSS left: 20%
    width: '60%', // Matches CSS width: 60%
    height: '25%', // 125px of 500px from CSS
    borderWidth: 2,
    borderColor: '#ffffff',
    borderBottomWidth: 0,
    backgroundColor: 'transparent',
  },
  goalBox: {
    position: 'absolute',
    bottom: 0,
    left: '32.5%', // Matches CSS left: 32.5%
    width: '35%', // Matches CSS width: 35%
    height: '12%', // 60px of 500px from CSS
    borderWidth: 2,
    borderColor: '#ffffff',
    borderBottomWidth: 0,
    backgroundColor: 'transparent',
  },
  penaltyBoxCircle: {
    position: 'absolute',
    top: '63.5%', // Adjusted positioning for better visibility
    left: '50%',
    width: '24.59%', // 150px of 610px from CSS
    height: '12%', // Reduced height for half circle effect
    borderWidth: 2,
    borderColor: '#ffffff',
    borderTopLeftRadius: 60, // Only round the top (half of full radius)
    borderTopRightRadius: 60, // Only round the top
    borderBottomLeftRadius: 0, // No rounding at bottom
    borderBottomRightRadius: 0, // No rounding at bottom
    backgroundColor: 'transparent',
    transform: [{ translateX: '-50%' }],
  },
  playerContainer: {
    width: 40,
    alignItems: 'center',
    position: 'absolute', // Important for positioning
  },
  playerCircle: {
    width: 50, // Matches scoreboard.js exactly
    height: 50,
    borderRadius: 40,
    backgroundColor: '#ffffff', // White background like web
    borderWidth: 2.5,
    borderColor: '#000000', // Black border like web
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  playerNumber: {
    color: '#000000', // Black text like web
    fontSize: 15, // Slightly larger to match 1.2rem
    fontWeight: 'bold',
  },
  playerName: {
    fontSize: 9, // Matches 0.9rem from web
    color: '#ffffff',
    textAlign: 'center',
    textShadowColor: '#000000', // Black text shadow like web
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
  },
  subsBox: {
    width: width - 20, // Match the pitch width
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignSelf: 'center',
  },
  subsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  subsTeamLogo: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  subsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  subsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between', // Ensure equal spacing
  },
  subsListItemContainer: {
    width: '48%', // Match the previous width setting
    marginBottom: 8,
    flexGrow: 0,
    flexShrink: 0,
  },
  subsListItem: {
    fontSize: 16, // Reduced from 18 to 16 for better fit
    marginBottom: 2, // Reduced since we have container spacing
  },
  jerseyNumber: {
    fontWeight: 'bold',
    fontSize: 16, // Match the subsListItem font size
  },
  subArrow: {
    color: '#ff0000', // Red arrow for subbed out players
    fontWeight: 'bold',
    fontSize: 16,
  },
  subArrowIn: {
    color: '#00ff00', // Green arrow for subbed in players
    fontWeight: 'bold',
    fontSize: 16,
  },
  subDetails: {
    fontSize: 12,
    marginTop: 2,
    marginLeft: 4,
  },
  subTime: {
    fontWeight: 'bold',
    color: '#666',
  },
  subOut: {
    fontStyle: 'italic',
    opacity: 0.8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerHoverCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    minWidth: 300,
    maxWidth: 350, // Increased width for longer names
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.5,
    shadowRadius: 3.84,
    elevation: 5,
  },
  hoverTeamLogo: {
    width: 70,
    height: 70,
    marginBottom: 15,
  },
  hoverPlayerName: {
    alignItems: 'center', // Changed from row to center everything
    marginBottom: 12,
  },
  hoverJersey: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  hoverName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  playerStatsContainer: {
    alignItems: 'center',
  },
  playerStat: {
    fontSize: 14,
    marginBottom: 4,
  },
  // Stats Section Styles (exact 1:1 replica of scoreboard.js)
  matchStatsContainer: {
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statsSection: {
    padding: 16,
    marginBottom: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statsHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  statsTeams: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  statsTeamHome: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statsTeamAway: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  statsTeamLogo: {
    width: 30,
    height: 30,
    marginHorizontal: 8,
  },
  statsTeamName: {
    fontSize: 14,
    fontWeight: '600',
  },
  statsSection: {
    marginBottom: 20,
  },
  statsSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  possessionSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  possessionCircleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  possessionCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  possessionBackground: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 60,
  },
  possessionFill: {
    position: 'absolute',
    height: '100%',
    borderRadius: 60,
  },
  possessionCenter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    zIndex: 10,
    borderWidth: 2,
    borderColor: '#fff',
  },
  possessionCenterText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  // New possession styles
  statsSectionInner: {
    marginBottom: 20,
  },
  possessionDisplay: {
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  possessionBar: {
    width: 200,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ddd',
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 12,
  },
  possessionBarFill: {
    position: 'absolute',
    height: '100%',
    borderRadius: 10,
  },
  possessionBarFillAway: {
    left: 'auto',
  },
  possessionTextContainer: {
    alignItems: 'center',
  },
  possessionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // New possession circle styles
  possessionCircleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  possessionCircle: {
    width: 120,
    height: 120,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  possessionSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  possessionCenter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    zIndex: 10,
    backgroundColor: '#fff',
  },
  possessionValues: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    gap: 50,
  },
  possessionTeam: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  possessionColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  possessionTeamText: {
    fontSize: 14,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  statsValue: {
    fontSize: 14,
    fontWeight: 'bold',
    minWidth: 30,
    textAlign: 'center',
  },
  statsValueAway: {
    // Away team value on left
  },
  statsValueHome: {
    // Home team value on right
  },
  statsBarContainer: {
    flex: 1,
    marginHorizontal: 12,
    alignItems: 'center',
  },
  statsBar: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: 4,
  },
  statsBarFill: {
    height: '100%',
  },
  statsBarFillAway: {
    // Away team fill (left side)
  },
  statsBarFillHome: {
    // Home team fill (right side)
  },
  statsLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  // Head to Head Styles
  h2hContainer: {
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    marginTop: 20,
  },
  h2hHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  h2hTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  h2hMatches: {
    gap: 12,
  },
  h2hMatch: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  h2hMatchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  h2hDate: {
    fontSize: 12,
    fontWeight: '600',
  },
  h2hCompetition: {
    fontSize: 12,
  },
  h2hMatchTeams: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  h2hTeam: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  h2hTeamReverse: {
    justifyContent: 'flex-end',
  },
  h2hTeamLogo: {
    width: 20,
    height: 20,
    marginHorizontal: 6,
  },
  h2hTeamName: {
    fontSize: 12,
    fontWeight: '600',
  },
  h2hScore: {
    fontSize: 14,
    fontWeight: 'bold',
    marginHorizontal: 16,
  },
  h2hNoData: {
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
    padding: 20,
    marginBottom: 12,
    width: '100%', // Take full width
  },
  hoverJersey: {
    fontSize: 28, // Slightly smaller
    fontWeight: 'bold',
    marginBottom: 4, // Add space below jersey number
    color: '#666',
  },
  hoverName: {
    fontSize: 30, // Slightly smaller but still prominent
    fontWeight: '600',
    textAlign: 'center',
    flexWrap: 'wrap', // Allow text wrapping
    paddingHorizontal: 8, // Add some padding
  },
  playerStatsContainer: {
    alignItems: 'center',
  },
  playerStat: {
    fontSize: 20,
    marginVertical: 2,
    textAlign: 'center',
  },
  // Stream-related styles - MLB popup style
  streamButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
  },
  streamButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  // Stream Modal - Popup overlay style
  streamModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  streamModalContainer: {
    width: '95%',
    maxWidth: 800,
    height: '85%',
    maxHeight: 600,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  streamModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  streamModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  streamCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  streamCloseText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  streamButtonsContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    maxHeight: 60,
  },
  streamButtonsContent: {
    paddingHorizontal: 10,
    gap: 10,
    alignItems: 'center',
  },
  streamSourceButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 80,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  streamSourceButtonText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  webViewContainer: {
    flex: 1,
    position: 'relative',
  },
  streamWebView: {
    flex: 1,
  },
  streamLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    zIndex: 1,
  },
  streamLoadingText: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ItalyGameDetailsScreen;
