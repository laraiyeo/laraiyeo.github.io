import React, { useState, useEffect } from 'react';
import { AppState } from 'react-native';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { Modal, FlatList } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useFavorites } from '../context/FavoritesContext';
import { ChampionsLeagueServiceEnhanced } from '../services/soccer/ChampionsLeagueServiceEnhanced';
import { MLBService } from '../services/MLBService';

// Module-level helpers so any function in the file can use them reliably
const promiseWithTimeout = (p, ms = 3000) => {
  return new Promise(resolve => {
    let finished = false;
    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        resolve(null);
      }
    }, ms);
    Promise.resolve(p).then(v => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve(v);
      }
    }).catch(() => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve(null);
      }
    });
  });
};

// Module-level caching system
const DEBUG = false;
// Save original console.log and silence other console.log calls so the file doesn't spam output.
// We'll explicitly call __orig_console_log where a log should remain visible.
const __orig_console_log = (typeof console !== 'undefined' && console.log) ? console.log.bind(console) : () => {};
if (typeof console !== 'undefined') console.log = () => {};
const eventFetchCache = new Map(); // URL -> { etag, lastModified, lastHash, parsed, timestamp }
const inFlightFetches = new Map(); // URL -> Promise
const urlLastFetchedPass = new Map(); // URL -> pass ID
const teamMetadataCache = new Map(); // teamId -> { team, score, timestamp }
const mlbScheduleCache = new Map(); // date -> { schedule, timestamp }
let fetchPassCounter = 0;
let currentFetchPassId = 0;
let isFetchingFavorites = false; // Prevent concurrent fetchFavoriteGames calls
// Current fetch phase: 'idle' | 'initial' | 'poll'
let currentFetchPhase = 'idle';

// Small hash function for body comparison
function smallHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return hash;
}

// Cached fetch with conditional headers, in-flight dedupe, and same-pass dedupe
async function fetchJsonWithCache(url, options = {}) {
  const { timeout = 3500, force = false } = options;
  // During poll passes, avoid making expensive discovery requests to ESPN Core / Site APIs
  // unless explicitly forced. Return cached data when available, otherwise null.
  try {
    if (!force && currentFetchPhase === 'poll') {
      const blockedPatterns = ['sports.core.api.espn.com', 'site.api.espn.com', '/v2/sports/'];
      if (blockedPatterns.some(p => String(url).includes(p))) {
        const cached = eventFetchCache.get(url);
        if (cached?.parsed) return cached.parsed;
        // don't perform network fetch during poll for these endpoints
        return null;
      }
    }
  } catch (e) {
    // ignore gating errors and continue to normal behavior
  }
  
  // Same-pass dedupe: if already fetched in this pass, return cached
  if (!force && urlLastFetchedPass.get(url) === currentFetchPassId) {
    const cached = eventFetchCache.get(url);
    if (cached?.parsed) {
      if (DEBUG) console.log(`[CACHE] Same-pass dedupe: ${url}`);
      return cached.parsed;
    }
  }
  
  // In-flight dedupe: if currently fetching, return the existing promise
  if (inFlightFetches.has(url)) {
    if (DEBUG) console.log(`[CACHE] In-flight dedupe: ${url}`);
    return inFlightFetches.get(url);
  }
  
  const fetchPromise = (async () => {
    try {
      const cacheEntry = eventFetchCache.get(url);
      const headers = {};
      
      // Add conditional headers if we have cache data
      if (cacheEntry && !force) {
        if (cacheEntry.etag) headers['If-None-Match'] = cacheEntry.etag;
        if (cacheEntry.lastModified) headers['If-Modified-Since'] = cacheEntry.lastModified;
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, { 
        headers, 
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      
      // Handle 304 Not Modified
      if (response.status === 304 && cacheEntry?.parsed) {
        if (DEBUG) console.log(`[CACHE] 304 Not Modified: ${url}`);
        urlLastFetchedPass.set(url, currentFetchPassId);
        return cacheEntry.parsed;
      }
      
      if (!response.ok) {
        // Return cached data if available on error
        if (cacheEntry?.parsed) {
          if (DEBUG) console.log(`[CACHE] Error fallback: ${url}`);
          return cacheEntry.parsed;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      
      const text = await response.text();
      const bodyHash = smallHash(text);
      
      // If body hash unchanged, return cached parsed data
      if (cacheEntry?.lastHash === bodyHash && cacheEntry?.parsed) {
        if (DEBUG) console.log(`[CACHE] Body hash match: ${url}`);
        urlLastFetchedPass.set(url, currentFetchPassId);
        return cacheEntry.parsed;
      }
      
      const parsed = JSON.parse(text);
      
      // Update cache
      eventFetchCache.set(url, {
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
        lastHash: bodyHash,
        parsed,
        timestamp: Date.now()
      });
      
      urlLastFetchedPass.set(url, currentFetchPassId);
      if (DEBUG) console.log(`[CACHE] Fresh fetch: ${url}`);
      return parsed;
      
    } catch (error) {
      // Return cached data if available on timeout/error
      const cacheEntry = eventFetchCache.get(url);
      if (cacheEntry?.parsed) {
        if (DEBUG) console.log(`[CACHE] Timeout fallback: ${url}`);
        urlLastFetchedPass.set(url, currentFetchPassId);
        return cacheEntry.parsed;
      }
      throw error;
    } finally {
      inFlightFetches.delete(url);
    }
  })();
  
  inFlightFetches.set(url, fetchPromise);
  return fetchPromise;
}

// Aggregate MLB schedule fetches to avoid duplication
async function fetchMLBScheduleForDate(date) {
  if (mlbScheduleCache.has(date)) {
    const cached = mlbScheduleCache.get(date);
    // Cache for 30 minutes
    if (Date.now() - cached.timestamp < 30 * 60 * 1000) {
      return cached.schedule;
    }
  }
  
  // Fetch all teams' games for this date in one call
  const url = `https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&startDate=${date}&endDate=${date}&hydrate=team,linescore,decisions`;
  const schedule = await fetchJsonWithCache(url);
  
  mlbScheduleCache.set(date, {
    schedule,
    timestamp: Date.now()
  });
  
  return schedule;
}

// Cache team metadata
async function fetchTeamMetadataWithCache(teamUrl, scoreUrl) {
  const cacheKey = `${teamUrl}:${scoreUrl}`;
  const cached = teamMetadataCache.get(cacheKey);
  
  // Cache team metadata for 24 hours (teams don't change)
  if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
    return { team: cached.team, score: cached.score };
  }
  
  const [team, score] = await Promise.all([
    fetchJsonWithCache(teamUrl),
    fetchJsonWithCache(scoreUrl)
  ]);
  
  teamMetadataCache.set(cacheKey, {
    team,
    score,
    timestamp: Date.now()
  });
  
  return { team, score };
}

// Enhanced logo function with dark mode support and fallbacks
const getTeamLogoUrls = (teamId, isDarkMode) => {
  const primaryUrl = isDarkMode
    ? `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`
    : `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
  
  const fallbackUrl = isDarkMode
    ? `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`
    : `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`;

  return { primaryUrl, fallbackUrl };
};

// TeamLogoImage component with dark mode and fallback support - moved outside to prevent recreation
const TeamLogoImage = React.memo(({ teamId, style, isDarkMode }) => {
  const [logoSource, setLogoSource] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (teamId) {
      const logos = getTeamLogoUrls(teamId, isDarkMode);
      setLogoSource({ uri: logos.primaryUrl });
    }
    setRetryCount(0);
  }, [teamId, isDarkMode]);

  const handleError = () => {
    if (retryCount === 0) {
      const logos = getTeamLogoUrls(teamId, isDarkMode);
      setLogoSource({ uri: logos.fallbackUrl });
      setRetryCount(1);
    } else {
      setLogoSource(require('../../assets/soccer.png'));
    }
  };

  return (
    <Image
      style={style}
      source={logoSource || require('../../assets/soccer.png')}
      onError={handleError}
    />
  );
});

// League competition mappings for domestic cups and additional tournaments
const LEAGUE_COMPETITIONS = {
  "eng.1": [
    { code: "eng.fa", name: "FA Cup", logo: "40" },
    { code: "eng.league_cup", name: "EFL Cup", logo: "41" }
  ],
  "esp.1": [
    { code: "esp.copa_del_rey", name: "Copa del Rey", logo: "80" },
    { code: "esp.super_cup", name: "Spanish Supercopa", logo: "431" }
  ],
  "ger.1": [
    { code: "ger.dfb_pokal", name: "DFB Pokal", logo: "2061" },
    { code: "ger.super_cup", name: "German Super Cup", logo: "2315" }
  ],
  "ita.1": [
    { code: "ita.coppa_italia", name: "Coppa Italia", logo: "2192" },
    { code: "ita.super_cup", name: "Italian Supercoppa", logo: "2316" }
  ],
  "fra.1": [
    { code: "fra.coupe_de_france", name: "Coupe de France", logo: "182" },
    { code: "fra.super_cup", name: "Trophee des Champions", logo: "2345" }
  ]
};

// Function to determine if a game should be fetched based on timing restrictions and status
const shouldFetchGame = (game, teamName = 'Unknown') => {
  if (!game) return false;
  
  // Get game status from various possible sources
  const statusFromSiteAPI = game.gameDataWithStatus?.header?.competitions?.[0]?.status;
  const status = game.status || game.header?.competitions?.[0]?.status || game.competitions?.[0]?.status;
  const codedGameState = game.codedGameState || game.gameData?.status?.codedGameState || game.liveData?.status?.codedGameState;
  
  let statusType = statusFromSiteAPI?.type?.state;
  
  // Determine if game is finished
  const isFinished = 
    statusType === 'post' || 
    codedGameState === 'F' || 
    status?.type?.completed === true ||
    status?.type?.name === 'Final' ||
    status?.displayClock === 'Final';
  
  // Determine if game is live/in progress
  const isLive = 
    statusType === 'in' || 
    codedGameState === 'I' ||
    status?.type?.state === 'in' ||
    (status?.type?.name && ['In Progress', 'Halftime', 'Break'].includes(status.type.name));
  
  // Always fetch live games
  if (isLive) {
    return true;
  }
  
  // Get game date/time
  const gameDate = game.date || game.gameDate || game.startDate || 
    game.header?.competitions?.[0]?.date || game.competitions?.[0]?.date;
  
  if (!gameDate) {
    // If no date available, only fetch if it's live
    return isLive;
  }
  
  const now = new Date();
  const gameTime = new Date(gameDate);
  const timeDiff = now - gameTime; // Positive if game was in the past
  
  // Don't fetch finished games after timing window
  if (isFinished) {
    // Determine sport type for timing restrictions
    const isMLB = game.sport?.name === 'Baseball' || 
      game.sport?.id === 1 || 
      teamName?.includes('MLB') ||
      game.eventId?.toString().length >= 6; // MLB typically has longer event IDs
    
    const isSoccer = game.sport?.name === 'Soccer' || 
      game.sport?.name === 'Football' ||
      teamName?.includes('Soccer') ||
      teamName?.includes('Champions League');
    
    if (isMLB) {
      // MLB: Stop fetching finished games after 2 minutes
      return timeDiff < (2 * 60 * 1000);
    } else if (isSoccer) {
      // Soccer: Stop fetching finished games after 30 minutes
      return timeDiff < (30 * 60 * 1000);
    } else {
      // Default: Stop fetching finished games after 5 minutes
      return timeDiff < (5 * 60 * 1000);
    }
  }
  
  // For scheduled games, don't fetch if they're more than 1 hour in the future
  const oneHourFromNow = 60 * 60 * 1000;
  if (timeDiff < -oneHourFromNow) {
    return false;
  }
  
  // For all other cases (scheduled games within 1 hour, etc.), allow fetching
  return true;
};

// Compute normalized status flags for a game object: isLive, isScheduled, isFinished
const computeMatchFlags = (game) => {
  let isLive = false;
  let isScheduled = false;
  let isFinished = false;

  try {
    const statusFromSiteAPI = game?.gameDataWithStatus?.header?.competitions?.[0]?.status;
    const status = game?.status || game?.header?.competitions?.[0]?.status || game?.competitions?.[0]?.status;
    const codedGameState = game?.codedGameState || game?.gameData?.status?.codedGameState || game?.liveData?.status?.codedGameState || game?.mlbGameData?.status?.codedGameState;

    if (statusFromSiteAPI) {
      const state = statusFromSiteAPI.type?.state;
      isLive = state === 'in';
      // Treat live games as part of the 'scheduled' set for display/update purposes
      isScheduled = state === 'pre' || state === 'in';
      isFinished = state === 'post';
    } else if (codedGameState) {
      isLive = codedGameState === 'I';
      isFinished = codedGameState === 'F';
      // If not finished, consider it scheduled (includes live)
      isScheduled = !isFinished;
    } else if (status) {
      const s = status.type?.state;
      isLive = s === 'in';
      isScheduled = s === 'pre' || s === 'in';
      isFinished = s === 'post';
    } else {
      // Fallback: use date heuristics
      const gameDate = game?.date || game?.gameDate || game?.startDate || game?.header?.competitions?.[0]?.date || game?.competitions?.[0]?.date;
      if (gameDate) {
        const now = Date.now();
        const t = new Date(gameDate).getTime();
        if (t > now) {
          isScheduled = true;
        } else if (now - t < 3 * 60 * 60 * 1000) {
          // within 3 hours -> consider live
          isLive = true;
        } else {
          isFinished = true;
        }
      }
    }
  } catch (e) {
    // ignore and return defaults
  }

  return { isLive, isScheduled, isFinished };
};

// Track logged games to prevent duplicate status logs
const loggedGames = new Set();

// Track games that should receive updates based on status
const gamesToUpdate = new Set();

// Function to determine if a game should receive updates based on its current status
const shouldGameReceiveUpdates = (game, statusInfo, teamName = 'Unknown') => {
  const { isLive, isPre, isPost } = statusInfo;
  const gameId = game.id || game.eventId;
  
  // Always update live games
  if (isLive) {
    console.log(`Game ${gameId} (${teamName}): UPDATE - Live game, needs continuous updates`);
    return true;
  }
  
  // Update pre-game (scheduled) games within 30 minutes of start time
  if (isPre) {
    const gameDate = game.date || game.gameDate || game.startDate || 
      game.header?.competitions?.[0]?.date || game.competitions?.[0]?.date;
    
    if (gameDate) {
      const now = new Date();
      const gameTime = new Date(gameDate);
      const timeDiff = gameTime - now; // Positive if game is in the future
      const thirtyMinutes = 30 * 60 * 1000;
      
      if (timeDiff <= thirtyMinutes && timeDiff > 0) {
        console.log(`Game ${gameId} (${teamName}): UPDATE - Pre-game within 30 minutes, needs updates (starts in ${Math.round(timeDiff / 60000)} minutes)`);
        return true;
      } else if (timeDiff <= 0) {
        console.log(`Game ${gameId} (${teamName}): UPDATE - Pre-game should have started, needs updates (${Math.abs(Math.round(timeDiff / 60000))} minutes overdue)`);
        return true;
      } else {
        console.log(`Game ${gameId} (${teamName}): NO UPDATE - Pre-game too far in future (starts in ${Math.round(timeDiff / 60000)} minutes)`);
        return false;
      }
    } else {
      console.log(`Game ${gameId} (${teamName}): UPDATE - Pre-game without date info, allowing updates`);
      return true;
    }
  }
  
  // For finished games, apply sport-specific timing windows
  if (isPost) {
    const gameDate = game.date || game.gameDate || game.startDate || 
      game.header?.competitions?.[0]?.date || game.competitions?.[0]?.date;
    
    if (gameDate) {
      const now = new Date();
      const gameTime = new Date(gameDate);
      const timeDiff = now - gameTime; // Positive if game was in the past
      
      // Determine sport type for post-game update windows
      const isMLB = game.sport?.name === 'Baseball' || 
        game.sport?.id === 1 || 
        teamName?.includes('MLB') ||
        game.eventId?.toString().length >= 6;
      
      const isSoccer = game.sport?.name === 'Soccer' || 
        game.sport?.name === 'Football' ||
        teamName?.includes('Soccer') ||
        teamName?.includes('Champions League') ||
        game.actualLeagueCode?.includes('uefa') ||
        game.actualLeagueCode?.includes('soccer');
      
      if (isMLB) {
        const mlbWindow = 10 * 60 * 1000; // 10 minutes for MLB
        if (timeDiff < mlbWindow) {
          console.log(`Game ${gameId} (${teamName}): UPDATE - MLB finished game within 10-minute window (${Math.round(timeDiff / 60000)} minutes ago)`);
          return true;
        } else {
          console.log(`Game ${gameId} (${teamName}): NO UPDATE - MLB finished game beyond 10-minute window (${Math.round(timeDiff / 60000)} minutes ago)`);
          return false;
        }
      } else if (isSoccer) {
        const soccerWindow = 30 * 60 * 1000; // 30 minutes for soccer
        if (timeDiff < soccerWindow) {
          console.log(`Game ${gameId} (${teamName}): UPDATE - Soccer finished game within 30-minute window (${Math.round(timeDiff / 60000)} minutes ago)`);
          return true;
        } else {
          console.log(`Game ${gameId} (${teamName}): NO UPDATE - Soccer finished game beyond 30-minute window (${Math.round(timeDiff / 60000)} minutes ago)`);
          return false;
        }
      } else {
        const defaultWindow = 15 * 60 * 1000; // 15 minutes for other sports
        if (timeDiff < defaultWindow) {
          console.log(`Game ${gameId} (${teamName}): UPDATE - Other sport finished game within 15-minute window (${Math.round(timeDiff / 60000)} minutes ago)`);
          return true;
        } else {
          console.log(`Game ${gameId} (${teamName}): NO UPDATE - Other sport finished game beyond 15-minute window (${Math.round(timeDiff / 60000)} minutes ago)`);
          return false;
        }
      }
    } else {
      console.log(`Game ${gameId} (${teamName}): NO UPDATE - Finished game without date info, skipping updates`);
      return false;
    }
  }
  
  // Default case - if status is unclear, allow updates
  console.log(`Game ${gameId} (${teamName}): UPDATE - Unclear status, allowing updates as fallback`);
  return true;
};

// Function to check if a specific game should receive updates (for external use)
const isGameBeingTrackedForUpdates = (gameId) => {
  return gamesToUpdate.has(gameId);
};

// Function to get all games currently being tracked for updates
const getGamesBeingTrackedForUpdates = () => {
  return Array.from(gamesToUpdate);
};

const FavoritesScreen = ({ navigation }) => {
  const { theme, colors, isDarkMode, getTeamLogoUrl } = useTheme();
  const { getFavoriteTeams, isFavorite, favorites, getTeamCurrentGame, updateTeamCurrentGame, clearTeamCurrentGame } = useFavorites();
  const [favoriteGames, setFavoriteGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [sectionOrder, setSectionOrder] = useState(null);
  const [isReorderModalVisible, setIsReorderModalVisible] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [favoritesHash, setFavoritesHash] = useState('');
  const [isUpdatingFavorites, setIsUpdatingFavorites] = useState(false);
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const [updateInterval, setUpdateInterval] = useState(null);
  const [liveGamesInterval, setLiveGamesInterval] = useState(null);

  // Using module-level helper promiseWithTimeout defined above.

  // Function to sort games by status then time
  const sortGamesByStatusAndTime = (games) => {
    return games.sort((a, b) => {
      const getGameStatus = (game) => {
        // Use the same status checking logic as the display function
        const statusFromSiteAPI = game.gameDataWithStatus?.header?.competitions?.[0]?.status;
        let statusType = null;
        
        if (statusFromSiteAPI) {
          statusType = statusFromSiteAPI.type?.state;
        } else {
          // Fallback to other status sources
          const status = game.status || game.header?.competitions?.[0]?.status || game.competitions?.[0]?.status;
          statusType = status?.type?.state;
        }
        
        if (statusType === 'in') {
          return 'Live'; // Live games have highest priority
        } else if (statusType === 'pre') {
          return 'Scheduled';
        } else if (statusType === 'post') {
          return 'Final';
        }
        
        // If this is an MLB game, prefer MLB's codedGameState when available
        if (game.sport === 'MLB' || String(game.actualLeagueCode || '').toLowerCase() === 'mlb') {
          const coded = game.mlbGameData?.status?.codedGameState || game.liveData?.status?.codedGameState;
          if (coded) {
            if (coded === 'F') return 'Final';
            if (coded === 'I') return 'Live';
            return 'Scheduled';
          }
        }

        // Fallback to date-based logic if no status available
        const gameDate = new Date(game.date);
        const now = new Date();
        const threeHoursAgo = new Date(now.getTime() - (3 * 60 * 60 * 1000));
        
        if (gameDate < threeHoursAgo) {
          return 'Final';
        } else if (gameDate <= now) {
          return 'Live';
        } else {
          return 'Scheduled';
        }
      };

      const statusA = getGameStatus(a);
      const statusB = getGameStatus(b);
      
      // Priority: Live > Scheduled > Final
      const statusPriority = { 'Live': 1, 'Scheduled': 2, 'Final': 3 };
      
      if (statusPriority[statusA] !== statusPriority[statusB]) {
        return statusPriority[statusA] - statusPriority[statusB];
      }
      
      // If same status, sort by time (earlier first for scheduled/live, later first for final)
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      
        if (statusA === 'Final') {
        // For final games keep the original scheduled start-time ordering (earlier games first)
        return timeA - timeB;
      } else {
        return timeA - timeB; // Earliest upcoming/live games first
      }
    });
  };

  // Helper function to get "today's" date range with 2 AM cutoff
  // Games are considered "today's" until 2 AM of the next day
  const getTodayDateRange = () => {
    const now = new Date();
    const currentHour = now.getHours();
    
    // If it's before 2 AM, use yesterday's date as "today"
    let today;
    if (currentHour < 2) {
      today = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Yesterday
    } else {
      today = new Date(); // Today
    }
    
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    
    console.log(`Date range calculation: Current time: ${now.toISOString()}, Hour: ${currentHour}, Using date: ${today.toDateString()}, Range: ${todayStart.toISOString()} to ${todayEnd.toISOString()}`);
    
    return { todayStart, todayEnd };
  };

  // Do not fetch here on mount; useFocusEffect will trigger a fetch when the screen is focused.
  // This prevents double-fetching on initial mount (one from mount + one from focus).

  // Also refresh when favorites list changes
  useEffect(() => {
    // Load saved section order from AsyncStorage (if any)
    const loadSectionOrder = async () => {
      try {
        const saved = await AsyncStorage.getItem('favorites_section_order');
        if (saved) {
          setSectionOrder(JSON.parse(saved));
        }
      } catch (e) {
        console.log('Could not load section order:', e?.message || e);
      }
    };
    loadSectionOrder();

    const newHash = `${favorites.length}-${favorites.map(f => f.teamId).sort().join(',')}`;
    
    if (favoritesHash && favoritesHash !== newHash) {
      console.log('Favorites list changed, refreshing games...', favorites.length, 'teams');
      console.log('Hash change:', favoritesHash, '->', newHash);
      setIsUpdatingFavorites(true);
      
      // Only refresh if we have favorites or had games before (to clear when all favorites removed)
      if (favorites.length > 0 || favoriteGames.length > 0) {
        fetchFavoriteGames(true).finally(() => {
          setTimeout(() => setIsUpdatingFavorites(false), 1000); // Clear flag after 1 second
        });
      } else {
        setIsUpdatingFavorites(false);
      }
    }
    
    setFavoritesHash(newHash);
  }, [favorites.length, favorites.map(f => f.teamId).sort().join(',')]); // React to changes in favorites count and team IDs

  // Default section order if none present
  const DEFAULT_SECTION_ORDER = ['MLB', 'Champions League', 'England Soccer', 'Spain Soccer', 'Italy Soccer', 'Germany Soccer', 'France Soccer'];

  const saveSectionOrder = async (order) => {
    try {
      await AsyncStorage.setItem('favorites_section_order', JSON.stringify(order));
    } catch (e) {
      console.log('Could not save section order:', e?.message || e);
    }
  };

  const openReorderModal = () => setIsReorderModalVisible(true);
  const closeReorderModal = () => setIsReorderModalVisible(false);

  const moveItem = (index, dir) => {
    const order = [...(sectionOrder || DEFAULT_SECTION_ORDER)];
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= order.length) return;
    const tmp = order[newIndex];
    order[newIndex] = order[index];
    order[index] = tmp;
    setSectionOrder(order);
    saveSectionOrder(order);
  };

  // Track screen focus and set up live game refresh
  useFocusEffect(
    React.useCallback(() => {
      console.log('FavoritesScreen: Screen focused - starting data fetch');
      setIsScreenFocused(true);
      fetchFavoriteGames(true); // Refresh data when screen is focused

      // Listen for app coming back to foreground while this screen is focused
      const onAppStateChange = (nextAppState) => {
        if (nextAppState === 'active') {
          console.log('FavoritesScreen: App returned to foreground - refreshing favorites');
          fetchFavoriteGames(true);
        }
      };
      const sub = AppState.addEventListener ? AppState.addEventListener('change', onAppStateChange) : null;

      return () => {
        console.log('FavoritesScreen: Screen unfocused - pausing updates');
        setIsScreenFocused(false);
        if (updateInterval) {
          clearInterval(updateInterval);
          setUpdateInterval(null);
        }
        if (liveGamesInterval) {
          clearInterval(liveGamesInterval);
          setLiveGamesInterval(null);
        }
        if (sub && sub.remove) sub.remove();
      };
    }, [getFavoriteTeams, favorites])
  );

  // Set up continuous refresh for live games
  useEffect(() => {
    if (!isScreenFocused) {
      // Clear any existing interval when screen is not focused
      if (updateInterval) {
        clearInterval(updateInterval);
        setUpdateInterval(null);
      }
      return;
    }

    // Check if we have any live games among scheduled games only (use computed flags)
    const hasLiveGames = favoriteGames.some(game => game && game.isScheduled && game.isLive);

    if (hasLiveGames && isScreenFocused) {
      console.log('FavoritesScreen: Live games detected - setting up continuous refresh');
      // Set up continuous refresh for live games (every 10 seconds)
      const interval = setInterval(() => {
        console.log('FavoritesScreen: Auto-refresh triggered for games that need updates');
        // Update games that should receive updates based on their status and timing
        setFavoriteGames(currentGames => {
          const gamesToUpdate = currentGames.filter(game => {
            if (!game) return false;
            // Create status info object for shouldGameReceiveUpdates
            const statusInfo = { 
              isLive: game.isLive, 
              isPre: game.isScheduled && !game.isLive, 
              isPost: game.isFinished 
            };
            return shouldGameReceiveUpdates(game, statusInfo, game.sport || 'Unknown');
          });
          
          if (gamesToUpdate.length > 0) {
            console.log(`FavoritesScreen: Updating ${gamesToUpdate.length} games that meet timing criteria`);
            fetchFavoriteGames(false); // Use poll mode for auto-refresh
          } else {
            console.log('FavoritesScreen: No games meet timing criteria for update');
          }
          return currentGames; // Return unchanged to prevent re-render
        });
      }, 10000); // 10 seconds

      setUpdateInterval(interval);

      return () => {
        clearInterval(interval);
        setUpdateInterval(null);
      };
    } else {
      // Clear interval if no live games
      if (updateInterval) {
        clearInterval(updateInterval);
        setUpdateInterval(null);
      }
    }
  }, [favoriteGames, isScreenFocused]);

  // Set up periodic refresh every 5 minutes to catch date changes and game updates
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      console.log('Favorites auto-refresh triggered - using poll mode');
      fetchFavoriteGames(false); // Use poll mode for periodic refresh
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(refreshInterval);
  }, []);

  // Set up separate interval for games plays updates (every 10 seconds)
  useEffect(() => {
    const playsInterval = setInterval(() => {
      // Use a callback to get current favoriteGames to avoid dependency issues
      setFavoriteGames(currentGames => {
        // Get games that should receive updates based on their status and timing
        const gamesToUpdatePlays = currentGames.filter(game => {
          if (!game) return false;
          const statusInfo = { 
            isLive: game.isLive, 
            isPre: game.isScheduled && !game.isLive, 
            isPost: game.isFinished 
          };
          return shouldGameReceiveUpdates(game, statusInfo, game.sport || 'Unknown');
        });

        if (gamesToUpdatePlays.length > 0) {
          console.log('Plays auto-update triggered for', gamesToUpdatePlays.length, 'games meeting timing criteria');
          // Pass the currentGames snapshot and the gamesToUpdatePlays to avoid stale closure
          updateLiveGamesPlays(currentGames, gamesToUpdatePlays);
        } else {
          console.log('No games meet timing criteria for plays update');
        }
        
        return currentGames; // Return unchanged to prevent unnecessary re-render
      });
    }, 10 * 1000); // 10 seconds

    setLiveGamesInterval(playsInterval);
    
    return () => {
      clearInterval(playsInterval);
      setLiveGamesInterval(null);
    };
  }, []); // Remove favoriteGames dependency to prevent interval recreation

  // Lightweight MLB poller: refresh in-progress MLB favorites every 25s while screen is focused
  useEffect(() => {
    if (!isScreenFocused) return;

    let mlbInterval = null;

    const startPolling = () => {
      mlbInterval = setInterval(async () => {
        try {
          // Find MLB favorites that have a currentGame with an eventId - only actual MLB teams
          const mlbFavs = favorites.filter(f => {
            const sport = String(f.sport || '').toLowerCase();
            const leagueCode = String(f.actualLeagueCode || '').toLowerCase();
            const competition = String(f.currentGame?.competition || '').toLowerCase();
            // Only consider teams that are explicitly MLB and have MLB competition and the stored currentGame is scheduled
            const isMLBTeam = (sport === 'mlb' || leagueCode === 'mlb');
            const hasCurrent = f.currentGame && (f.currentGame.eventId || f.currentGame.gameId);
            const isScheduled = Boolean(f.currentGame && (f.currentGame.isScheduled || (f.currentGame.gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state === 'pre')));
            return isMLBTeam && (competition === 'mlb' || !competition) && hasCurrent && isScheduled;
          });

          if (mlbFavs.length === 0) return;

          await Promise.all(mlbFavs.map(async (fav) => {
            try {
              const eventId = fav.currentGame?.eventId || fav.currentGame?.gameId || fav.currentGame?.id;
              if (!eventId) return;
              
              // Check if this game should still be updated (not finished, not too far in future)
              if (!shouldFetchGame(fav.currentGame, fav.displayName || fav.teamName || 'Unknown')) {
                console.log(`MLB poller: skipping ${fav.displayName || fav.teamName} due to timing/status`);
                return;
              }
              
              const url = `https://statsapi.mlb.com/api/v1.1/game/${eventId}/feed/live`;
              const json = await fetchJsonWithCache(url);

              const coded = json?.gameData?.status?.codedGameState || json?.liveData?.status?.codedGameState;
              const linescore = json?.liveData?.linescore;

              // Build an updated currentGame object - keep previous fields and add mlb payload
              const updatedCurrentGame = {
                ...(fav.currentGame || {}),
                eventId: eventId,
                mlbGameData: json?.gameData || null,
                liveData: json?.liveData || null,
                codedGameState: coded,
                linescore,
                updatedAt: new Date().toISOString()
              };

              // Only update if coded state or linescore changed
              const prevCoded = fav.currentGame?.codedGameState || fav.currentGame?.status || null;
              const prevLinescoreJson = JSON.stringify(fav.currentGame?.linescore || fav.liveData?.linescore || null);
              const newLinescoreJson = JSON.stringify(linescore || null);
              if (String(prevCoded) !== String(coded) || prevLinescoreJson !== newLinescoreJson) {
                await updateTeamCurrentGame(fav.teamId, updatedCurrentGame);
              }
            } catch (err) {
              console.warn('MLB poll error for', fav.teamId, err?.message || err);
            }
          }));
        } catch (err) {
          console.warn('MLB polling loop error', err?.message || err);
        }
      }, 10000);
    };

    startPolling();

    return () => {
      if (mlbInterval) clearInterval(mlbInterval);
    };
  }, [isScreenFocused, favorites, updateTeamCurrentGame]);

  const fetchFavoriteGames = async (forceRefresh = false) => {
    // Prevent concurrent executions
    if (isFetchingFavorites && !forceRefresh) {
      console.log('Skipping fetch - already in progress');
      return;
    }

    try {
      isFetchingFavorites = true;
      // Mark the fetch phase so fetchJsonWithCache can decide whether to allow discovery fetches
      currentFetchPhase = forceRefresh ? 'initial' : 'poll';
      const now = Date.now();

      // Reduce debounce time to 2 seconds for better responsiveness
      if (!forceRefresh && lastFetchTime && (now - lastFetchTime) < 5000) {
        console.log('Skipping fetch - too soon since last fetch (5s cooldown)');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      console.log('Fetching favorite games...', new Date().toISOString(), forceRefresh ? '(forced)' : '');
      setLastFetchTime(now);
      
      // Clear logged games and games to update to allow fresh status logging and update tracking
      loggedGames.clear();
      gamesToUpdate.clear();
      
      // Initialize fetch pass tracking
      currentFetchPassId = ++fetchPassCounter;
      
      // Cleanup old cache entries (older than 6 hours)
      const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
      for (const [url, entry] of eventFetchCache.entries()) {
        if (entry.timestamp < sixHoursAgo) {
          eventFetchCache.delete(url);
        }
      }
      
      const favoriteTeams = getFavoriteTeams();
      console.log('Fetching games for teams:', favoriteTeams.map(t => `${t.displayName || t.teamName || 'Unknown'} (${t.sport})`));
      
      // Get unique teams by normalized key to avoid duplicates and malformed team objects
      // Prefer deduplication by teamId when present. If teamId is missing, fall back to displayName|sport.
      const seenKeys = new Set();
      const uniqueTeams = [];
      for (const team of favoriteTeams) {
        const rawId = team?.teamId ?? team?.id ?? null;
        const id = rawId != null ? String(rawId).trim() : null;
        const display = team?.displayName || team?.teamName || 'Unknown';
        const sport = team?.sport || '';
        const key = id ? `id:${id}` : `name:${display}|${sport}`;

        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueTeams.push(team);
        } else {
          console.log(`FavoritesScreen: skipped duplicate favorite key=${key} for team=${display}`);
        }
      }
      
      console.log(`Processing ${uniqueTeams.length} unique teams from ${favoriteTeams.length} favorites`);
      
      // Use the module-level promiseWithTimeout helper

      // For each unique team, check if we have current game data first, then fallback to fetching
  const gamesPromises = uniqueTeams.flatMap(async (team) => {
        const teamGames = [];
  const teamName = (team && (team.displayName || team.teamName)) || 'Unknown Team';
        const teamStart = Date.now();
        const phaseTimes = {};
        
        // Check if we have current game data for this team
        // Pass the entire team object so the FavoritesContext can resolve legacy id shapes
        let currentGameData = getTeamCurrentGame(team);

        // If this fetch is not forced, skip teams that don't have a stored scheduled/current game
        // This avoids discovery fetches for every favorite on each poll interval
        if (!forceRefresh) {
          const flags = computeMatchFlags(currentGameData || {});
          if (!currentGameData || !flags.isScheduled) {
            console.log(`Skipping per-team processing for ${teamName} (no scheduled currentGame and not forced)`);
            return teamGames; // empty
          }
        }

        // Diagnostic: log stored currentGame split by country vs UEFA competitions
        try {
          const stored = currentGameData;
          const storedCompetition = stored?.competition || null;
          const countryGame = stored && storedCompetition && !String(storedCompetition).toLowerCase().startsWith('uefa') ? stored : null;
          const uefaGame = stored && storedCompetition && String(storedCompetition).toLowerCase().startsWith('uefa') ? stored : null;
          const teamObjCurrent = team?.currentGame || null; // if team object itself carried a currentGame
          console.log(`FavoritesScreen: team ${teamName} currentGame -> country: ${countryGame ? `${countryGame.eventId} (${countryGame.competition})` : 'none'}, uefa: ${uefaGame ? `${uefaGame.eventId} (${uefaGame.competition})` : 'none'}, teamObj: ${teamObjCurrent ? JSON.stringify(teamObjCurrent) : 'none'}, storedRaw: ${stored ? JSON.stringify(stored) : 'none'}`);
        } catch (e) {
          console.log('FavoritesScreen: error logging currentGame diagnostics for', teamName, e?.message || e);
        }
      
      // Aggregate MLB schedule validation to avoid duplicate calls
      const mlbTeamsToValidate = [];
      for (const team of uniqueTeams) {
        const currentGameData = getTeamCurrentGame(team);
        const sportValLower = String(team?.sport || '').toLowerCase();
        // Only consider MLB teams with stored currentGame. During normal polling (not forced),
        // only validate if the stored currentGame appears scheduled (this avoids discovery fetches on every poll).
        const shouldConsider = Boolean(currentGameData) && (sportValLower === 'mlb' || sportValLower === 'mlbteam' || String(team?.actualLeagueCode || '').toLowerCase() === 'mlb');
        if (shouldConsider) {
          const mlbTeamId = team.teamId || team.id || (team.team && (team.team.teamId || team.team.id));
          if (mlbTeamId && !mlbTeamsToValidate.find(t => t.mlbTeamId === mlbTeamId)) {
            mlbTeamsToValidate.push({ team, currentGameData, mlbTeamId, teamName: (team && (team.displayName || team.teamName)) || 'Unknown Team' });
          }
        }
      }
      
      // Validate all MLB teams at once using aggregated schedule fetch
      if (mlbTeamsToValidate.length > 0) {
        (async () => {
          try {
            const getAdjustedDateForMLB = () => {
              const now = new Date();
              const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
              const isDST = new Date().getTimezoneOffset() < new Date(new Date().getFullYear(), 0, 1).getTimezoneOffset();
              const easternOffset = isDST ? -4 : -5;
              const easternTime = new Date(utcTime + (easternOffset * 3600000));
              if (easternTime.getHours() < 2) easternTime.setDate(easternTime.getDate() - 1);
              return easternTime.getFullYear() + "-" + String(easternTime.getMonth() + 1).padStart(2, "0") + "-" + String(easternTime.getDate()).padStart(2, "0");
            };

            const adjusted = getAdjustedDateForMLB();
            const schedule = await fetchMLBScheduleForDate(adjusted);
            
            if (schedule?.dates?.length > 0 && schedule.dates[0].games?.length > 0) {
              const allGamesToday = schedule.dates[0].games;
              
              // Process each MLB team's validation
              for (const { team, currentGameData, mlbTeamId, teamName } of mlbTeamsToValidate) {
                try {
                  const teamGames = allGamesToday.filter(g => 
                    g.teams?.away?.team?.id === mlbTeamId || 
                    g.teams?.home?.team?.id === mlbTeamId
                  );
                  
                  if (teamGames.length > 0) {
                    const liveGame = teamGames.find(g => {
                      return g.status && (g.status.abstractGameState === 'Live' || g.status.detailedState === 'In Progress' || g.status.codedGameState === 'I' || g.status.detailedState === 'Manager Challenge');
                    });
                    const scheduledGame = teamGames.find(g => g.status && (g.status.abstractGameState === 'Preview' || (g.status.detailedState && g.status.detailedState.includes('Scheduled') || g.status.detailedState.includes('Pre-Game')) || g.status.detailedGameState?.includes('Warmup')));
                    const chosen = liveGame || scheduledGame || teamGames[0];
                    
                    if (chosen && String(chosen.gamePk) !== String(currentGameData.eventId)) {
                      const updatedCurrentGame = {
                        eventId: chosen.gamePk,
                        eventLink: chosen.link || `/api/v1.1/game/${chosen.gamePk}/feed/live`,
                        gameDate: chosen.gameDate,
                        competition: 'mlb',
                        updatedAt: new Date().toISOString()
                      };
                      
                      try {
                        await updateTeamCurrentGame(team.teamId || String(mlbTeamId), updatedCurrentGame);
                        console.log(`FavoritesScreen: updated stored currentGame for team ${teamName} to today's game ${updatedCurrentGame.eventId}`);
                      } catch (e) {
                        console.log('FavoritesScreen: failed to update stored currentGame:', e?.message || e);
                      }
                    }
                  }
                } catch (e) {
                  console.log('FavoritesScreen: MLB schedule validation failed for', teamName, e?.message || e);
                }
              }
            }
          } catch (e) {
            console.log('FavoritesScreen: error during aggregated MLB validation', e?.message || e);
          }
        })();
      }

  // Additional: if stored currentGameData exists for soccer/UEFA favorites, ensure it is for today's date
  let clearedSoccerCurrentGame = false;
  try {
        const soccerIndicators = ['champions', 'uefa', 'premier', 'league', 'eng', 'esp', 'serie', 'bundesliga', 'ligue'];
        const sportValLower = String(team?.sport || '').toLowerCase();
        const hasSoccer = soccerIndicators.some(ind => sportValLower.includes(ind) || String(team?.actualLeagueCode || '').toLowerCase().includes(ind));
        if (currentGameData && hasSoccer) {
          // Use getTodayDateRange defined earlier in this file
          try {
            const { todayStart, todayEnd } = getTodayDateRange();
            const gameDate = currentGameData.gameDate ? new Date(currentGameData.gameDate) : null;
            if (!gameDate || gameDate < todayStart || gameDate >= todayEnd) {
              // Stored currentGame not from today - clear it so normal fetch can find a fresh game
              try {
                await clearTeamCurrentGame(team.teamId || (team?.id ? String(team.id) : null));
                console.log(`FavoritesScreen: cleared stale soccer currentGame for ${teamName} (was ${currentGameData.eventId})`);
                clearedSoccerCurrentGame = true;
              } catch (e) {
                console.log('FavoritesScreen: failed to clear stale soccer currentGame', e?.message || e);
              }
              currentGameData = null;
            }
          } catch (e) {
            // ignore date parse errors
            console.log('FavoritesScreen: soccer date validation failed for', teamName, e?.message || e);
          }
        }
      } catch (e) {
        // ignore
      }

      // If we have a stored currentGame, use direct fetch. Otherwise, skip this team.
      if (currentGameData) {
        console.log(`Found current game data for ${teamName}, using direct fetch -> eventId=${currentGameData.eventId || 'none'}, competition=${currentGameData.competition || 'none'}, eventLink=${currentGameData.eventLink || 'none'}`);
        try {
          const directResult = await promiseWithTimeout(fetchGameFromEventLink(team, currentGameData), 4500);
          if (directResult) {
            const results = Array.isArray(directResult) ? directResult : [directResult];
            const valid = results.filter(r => r !== null);
            if (valid.length > 0) teamGames.push(...valid);
          }
        } catch (error) {
          console.log(`Direct fetch failed for ${teamName}:`, error);
        }
      } else {
        // If this is a soccer-like team and we have no stored currentGame, skip processing
        try {
          const sportValLowerCheck = String(team?.sport || '').toLowerCase();
          const indicatorsCheck = ['champions', 'uefa', 'premier', 'league', 'eng', 'esp', 'serie', 'bundesliga', 'ligue'];
          const isSoccerLike = indicatorsCheck.some(ind => sportValLowerCheck.includes(ind) || String(team?.actualLeagueCode || '').toLowerCase().includes(ind));
          if (isSoccerLike) {
            console.log(`Skipping processing for ${teamName}: no stored currentGame and team is soccer-like`);
            return []; // Skip fetch for soccer favorites with no stored matches
          }
        } catch (e) {
          // ignore
        }
        
        // For non-soccer teams (like MLB) without stored currentGame, try domestic fetch as fallback
        console.log(`No stored currentGame for ${teamName}, trying domestic fetch as fallback`);
        try {
          const sportVal = String(team?.sport || '').toLowerCase();
          let fallbackResult = null;
          if (sportVal === 'mlb') {
            fallbackResult = await promiseWithTimeout(fetchMLBTeamGame(team), 3500);
          }
          
          if (fallbackResult) {
            const results = Array.isArray(fallbackResult) ? fallbackResult : [fallbackResult];
            const valid = results.filter(r => r !== null);
            if (valid.length > 0) teamGames.push(...valid);
          }
        } catch (error) {
          console.log(`Fallback fetch failed for ${teamName}:`, error);
        }
      }

        phaseTimes.total = Date.now() - teamStart;
        console.log(`FavoritesScreen: team ${teamName} fetch phases (ms):`, phaseTimes);

        return teamGames;
      });

      // Merge results incrementally as individual team promises resolve to improve perceived load time.
      // We still wait for all promises to settle before doing the final dedupe/replace, but
      // the UI will receive updates as soon as each team returns.
      let incrementalRendered = false;

      const mergeAndSetGames = (newGames) => {
        if (!newGames || newGames.length === 0) return;
        setFavoriteGames(prev => {
          // Attach status flags to new games
          const enriched = newGames.map(g => ({ ...(g || {}), ...computeMatchFlags(g || {}) }));
          const merged = [...prev, ...enriched];
          // dedupe by id
          const unique = merged.reduce((acc, game) => {
            if (!acc.find(g => g.id === game.id)) acc.push(game);
            return acc;
          }, []);
          // Show all games (scheduled, live, and finished)
          return sortGamesByStatusAndTime(unique);
        });
      };

      gamesPromises.forEach(p => {
        p.then(games => {
          try {
            mergeAndSetGames(games);
            if (!incrementalRendered) {
              incrementalRendered = true;
              // Hide the initial loading spinner as soon as we have at least one result
              setLoading(false);
            }
          } catch (e) {
            console.log('Error processing incremental games result:', e);
          }
        }).catch(e => {
          console.log('Team fetch error (non-fatal):', e);
        });
      });

      // Wait for all to finish, then compute final unique set and replace state with final sorted list
      const settled = await Promise.allSettled(gamesPromises);
      const gamesArrays = settled.map(s => s.status === 'fulfilled' ? s.value : null);
      // Flatten the arrays since each team can return multiple games
      const allGames = (gamesArrays.filter(a => a).flat());
      const validGames = allGames.filter(game => game !== null);

      // Remove duplicate games (when both teams in a match are favorited)
      const uniqueGames = validGames.reduce((acc, game) => {
        if (!game || !game.id) {
          console.warn('Game without ID found, skipping:', game);
          return acc;
        }
        // Use game ID as unique identifier
        const existingGame = acc.find(g => g.id === game.id);
        if (!existingGame) {
          acc.push(game);
        } else {
          console.log(`Duplicate game removed: ${game.id} (${game.sport})`);
        }
        return acc;
      }, []);

      console.log(`Found ${validGames.length} games (${uniqueGames.length} unique) for ${favoriteTeams.length} favorite teams`);
      console.log('Unique game IDs:', uniqueGames.map(g => g.id));
      
      // Log summary of games being tracked for updates
      if (gamesToUpdate.size > 0) {
        console.log(`UPDATE TRACKING: ${gamesToUpdate.size} games will receive updates:`, Array.from(gamesToUpdate));
      } else {
        console.log('UPDATE TRACKING: No games currently need updates (all finished beyond timing window or too far in future)');
      }
      // Preserve any incremental results already in state (merge union) so fast direct fetches aren't lost
      try {
        setFavoriteGames(prev => {
          try {
            const unionMap = new Map();
            // Enrich uniqueGames with flags
            uniqueGames.forEach(g => unionMap.set(String(g.id), { ...(g || {}), ...computeMatchFlags(g || {}) }));
            (prev || []).forEach(g => {
              if (g && g.id && !unionMap.has(String(g.id))) unionMap.set(String(g.id), g);
            });
            // Show all games
            const all = Array.from(unionMap.values());
            return sortGamesByStatusAndTime(all);
          } catch (inner) {
            console.log('Error merging incremental games with final results (inside updater):', inner);
            // fallback: enrich and show all games
            const fallback = uniqueGames.map(g => ({ ...(g || {}), ...computeMatchFlags(g || {}) }));
            return sortGamesByStatusAndTime(fallback);
          }
        });
      } catch (e) {
        console.log('Error merging incremental games with final results, falling back to uniqueGames:', e);
        setFavoriteGames(sortGamesByStatusAndTime(uniqueGames.map(g => ({ ...(g || {}), ...computeMatchFlags(g || {}) }))));
      }
    } catch (error) {
      console.error('Error fetching favorite games:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFetchingFavorites = false; // Reset the flag to allow future fetches
      currentFetchPhase = 'idle';
    }
  };

  const onRefresh = () => {
    console.log('Manual refresh triggered - forcing refresh');
    setRefreshing(true);
    fetchFavoriteGames(true); // Force refresh on manual pull
  };

  // Function to update plays data for games that need updates based on timing and status
  // Accept a snapshot of currentGames and a prefiltered liveSnapshot to avoid stale closures
  const updateLiveGamesPlays = async (currentGamesSnapshot = null, liveSnapshot = null) => {
    try {
      // Get games that should receive updates based on their status and timing
      const gamesToUpdate = Array.isArray(liveSnapshot) ? liveSnapshot : (
        Array.isArray(currentGamesSnapshot) ? 
          currentGamesSnapshot.filter(g => {
            if (!g) return false;
            const statusInfo = { 
              isLive: g.isLive, 
              isPre: g.isScheduled && !g.isLive, 
              isPost: g.isFinished 
            };
            return shouldGameReceiveUpdates(g, statusInfo, g.sport || 'Unknown');
          }) : 
          favoriteGames.filter(game => {
            if (!game) return false;
            const statusInfo = { 
              isLive: game.isLive, 
              isPre: game.isScheduled && !game.isLive, 
              isPost: game.isFinished 
            };
            return shouldGameReceiveUpdates(game, statusInfo, game.sport || 'Unknown');
          })
      );

      if (gamesToUpdate.length === 0) {
        console.log('No games need play updates');
        return;
      }

      console.log(`Updating plays for ${gamesToUpdate.length} games that need updates`);

      const updatedGames = await Promise.all(
        favoriteGames.map(async (game) => {
          // Check if this game is one that should receive updates
          const shouldUpdate = gamesToUpdate.find(g => g.id === game.id);
          
          if (!shouldUpdate) {
            return game; // Return unchanged if not in update list
          }

          try {
            let playsData = null;
            
            // Determine the correct API endpoint based on sport
            if (game.sport === 'Champions League' || game.actualLeagueCode === 'uefa.champions') {
              const playsResponseData = await fetchJsonWithCache(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.champions/events/${game.id}/competitions/${game.id}/plays?lang=en&region=us&limit=200`);
              if (playsResponseData.items && playsResponseData.items.length > 0) {
                playsData = [...playsResponseData.items].reverse();
                console.log(`Updated plays for UCL game ${game.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
              }
            } else if (game.sport === 'Europa League' || game.actualLeagueCode === 'uefa.europa') {
              const playsResponseData = await fetchJsonWithCache(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.europa/events/${game.id}/competitions/${game.id}/plays?lang=en&region=us&limit=200`);
              if (playsResponseData.items && playsResponseData.items.length > 0) {
                playsData = [...playsResponseData.items].reverse();
                console.log(`Updated plays for UEL game ${game.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
              }
            } else if (game.sport === 'Europa Conference League' || game.actualLeagueCode === 'uefa.europa.conf') {
              const playsResponseData = await fetchJsonWithCache(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.europa.conf/events/${game.id}/competitions/${game.id}/plays?lang=en&region=us&limit=200`);
              if (playsResponseData.items && playsResponseData.items.length > 0) {
                playsData = [...playsResponseData.items].reverse();
                console.log(`Updated plays for UECL game ${game.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
              }
            } else if (game.sport === 'MLB' || game.actualLeagueCode === 'mlb') {
              const playsResponseData = await fetchJsonWithCache(`https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events/${game.id}/competitions/${game.id}/plays?lang=en&region=us&limit=50`);
              if (playsResponseData.items && playsResponseData.items.length > 0) {
                playsData = [...playsResponseData.items].reverse();
                console.log(`Updated plays for MLB game ${game.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
              }
            } else if (game.actualLeagueCode) {
              // Handle domestic leagues using the actualLeagueCode
              const playsResponseData = await fetchJsonWithCache(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${game.actualLeagueCode}/events/${game.id}/competitions/${game.id}/plays?lang=en&region=us&limit=200`);
              if (playsResponseData.items && playsResponseData.items.length > 0) {
                playsData = [...playsResponseData.items].reverse();
                console.log(`Updated plays for ${game.actualLeagueCode} game ${game.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
              } else {
                console.warn(`Failed to fetch plays for ${game.actualLeagueCode} game ${game.id}, status: ${playsResponse.status}`);
              }
            }
            // Add more sports here as needed
            
            // Only update if plays data actually changed to prevent unnecessary re-renders
            if (playsData) {
              const currentPlaysJson = JSON.stringify(game.playsData);
              const newPlaysJson = JSON.stringify(playsData);
              if (currentPlaysJson !== newPlaysJson) {
                return { ...game, playsData };
              }
            }
            
            return game;
          } catch (error) {
            console.error(`Error updating plays for game ${game.id}:`, error);
            return game;
          }
        })
      );

      // Only update state if there were actual changes
      const hasChanges = updatedGames.some((game, index) => {
        const currentPlays = JSON.stringify(favoriteGames[index]?.playsData);
        const newPlays = JSON.stringify(game.playsData);
        return currentPlays !== newPlays;
      });
      
      if (hasChanges) {
        setFavoriteGames(updatedGames);
      } else {
        console.log('No changes in plays data, skipping state update');
      }
    } catch (error) {
      console.error('Error updating live games plays:', error);
    }
  };

  // Function to fetch game data directly using event link
  const getEventData = async (url) => {
    if (!url) return null;
    // Resolve known relative MLB feed links to full statsapi URL
    try {
      if (typeof url === 'string' && url.startsWith('/api/v1.1/game/')) {
        url = `https://statsapi.mlb.com${url}`;
      }
    } catch (e) {
      // ignore
    }
    return await fetchJsonWithCache(url);
  };

  const fetchGameFromEventLink = async (team, currentGameData) => {
    try {
      const teamName = team.displayName || team.teamName || 'Unknown Team';
      if (!currentGameData) {
        console.log(`No currentGameData for ${teamName}, skipping direct fetch`);
        return null;
      }
      if (!currentGameData.eventLink && !currentGameData.eventId) {
        console.log(`No eventLink/eventId in currentGameData for ${teamName}, skipping direct fetch`);
        return null;
      }
      console.log(`Fetching game directly from event link for ${teamName}:`, currentGameData.eventLink || currentGameData.eventId);

      // Check if the current game is from today
      const { todayStart, todayEnd } = getTodayDateRange();
      const gameDate = currentGameData.gameDate ? new Date(currentGameData.gameDate) : null;
      if (!gameDate) {
        console.log(`No valid gameDate for ${teamName} in currentGameData, skipping direct fetch`);
        return null;
      }
      if (gameDate < todayStart || gameDate >= todayEnd) {
        console.log(`Game for ${teamName} is not from today, skipping direct fetch`);
        return null;
      }
      
      // Handle MLB games differently - prefer the proper MLB API format (case-insensitive)
      const teamSport = String(team?.sport || '').toLowerCase();
      if (teamSport === 'mlb' && currentGameData.eventId) {
        console.log(`Fetching MLB game using statsapi.mlb.com for ${teamName} with gamePk: ${currentGameData.eventId}`);
        const mlbUrl = `https://statsapi.mlb.com/api/v1.1/game/${currentGameData.eventId}/feed/live`;
        const eventData = await fetchJsonWithCache(mlbUrl);
        
        if (!eventData) {
          console.log(`Failed to fetch MLB game data for ${teamName}`);
          return null;
        }
        
        const mlbData = eventData;
        
  // Convert MLB data to the expected format for the favorites screen
        const convertedGame = {
          id: currentGameData.eventId,
          sport: 'MLB',
          actualLeagueCode: 'mlb',
          date: currentGameData.gameDate,
          venue: {
            name: mlbData.gameData?.venue?.name,
            fullName: mlbData.gameData?.venue?.name
          },
          mlbGameData: mlbData.gameData || null,
          mlbLiveData: mlbData.liveData || null,
          competitions: [{
            id: currentGameData.eventId,
            competitors: [
              {
                id: mlbData.gameData?.teams?.away?.id,
                homeAway: 'away',
                team: {
                  id: mlbData.gameData?.teams?.away?.id,
                  abbreviation: mlbData.gameData?.teams?.away?.abbreviation,
                  displayName: mlbData.gameData?.teams?.away?.name,
                  logos: [{
                    href: `https://a.espncdn.com/i/teamlogos/mlb/500/${mlbData.gameData?.teams?.away?.abbreviation?.toLowerCase()}.png`
                  }]
                },
                score: mlbData.liveData?.linescore?.teams?.away?.runs?.toString() || '0'
              },
              {
                id: mlbData.gameData?.teams?.home?.id,
                homeAway: 'home',
                team: {
                  id: mlbData.gameData?.teams?.home?.id,
                  abbreviation: mlbData.gameData?.teams?.home?.abbreviation,
                  displayName: mlbData.gameData?.teams?.home?.name,
                  logos: [{
                    href: `https://a.espncdn.com/i/teamlogos/mlb/500/${mlbData.gameData?.teams?.home?.abbreviation?.toLowerCase()}.png`
                  }]
                },
                score: mlbData.liveData?.linescore?.teams?.home?.runs?.toString() || '0'
              }
            ]
          }],
          favoriteTeam: team,
          fromDirectLink: true,
          // Add MLB-specific live data for the mini bases display
          liveData: mlbData.gameData?.status?.codedGameState === 'I' ? {
            status: mlbData.gameData?.status,
            situation: {
              balls: mlbData.liveData?.linescore?.balls || 0,
              strikes: mlbData.liveData?.linescore?.strikes || 0,
              outs: mlbData.liveData?.linescore?.outs || 0,
              inning: mlbData.liveData?.linescore?.currentInning || 1,
              isTopInning: mlbData.liveData?.linescore?.inningState === 'Top',
              bases: {
                first: !!mlbData.liveData?.linescore?.offense?.first,
                second: !!mlbData.liveData?.linescore?.offense?.second,
                third: !!mlbData.liveData?.linescore?.offense?.third
              }
            }
          } : null
        };
        // If statsapi provides play-by-play, prefer it for playsData
        try {
          const mlbAllPlays = mlbData.liveData?.plays?.allPlays;
          if (!convertedGame.playsData && Array.isArray(mlbAllPlays) && mlbAllPlays.length > 0) {
            convertedGame.playsData = [...mlbAllPlays].reverse();
            console.log(`Converted game ${convertedGame.id} - populated playsData from statsapi.allPlays, count: ${convertedGame.playsData.length}`);
          }
        } catch (e) {
          // ignore
        }

        return convertedGame;
      }
      
  // For non-MLB games (or if MLB branch didn't run), use the existing helper which caches and is null-safe
      const eventData = await getEventData(currentGameData.eventLink);
      if (!eventData) {
        console.log(`No event JSON returned for ${teamName} from link: ${currentGameData.eventLink}`);
        return null;
      }
      
      // Fetch team and score data for competitors if needed
      if (eventData.competitions?.[0]?.competitors) {
        const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
          try {
            const [teamData, scoreData] = await Promise.all([
              competitor.team?.$ref ? getEventData(competitor.team.$ref).catch(() => null) : null,
              competitor.score?.$ref ? getEventData(competitor.score.$ref).catch(() => null) : null
            ]);
            return { ...competitor, team: teamData || competitor.team, score: scoreData || competitor.score };
          } catch (e) {
            console.log(`Error resolving competitor refs for event ${eventData.id}:`, e?.message || e);
            return competitor;
          }
        });

        eventData.competitions[0].competitors = await Promise.all(competitorPromises);
      }

      // Get status data if needed
      let gameDataWithStatus = null;
      try {
        // Try multiple competitions to find the right one (like ChampionsLeagueServiceEnhanced)
        const competitionsToTry = [
          currentGameData.competition, // Try the provided competition first
          'uefa.champions_qual',       // Champions League Qualifying
          'uefa.champions',            // Champions League
          'uefa.europa',               // Europa League  
          'uefa.europa.conf'           // Europa Conference League
        ].filter(Boolean); // Remove null/undefined values

        console.log(`Trying to fetch Site API status for game ${eventData.id} from competitions:`, competitionsToTry);

        for (const competition of competitionsToTry) {
          try {
            // Use the central cached fetch helper so we respect poll gating and caching.
            const statusJson = await fetchJsonWithCache(`https://site.api.espn.com/apis/site/v2/sports/soccer/${competition}/summary?event=${eventData.id}`);
            if (statusJson) {
              gameDataWithStatus = statusJson;
              console.log(`Successfully fetched Site API status for game ${eventData.id} from ${competition}:`, {
                hasHeader: !!gameDataWithStatus?.header,
                hasStatus: !!gameDataWithStatus?.header?.competitions?.[0]?.status,
                statusState: gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state,
                displayClock: gameDataWithStatus?.header?.competitions?.[0]?.status?.displayClock
              });
              break; // Found the right competition, stop trying
            }
          } catch (statusErr) {
            console.log(`Error fetching Site API status for game ${eventData.id} from ${competition}:`, statusErr.message);
          }
        }

        if (!gameDataWithStatus) {
          console.log(`Could not fetch Site API status for game ${eventData.id} from any competition`);
        }
      } catch (statusError) {
        console.log('Could not fetch status data for direct game:', statusError?.message || statusError);
      }

      // Fetch plays data for live games
      let playsData = null;
      const isLive = gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state === 'in';
      if (isLive) {
        try {
          const competition = currentGameData.competition || 'uefa.champions';
          const playsResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${competition}/events/${eventData.id}/competitions/${eventData.id}/plays?lang=en&region=us&limit=1000`);
          if (playsResponse.ok) {
            const playsResponseData = await playsResponse.json();
            if (playsResponseData.items && playsResponseData.items.length > 0) {
              playsData = [...playsResponseData.items].reverse();
              console.log(`Got ${playsData.length} plays for direct game ${eventData.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
            }
          }
        } catch (playsError) {
          console.log('Could not fetch plays data for direct game:', playsError);
        }
      }

      // Try to infer the league code from the event link if possible
      let inferredLeagueCode = null;
      try {
        // eventData.$ref typically contains the league code, e.g. .../leagues/eng.league_cup/events/758186
        const ref = eventData.$ref || eventData.competitions?.[0]?.$ref || '';
        const match = ref.match(/leagues\/([^\/]+)\/events/);
        if (match && match[1]) inferredLeagueCode = match[1];
      } catch (e) {
        // ignore
      }

      return {
        ...eventData,
        favoriteTeam: team,
        sport: team.sport,
        // Prefer the inferred league code from the event link, fall back to provided competition or team.sport
        actualLeagueCode: inferredLeagueCode || currentGameData.competition || team.sport,
        gameDataWithStatus: gameDataWithStatus,
        playsData: playsData,
        fromDirectLink: true // Flag to indicate this came from direct link
      };
      
    } catch (error) {
      const teamName = team.displayName || team.teamName || 'Unknown Team';
      console.error(`Error fetching game from event link for ${teamName}:`, error);
      return null;
    }
  };

  const fetchUCLTeamGame = async (team) => {
    try {
      if (!team?.teamId) {
        console.log('Skipping UCL fetch: missing teamId for', team);
        return null;
      }
      console.log(`Fetching UCL games for team: ${team.displayName} (${team.teamId})`);
      // Fetch team events from ESPN Core API
      const eventsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.champions/seasons/2025/teams/${team.teamId}/events?lang=en&region=us&limit=10`;
      const eventsData = await fetchJsonWithCache(eventsUrl);

      if (eventsData.items && eventsData.items.length > 0) {
        console.log(`Found ${eventsData.items.length} UCL events for ${team.displayName}`);
        // Find today's game using 2 AM cutoff
        const { todayStart, todayEnd } = getTodayDateRange();

        for (const eventRef of eventsData.items) {
          const eventData = await getEventData(eventRef.$ref);
          if (!eventData || !eventData.date) {
            console.log(`Skipping null/invalid UCL event data for ${eventRef.$ref}`);
            continue;
          }
          const eventDate = new Date(eventData.date);

          // Check if this is today's game
          if (eventDate >= todayStart && eventDate < todayEnd) {
            // Fetch team and score data for competitors
            if (eventData.competitions?.[0]?.competitors) {
              const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
                const [teamData, scoreData] = await Promise.all([
                  competitor.team?.$ref ? fetchTeamMetadataWithCache(competitor.team.$ref).catch(() => null) : null,
                  competitor.score?.$ref ? fetchJsonWithCache(competitor.score.$ref).catch(() => null) : null
                ]);
                return { ...competitor, team: teamData || competitor.team, score: scoreData || competitor.score };
              });
              
              eventData.competitions[0].competitors = await Promise.all(competitorPromises);
            }

            // Get full game data with status from Site API (like Game Details screen)
            let gameDataWithStatus = null;
              try {
                const competitionOrder = ['uefa.champions_qual', 'uefa.champions'];
                for (const competition of competitionOrder) {
                  try {
                    const statusJson = await fetchJsonWithCache(`https://site.api.espn.com/apis/site/v2/sports/soccer/${competition}/summary?event=${eventData.id}`);
                    if (statusJson) {
                      gameDataWithStatus = statusJson;
                      console.log(`Got status data for UCL game ${eventData.id} from ${competition}`, {
                        hasStatus: !!gameDataWithStatus?.header?.competitions?.[0]?.status,
                        status: gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state
                      });
                      break;
                    }
                  } catch (err) {
                    console.log(`Game ${eventData.id} not found in ${competition}`, err);
                  }
                }
              } catch (statusError) {
                console.log('Could not fetch status data:', statusError);
              }

            // Fetch plays data for live games
            let playsData = null;
            const isLive = gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state === 'in';
            if (isLive) {
                try {
                console.log(`Fetching plays data for live UCL game ${eventData.id}`);
                const playsJson = await fetchJsonWithCache(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.champions/events/${eventData.id}/competitions/${eventData.id}/plays?lang=en&region=us&limit=1000`);
                if (playsJson?.items && playsJson.items.length > 0) {
                  // Sort plays in reverse chronological order (most recent first) like Game Details
                  playsData = [...playsJson.items].reverse();
                  console.log(`Got ${playsData.length} plays for UCL game ${eventData.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
                }
              } catch (playsError) {
                console.log('Could not fetch plays data:', playsError);
              }
            }

            return {
              ...eventData,
              favoriteTeam: team,
              sport: team.sport,
              actualLeagueCode: 'uefa.champions', // Store the actual league code for proper header display
              gameDataWithStatus: gameDataWithStatus, // Add the status data
              playsData: playsData // Add plays data for live games
            };
          }
        }
      } else {
        console.log(`No UCL events found for ${team.displayName}`);
      }
      console.log(`UCL fetch complete for ${team.displayName}: no games found`);
      return null;
    } catch (error) {
      console.error('Error fetching UCL team game:', error);
      return null;
    }
  };

  const fetchUELTeamGame = async (team) => {
    try {
      if (!team?.teamId) {
        console.log('Skipping UEL fetch: missing teamId for', team);
        return null;
      }
      // Use Europa League API endpoint
      const eventsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.europa/seasons/2025/teams/${team.teamId}/events?lang=en&region=us&limit=10`;
      const eventsData = await fetchJsonWithCache(eventsUrl);

      if (eventsData.items && eventsData.items.length > 0) {
        const { todayStart, todayEnd } = getTodayDateRange();

        for (const eventRef of eventsData.items) {
          const eventData = await getEventData(eventRef.$ref);
          if (!eventData || !eventData.date) {
            console.log(`Skipping null/invalid UEL event data for ${eventRef.$ref}`);
            continue;
          }
          const eventDate = new Date(eventData.date);

          if (eventDate >= todayStart && eventDate < todayEnd) {
            if (eventData.competitions?.[0]?.competitors) {
              const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
                const [teamData, scoreData] = await Promise.all([
                  competitor.team?.$ref ? fetchTeamMetadataWithCache(competitor.team.$ref).catch(() => null) : null,
                  competitor.score?.$ref ? fetchJsonWithCache(competitor.score.$ref).catch(() => null) : null
                ]);
                return { ...competitor, team: teamData || competitor.team, score: scoreData || competitor.score };
              });
              
              eventData.competitions[0].competitors = await Promise.all(competitorPromises);
            }

            // Get full game data with status from Site API (like Game Details screen)
            let gameDataWithStatus = null;
              try {
                const competitionOrder = ['uefa.europa_qual', 'uefa.europa'];
                for (const competition of competitionOrder) {
                  try {
                    const statusJson = await fetchJsonWithCache(`https://site.api.espn.com/apis/site/v2/sports/soccer/${competition}/summary?event=${eventData.id}`);
                    if (statusJson) {
                      gameDataWithStatus = statusJson;
                      console.log(`Got status data for UEL game ${eventData.id} from ${competition}`, {
                        hasStatus: !!gameDataWithStatus?.header?.competitions?.[0]?.status,
                        status: gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state
                      });
                      break;
                    }
                  } catch (err) {
                    console.log(`Game ${eventData.id} not found in ${competition}`, err);
                  }
                }
              } catch (statusError) {
                console.log('Could not fetch status data:', statusError);
              }

            // Fetch plays data for live games
            let playsData = null;
            const isLive = gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state === 'in';
            if (isLive) {
              try {
                console.log(`Fetching plays data for live UEL game ${eventData.id}`);
                const playsJson = await fetchJsonWithCache(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.europa/events/${eventData.id}/competitions/${eventData.id}/plays?lang=en&region=us&limit=1000`);
                if (playsJson?.items && playsJson.items.length > 0) {
                  // Sort plays in reverse chronological order (most recent first) like Game Details
                  playsData = [...playsJson.items].reverse();
                  console.log(`Got ${playsData.length} plays for UEL game ${eventData.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
                }
              } catch (playsError) {
                console.log('Could not fetch plays data:', playsError);
              }
            }

            return {
              ...eventData,
              favoriteTeam: team,
              sport: team.sport,
              actualLeagueCode: 'uefa.europa', // Store the actual league code for proper header display
              gameDataWithStatus: gameDataWithStatus, // Add the status data
              playsData: playsData // Add plays data for live games
            };
          }
        }
      }
      return null;
    } catch (error) {
      console.error('Error fetching UEL team game:', error);
      return null;
    }
  };

  const fetchUECLTeamGame = async (team) => {
    try {
      if (!team?.teamId) {
        console.log('Skipping UECL fetch: missing teamId for', team);
        return null;
      }
      // Use Europa Conference League API endpoint
      const eventsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.europa.conf/seasons/2025/teams/${team.teamId}/events?lang=en&region=us&limit=10`;
      const eventsData = await fetchJsonWithCache(eventsUrl);

      if (eventsData.items && eventsData.items.length > 0) {
        const { todayStart, todayEnd } = getTodayDateRange();

        for (const eventRef of eventsData.items) {
          const eventData = await getEventData(eventRef.$ref);
          if (!eventData || !eventData.date) {
            console.log(`Skipping null/invalid UECL event data for ${eventRef.$ref}`);
            continue;
          }
          const eventDate = new Date(eventData.date);

          if (eventDate >= todayStart && eventDate < todayEnd) {
            if (eventData.competitions?.[0]?.competitors) {
              const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
                const [teamData, scoreData] = await Promise.all([
                  competitor.team?.$ref ? fetchTeamMetadataWithCache(competitor.team.$ref).catch(() => null) : null,
                  competitor.score?.$ref ? fetchJsonWithCache(competitor.score.$ref).catch(() => null) : null
                ]);
                return { ...competitor, team: teamData || competitor.team, score: scoreData || competitor.score };
              });
              
              eventData.competitions[0].competitors = await Promise.all(competitorPromises);
            }

            // Get full game data with status from Site API (like Game Details screen)
            let gameDataWithStatus = null;
              try {
                const competitionOrder = ['uefa.europa.conf_qual', 'uefa.europa.conf'];
                for (const competition of competitionOrder) {
                  try {
                    const statusJson = await fetchJsonWithCache(`https://site.api.espn.com/apis/site/v2/sports/soccer/${competition}/summary?event=${eventData.id}`);
                    if (statusJson) {
                      gameDataWithStatus = statusJson;
                      console.log(`Got status data for UECL game ${eventData.id} from ${competition}`, {
                        hasStatus: !!gameDataWithStatus?.header?.competitions?.[0]?.status,
                        status: gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state
                      });
                      break;
                    }
                  } catch (err) {
                    console.log(`Game ${eventData.id} not found in ${competition}`, err);
                  }
                }
              } catch (statusError) {
                console.log('Could not fetch UECL status data:', statusError);
              }

            // Fetch plays data for live games
            let playsData = null;
            const isLive = gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state === 'in';
            if (isLive) {
              try {
                console.log(`Fetching plays data for live UECL game ${eventData.id}`);
                const playsResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.europa.conf/events/${eventData.id}/competitions/${eventData.id}/plays?lang=en&region=us&limit=1000`);
                if (playsResponse.ok) {
                  const playsResponseData = await playsResponse.json();
                  if (playsResponseData.items && playsResponseData.items.length > 0) {
                    playsData = [...playsResponseData.items].reverse();
                    console.log(`Got ${playsData.length} plays for UECL game ${eventData.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
                  }
                }
              } catch (playsError) {
                console.log('Could not fetch UECL plays data:', playsError);
              }
            }

            return {
              ...eventData,
              favoriteTeam: team,
              sport: team.sport,
              actualLeagueCode: 'uefa.europa.conf', // Store the actual league code for proper header display
              gameDataWithStatus: gameDataWithStatus, // Add the status data
              playsData: playsData // Add plays data for live games
            };
          }
        }
      }
      return null;
    } catch (error) {
      console.error('Error fetching UECL team game:', error);
      return null;
    }
  };

  const fetchSpainTeamGame = async (team) => {
    try {
      if (!team?.teamId) {
        console.log('Skipping Spain fetch: missing teamId for', team);
        return null;
      }
      // Check La Liga and associated domestic competitions
      const mainLeague = "esp.1";
      const competitions = [mainLeague, ...(LEAGUE_COMPETITIONS[mainLeague] || []).map(comp => comp.code)];
      const allGames = [];

      for (const leagueCode of competitions) {
        try {
          const eventsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/seasons/2025/teams/${team.teamId}/events?lang=en&region=us&limit=20`;
          const eventsData = await fetchJsonWithCache(eventsUrl);

          if (eventsData.items && eventsData.items.length > 0) {
            const { todayStart, todayEnd } = getTodayDateRange();

            for (const eventRef of eventsData.items) {
              const eventData = await getEventData(eventRef.$ref);
              if (!eventData || !eventData.date) {
                console.log(`Skipping null/invalid event data for ${eventRef.$ref}`);
                continue;
              }
              const eventDate = new Date(eventData.date);

              if (eventDate >= todayStart && eventDate < todayEnd) {
                if (eventData.competitions?.[0]?.competitors) {
                  const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
                    const [teamData, scoreData] = await Promise.all([
                      competitor.team?.$ref ? fetchTeamMetadataWithCache(competitor.team.$ref).catch(() => null) : null,
                      competitor.score?.$ref ? fetchJsonWithCache(competitor.score.$ref).catch(() => null) : null
                    ]);
                    return { ...competitor, team: teamData || competitor.team, score: scoreData || competitor.score };
                  });
                  
                  eventData.competitions[0].competitors = await Promise.all(competitorPromises);
                }

                // Get Site API status data for live status information
                let gameDataWithStatus = null;
                try {
                  console.log(`Fetching Site API status for Spain game ${eventData.id} from ${leagueCode}`);
                  const statusJson = await fetchJsonWithCache(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueCode}/summary?event=${eventData.id}`);
                  if (statusJson) {
                    gameDataWithStatus = statusJson;
                    console.log(`Successfully fetched Site API status for Spain game ${eventData.id} from ${leagueCode}:`, {
                      hasStatus: !!gameDataWithStatus?.header?.competitions?.[0]?.status,
                      statusState: gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state,
                      displayClock: gameDataWithStatus?.header?.competitions?.[0]?.status?.displayClock
                    });
                  }
                } catch (statusError) {
                  console.log(`Error fetching Site API status for Spain game ${eventData.id}:`, statusError.message);
                }

                // Fetch plays data for live games
                let playsData = null;
                const isLive = gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state === 'in';
                if (isLive) {
                  try {
                    console.log(`Fetching plays data for live Spain game ${eventData.id}`);
                    const playsJson = await fetchJsonWithCache(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/events/${eventData.id}/competitions/${eventData.id}/plays?lang=en&region=us&limit=1000`);
                    if (playsJson?.items && playsJson.items.length > 0) {
                      playsData = [...playsJson.items].reverse();
                      console.log(`Got ${playsData.length} plays for Spain game ${eventData.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
                    }
                  } catch (playsError) {
                    console.log('Could not fetch Spain plays data:', playsError);
                  }
                }

                allGames.push({
                  ...eventData,
                  favoriteTeam: team,
                  sport: team.sport,
                  actualLeagueCode: leagueCode, // Store the actual league code for proper header display
                  gameDataWithStatus: gameDataWithStatus, // Add the status data
                  playsData: playsData // Add plays data for live games
                });
              }
            }
          }
        } catch (error) {
          console.error(`Error fetching from ${leagueCode}:`, error);
        }
      }

      return allGames.length > 0 ? allGames[0] : null; // Return first game found for now
    } catch (error) {
      console.error('Error fetching Spain team games:', error);
      return null;
    }
  };

  const fetchItalyTeamGame = async (team) => {
    try {
      if (!team?.teamId) {
        console.log('Skipping Italy fetch: missing teamId for', team);
        return null;
      }
      // Check Serie A and associated domestic competitions
      const mainLeague = "ita.1";
      const competitions = [mainLeague, ...(LEAGUE_COMPETITIONS[mainLeague] || []).map(comp => comp.code)];
      const allGames = [];

      for (const leagueCode of competitions) {
        try {
          const eventsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/seasons/2025/teams/${team.teamId}/events?lang=en&region=us&limit=20`;
          const eventsData = await fetchJsonWithCache(eventsUrl);

          if (eventsData.items && eventsData.items.length > 0) {
            const { todayStart, todayEnd } = getTodayDateRange();

            for (const eventRef of eventsData.items) {
              const eventData = await getEventData(eventRef.$ref);
              if (!eventData || !eventData.date) {
                console.log(`Skipping null/invalid event data for ${eventRef.$ref}`);
                continue;
              }
              const eventDate = new Date(eventData.date);

              if (eventDate >= todayStart && eventDate < todayEnd) {
                if (eventData.competitions?.[0]?.competitors) {
                  const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
                    const [teamData, scoreData] = await Promise.all([
                      competitor.team?.$ref ? fetchTeamMetadataWithCache(competitor.team.$ref).catch(() => null) : null,
                      competitor.score?.$ref ? fetchJsonWithCache(competitor.score.$ref).catch(() => null) : null
                    ]);
                    return { ...competitor, team: teamData || competitor.team, score: scoreData || competitor.score };
                  });
                  
                  eventData.competitions[0].competitors = await Promise.all(competitorPromises);
                }

                // Get Site API status data for live status information
                let gameDataWithStatus = null;
                try {
                  console.log(`Fetching Site API status for Italy game ${eventData.id} from ${leagueCode}`);
                  const statusJson = await fetchJsonWithCache(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueCode}/summary?event=${eventData.id}`);
                  if (statusJson) {
                    gameDataWithStatus = statusJson;
                    console.log(`Successfully fetched Site API status for Italy game ${eventData.id} from ${leagueCode}:`, {
                      hasStatus: !!gameDataWithStatus?.header?.competitions?.[0]?.status,
                      statusState: gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state,
                      displayClock: gameDataWithStatus?.header?.competitions?.[0]?.status?.displayClock
                    });
                  }
                } catch (statusError) {
                  console.log(`Error fetching Site API status for Italy game ${eventData.id}:`, statusError.message);
                }

                // Fetch plays data for live games
                let playsData = null;
                const isLive = gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state === 'in';
                if (isLive) {
                  try {
                    console.log(`Fetching plays data for live Italy game ${eventData.id}`);
                    const playsJson = await fetchJsonWithCache(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/events/${eventData.id}/competitions/${eventData.id}/plays?lang=en&region=us&limit=1000`);
                    if (playsJson?.items && playsJson.items.length > 0) {
                      playsData = [...playsJson.items].reverse();
                      console.log(`Got ${playsData.length} plays for Italy game ${eventData.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
                    }
                  } catch (playsError) {
                    console.log('Could not fetch Italy plays data:', playsError);
                  }
                }

                allGames.push({
                  ...eventData,
                  favoriteTeam: team,
                  sport: team.sport,
                  actualLeagueCode: leagueCode, // Store the actual league code for proper header display
                  gameDataWithStatus: gameDataWithStatus, // Add the status data
                  playsData: playsData // Add plays data for live games
                });
              }
            }
          }
        } catch (error) {
          console.error(`Error fetching from ${leagueCode}:`, error);
        }
      }

      return allGames.length > 0 ? allGames[0] : null; // Return first game found for now
    } catch (error) {
      console.error('Error fetching Italy team games:', error);
      return null;
    }
  };

  const fetchGermanyTeamGame = async (team) => {
    try {
      if (!team?.teamId) {
        console.log('Skipping Germany fetch: missing teamId for', team);
        return null;
      }
      // Check Bundesliga and associated domestic competitions
      const mainLeague = "ger.1";
      const competitions = [mainLeague, ...(LEAGUE_COMPETITIONS[mainLeague] || []).map(comp => comp.code)];
      const allGames = [];

      for (const leagueCode of competitions) {
        try {
          const eventsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/seasons/2025/teams/${team.teamId}/events?lang=en&region=us&limit=20`;
          const eventsData = await fetchJsonWithCache(eventsUrl);

          if (eventsData.items && eventsData.items.length > 0) {
            const { todayStart, todayEnd } = getTodayDateRange();

            for (const eventRef of eventsData.items) {
              const eventData = await getEventData(eventRef.$ref);
              if (!eventData || !eventData.date) {
                console.log(`Skipping null/invalid event data for ${eventRef.$ref}`);
                continue;
              }
              const eventDate = new Date(eventData.date);

              if (eventDate >= todayStart && eventDate < todayEnd) {
                if (eventData.competitions?.[0]?.competitors) {
                  const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
                    const [teamData, scoreData] = await Promise.all([
                      competitor.team?.$ref ? fetchTeamMetadataWithCache(competitor.team.$ref).catch(() => null) : null,
                      competitor.score?.$ref ? fetchJsonWithCache(competitor.score.$ref).catch(() => null) : null
                    ]);
                    return { ...competitor, team: teamData || competitor.team, score: scoreData || competitor.score };
                  });
                  
                  eventData.competitions[0].competitors = await Promise.all(competitorPromises);
                }

                // Get Site API status data for live status information
                let gameDataWithStatus = null;
                try {
                  console.log(`Fetching Site API status for Germany game ${eventData.id} from ${leagueCode}`);
                  const statusJson = await fetchJsonWithCache(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueCode}/summary?event=${eventData.id}`);
                  if (statusJson) {
                    gameDataWithStatus = statusJson;
                    console.log(`Successfully fetched Site API status for Germany game ${eventData.id} from ${leagueCode}:`, {
                      hasStatus: !!gameDataWithStatus?.header?.competitions?.[0]?.status,
                      statusState: gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state,
                      displayClock: gameDataWithStatus?.header?.competitions?.[0]?.status?.displayClock
                    });
                  }
                } catch (statusError) {
                  console.log(`Error fetching Site API status for Germany game ${eventData.id}:`, statusError.message);
                }

                // Fetch plays data for live games
                let playsData = null;
                const isLive = gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state === 'in';
                if (isLive) {
                  try {
                    console.log(`Fetching plays data for Germany game ${eventData.id}`);
                    const playsJson = await fetchJsonWithCache(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/events/${eventData.id}/competitions/${eventData.id}/plays?lang=en&region=us&limit=1000`);
                    if (playsJson?.items && playsJson.items.length > 0) {
                      playsData = [...playsJson.items].reverse();
                      console.log(`Got ${playsData.length} plays for Germany game ${eventData.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
                    }
                  } catch (playsError) {
                    console.log('Could not fetch Germany plays data:', playsError);
                  }
                }

                allGames.push({
                  ...eventData,
                  favoriteTeam: team,
                  sport: team.sport,
                  actualLeagueCode: leagueCode, // Store the actual league code for proper header display
                  gameDataWithStatus: gameDataWithStatus, // Add the status data
                  playsData: playsData // Add plays data for live games
                });
              }
            }
          }
        } catch (error) {
          console.error(`Error fetching from ${leagueCode}:`, error);
        }
      }

      return allGames.length > 0 ? allGames[0] : null; // Return first game found for now
    } catch (error) {
      console.error('Error fetching Germany team games:', error);
      return null;
    }
  };

  const fetchEnglandTeamGame = async (team) => {
    try {
      if (!team?.teamId) {
        console.log('Skipping England fetch: missing teamId for', team);
        return null;
      }
      console.log(`Fetching England games for team: ${team.displayName} (${team.teamId})`);
      // Check Premier League and associated domestic competitions
      const mainLeague = "eng.1";
      const competitions = [mainLeague, ...(LEAGUE_COMPETITIONS[mainLeague] || []).map(comp => comp.code)];
      const allGames = [];

      for (const leagueCode of competitions) {
        try {
          const eventsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/seasons/2025/teams/${team.teamId}/events?lang=en&region=us&limit=20`;
          console.log(`Fetching from ${leagueCode}:`, eventsUrl);
          const eventsData = await fetchJsonWithCache(eventsUrl);

          if (eventsData.items && eventsData.items.length > 0) {
            const { todayStart, todayEnd } = getTodayDateRange();
            console.log(`Found ${eventsData.items.length} events for ${leagueCode}, filtering for date range: ${todayStart.toISOString()} to ${todayEnd.toISOString()}`);

            for (const eventRef of eventsData.items) {
              const eventData = await getEventData(eventRef.$ref);
              if (!eventData || !eventData.date) {
                console.log(`Skipping null/invalid event data for ${eventRef.$ref}`);
                continue;
              }
              const eventDate = new Date(eventData.date);

              console.log(`Event ${eventData.id}: ${eventDate.toISOString()} (${eventDate >= todayStart && eventDate < todayEnd ? 'MATCHES' : 'FILTERED OUT'})`);

              if (eventDate >= todayStart && eventDate < todayEnd) {
                if (eventData.competitions?.[0]?.competitors) {
                  const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
                    const [teamData, scoreData] = await Promise.all([
                      competitor.team?.$ref ? fetchTeamMetadataWithCache(competitor.team.$ref).catch(() => null) : null,
                      competitor.score?.$ref ? fetchJsonWithCache(competitor.score.$ref).catch(() => null) : null
                    ]);
                    return { ...competitor, team: teamData || competitor.team, score: scoreData || competitor.score };
                  });
                  
                  eventData.competitions[0].competitors = await Promise.all(competitorPromises);
                }

                // Get Site API status data for live status information
                let gameDataWithStatus = null;
                try {
                  console.log(`Fetching Site API status for England game ${eventData.id} from ${leagueCode}`);
                  const statusResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueCode}/summary?event=${eventData.id}`);
                  if (statusResponse.ok) {
                    gameDataWithStatus = await statusResponse.json();
                    console.log(`Successfully fetched Site API status for England game ${eventData.id} from ${leagueCode}:`, {
                      hasStatus: !!gameDataWithStatus?.header?.competitions?.[0]?.status,
                      statusState: gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state,
                      displayClock: gameDataWithStatus?.header?.competitions?.[0]?.status?.displayClock
                    });
                  } else {
                    console.log(`Site API request failed for England game ${eventData.id} in ${leagueCode}:`, statusResponse.status);
                  }
                } catch (statusError) {
                  console.log(`Error fetching Site API status for England game ${eventData.id}:`, statusError.message);
                }

                // Fetch plays data for live games
                let playsData = null;
                const isLive = gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state === 'in';
                if (isLive) {
                  try {
                    console.log(`Fetching plays data for live England game ${eventData.id}`);
                    const playsResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/events/${eventData.id}/competitions/${eventData.id}/plays?lang=en&region=us&limit=1000`);
                    if (playsResponse.ok) {
                      const playsResponseData = await playsResponse.json();
                      if (playsResponseData.items && playsResponseData.items.length > 0) {
                        playsData = [...playsResponseData.items].reverse();
                        console.log(`Got ${playsData.length} plays for England game ${eventData.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
                      }
                    }
                  } catch (playsError) {
                    console.log('Could not fetch England plays data:', playsError);
                  }
                }

                allGames.push({
                  ...eventData,
                  favoriteTeam: team,
                  sport: team.sport,
                  actualLeagueCode: leagueCode, // Store the actual league code for proper header display
                  gameDataWithStatus: gameDataWithStatus, // Add the status data
                  playsData: playsData // Add plays data for live games
                });
              }
            }
          }
        } catch (error) {
          console.error(`Error fetching from ${leagueCode}:`, error);
        }
      }

      console.log(`England fetch complete for ${team.displayName}: found ${allGames.length} games`);
      if (allGames.length > 0) {
        console.log(`England games for ${team.displayName}:`, allGames.map(g => g.id));
      }
      return allGames.length > 0 ? allGames[0] : null; // Return first game found for now
    } catch (error) {
      console.error('Error fetching England team games:', error);
      return null;
    }
  };

  const fetchFranceTeamGame = async (team) => {
    try {
      if (!team?.teamId) {
        console.log('Skipping France fetch: missing teamId for', team);
        return null;
      }
      // Check Ligue 1 and associated domestic competitions
      const mainLeague = "fra.1";
      const competitions = [mainLeague, ...(LEAGUE_COMPETITIONS[mainLeague] || []).map(comp => comp.code)];
      const allGames = [];

      for (const leagueCode of competitions) {
        try {
          const eventsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/seasons/2025/teams/${team.teamId}/events?lang=en&region=us&limit=20`;
          const eventsData = await fetchJsonWithCache(eventsUrl);

          if (eventsData.items && eventsData.items.length > 0) {
            const { todayStart, todayEnd } = getTodayDateRange();

            for (const eventRef of eventsData.items) {
              const eventData = await getEventData(eventRef.$ref);
              const eventDate = new Date(eventData.date);

              if (eventDate >= todayStart && eventDate < todayEnd) {
                if (eventData.competitions?.[0]?.competitors) {
                  const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
                    const [teamData, scoreData] = await Promise.all([
                      competitor.team?.$ref ? fetchTeamMetadataWithCache(competitor.team.$ref).catch(() => null) : null,
                      competitor.score?.$ref ? fetchJsonWithCache(competitor.score.$ref).catch(() => null) : null
                    ]);
                    return { ...competitor, team: teamData || competitor.team, score: scoreData || competitor.score };
                  });
                  
                  eventData.competitions[0].competitors = await Promise.all(competitorPromises);
                }

                // Fetch Site API status for proper live game display
                let gameDataWithStatus = null;
                let playsData = null;
                try {
                  const statusUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueCode}/summary?event=${eventData.id}`;
                  const statusResponse = await fetch(statusUrl);
                  if (statusResponse.ok) {
                    gameDataWithStatus = await statusResponse.json();
                    console.log(`France ${leagueCode} - Successfully fetched Site API status for game ${eventData.id}:`, {
                      displayClock: gameDataWithStatus?.header?.competitions?.[0]?.status?.displayClock,
                      period: gameDataWithStatus?.header?.competitions?.[0]?.status?.period,
                      state: gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state
                    });

                    // Fetch plays data for live games if game is in progress
                    const gameState = gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state;
                    if (gameState === "in") {
                      try {
                        const playsUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueCode}/summary?event=${eventData.id}&enable=plays`;
                        const playsResponse = await fetch(playsUrl);
                        if (playsResponse.ok) {
                          playsData = await playsResponse.json();
                          console.log(`France ${leagueCode} - Successfully fetched plays data for live game ${eventData.id}`);
                        }
                      } catch (playsError) {
                        console.warn(`France ${leagueCode} - Could not fetch plays data for game ${eventData.id}:`, playsError);
                      }
                    }
                  } else {
                    console.warn(`France ${leagueCode} - Site API status fetch failed for game ${eventData.id}, status:`, statusResponse.status);
                  }
                } catch (statusError) {
                  console.warn(`France ${leagueCode} - Could not fetch Site API status for game ${eventData.id}:`, statusError);
                }

                allGames.push({
                  ...eventData,
                  favoriteTeam: team,
                  sport: team.sport,
                  actualLeagueCode: leagueCode, // Store the actual league code for proper header display
                  gameDataWithStatus,
                  playsData
                });
              }
            }
          }
        } catch (error) {
          console.error(`Error fetching from ${leagueCode}:`, error);
        }
      }

      return allGames.length > 0 ? allGames[0] : null; // Return first game found for now
    } catch (error) {
      console.error('Error fetching France team games:', error);
      return null;
    }
  };

  const fetchMLBTeamGame = async (team) => {
    try {
      const teamName = (team && (team.displayName || team.teamName)) || 'Unknown Team';
      if (!team?.teamId) {
        console.log('Skipping MLB fetch: missing teamId for', teamName);
        return null;
      }
      console.log(`Fetching MLB game for team: ${teamName} (ID: ${team.teamId})`);
      
      const { todayStart, todayEnd } = getTodayDateRange();
      
      // Fetch today's MLB games for this team
      const eventsUrl = `https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/seasons/2025/teams/${team.teamId}/events?lang=en&region=us&limit=20`;
      const eventsData = await fetchJsonWithCache(eventsUrl);

      if (eventsData.items && eventsData.items.length > 0) {
        for (const eventRef of eventsData.items) {
          const eventData = await getEventData(eventRef.$ref);
          const eventDate = new Date(eventData.date);

          if (eventDate >= todayStart && eventDate < todayEnd) {
            console.log(`Found today's MLB game for ${team.displayName}:`, eventData.id);
            
            // Fetch detailed game data using the game ID
            const gameDetailUrl = `https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events/${eventData.id}?lang=en&region=us`;
            const gameDetailData = await fetchJsonWithCache(gameDetailUrl);
            
            // Fetch live data from ESPN's live API (similar to GameDetailsScreen)
            let liveData = null;
            try {
              const liveUrl = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${eventData.id}`;
              liveData = await fetchJsonWithCache(liveUrl);
              console.log(`Successfully fetched live MLB data for game ${eventData.id}`);
            } catch (liveError) {
              console.warn(`Could not fetch live MLB data for game ${eventData.id}:`, liveError);
            }

            // Fetch plays data for live games
            let playsData = null;
            try {
              const gameStatus = liveData?.header?.competitions?.[0]?.status?.type?.state || gameDetailData.status?.type?.state;
              if (gameStatus === 'in') {
                const playsUrl = `https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events/${eventData.id}/competitions/${eventData.id}/plays?lang=en&region=us&limit=50`;
                const playsResponseData = await fetchJsonWithCache(playsUrl);
                if (playsResponseData.items && playsResponseData.items.length > 0) {
                  playsData = [...playsResponseData.items].reverse(); // Most recent first
                  console.log(`Fetched plays data for MLB game ${eventData.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
                }
              }
            } catch (playsError) {
              console.warn(`Could not fetch plays data for MLB game ${eventData.id}:`, playsError);
            }

            // Try to fetch venue from MLB API if available
            let mlbGameData = null;
            console.log(`Starting MLB API fetch for game ${eventData.id}`);
            try {
              // The eventData.id from ESPN should correspond to the MLB gamePk
              const mlbUrl = `https://statsapi.mlb.com/api/v1.1/game/${eventData.id}/feed/live`;
              console.log(`Attempting to fetch MLB data from: ${mlbUrl}`);
              const mlbData = await fetchJsonWithCache(mlbUrl);
              console.log('MLB API JSON parsed successfully');
              mlbGameData = mlbData.gameData; // Store gameData part like MLBService does
              // If statsapi provides play-by-play, map it to playsData for our UI (reverse to most-recent-first)
              try {
                const allPlays = mlbData.liveData?.plays?.allPlays;
                if (Array.isArray(allPlays) && allPlays.length > 0) {
                  playsData = [...allPlays].reverse();
                  console.log(`Mapped ${playsData.length} plays from statsapi to playsData for game ${eventData.id}`);
                }
              } catch (e) {
                // ignore
              }
              console.log(`Successfully fetched MLB game data for game ${eventData.id}. Venue:`, mlbGameData?.venue?.name);
              console.log('Full venue object:', mlbGameData?.venue);
              console.log('Complete mlbGameData:', JSON.stringify(mlbGameData, null, 2));
            } catch (mlbError) {
              console.error(`Error fetching MLB game data for game ${eventData.id}:`, mlbError);
            }
            console.log(`Finished MLB API fetch for game ${eventData.id}, mlbGameData:`, !!mlbGameData);

            return {
              ...gameDetailData,
              favoriteTeam: team,
              sport: 'MLB',
              actualLeagueCode: 'mlb',
              liveData,
              playsData,
              mlbGameData
            };
          }
        }
      }

      console.log(`No today's game found for ${team.displayName}`);
      return null;
    } catch (error) {
      console.error('Error fetching MLB team games:', error);
      return null;
    }
  };

  const handleGamePress = (game) => {
    // Use actualLeagueCode to determine navigation, fallback to game.sport
    const actualCompetition = game.actualLeagueCode;
    
    if (actualCompetition === 'uefa.champions' || game.sport === 'Champions League') {
      navigation.navigate('UCLGameDetails', {
        gameId: game.id,
        sport: 'Champions League',
      });
    } else if (actualCompetition === 'uefa.europa' || game.sport === 'Europa League') {
      navigation.navigate('UELGameDetails', {
        gameId: game.id,
        sport: 'Europa League',
      });
    } else if (actualCompetition === 'uefa.europa.conf' || game.sport === 'Europa Conference League') {
      navigation.navigate('UECLGameDetails', {
        gameId: game.id,
        sport: 'Europa Conference League',
      });
    } else if (actualCompetition === 'esp.1' || actualCompetition === 'esp.copa_del_rey' || game.sport === 'La Liga') {
      navigation.navigate('SpainGameDetails', {
        gameId: game.id,
        sport: 'La Liga',
      });
    } else if (actualCompetition === 'ita.1' || actualCompetition === 'ita.coppa_italia' || game.sport === 'Serie A') {
      navigation.navigate('ItalyGameDetails', {
        gameId: game.id,
        sport: 'Serie A',
      });
    } else if (actualCompetition === 'ger.1' || actualCompetition === 'ger.dfb_pokal' || game.sport === 'Bundesliga') {
      navigation.navigate('GermanyGameDetails', {
        gameId: game.id,
        sport: 'Bundesliga',
      });
    } else if (actualCompetition === 'eng.1' || actualCompetition === 'eng.fa' || actualCompetition === 'eng.league_cup' || game.sport === 'Premier League') {
      navigation.navigate('EnglandGameDetails', {
        gameId: game.id,
        sport: 'Premier League',
      });
    } else if (actualCompetition === 'fra.1' || actualCompetition === 'fra.coupe_de_france' || game.sport === 'Ligue 1') {
      navigation.navigate('FranceGameDetails', {
        gameId: game.id,
        sport: 'Ligue 1',
      });
    } else if (actualCompetition === 'mlb' || game.sport === 'MLB') {
      // App stack registers a generic 'GameDetails' route that multiplexes by sport.
      // Navigate there and pass sport param so the correct detail screen is used.
      navigation.navigate('GameDetails', {
        gameId: game.id,
        sport: 'mlb',
      });
    }
  };

  // Helper function to get game status for display
  const getGameStatus = (game) => {
    const competition = game.competitions?.[0];
    const status = competition?.status || game.status;
    const statusType = status?.type?.state;
    
    const gameDate = new Date(game.date);
    const now = new Date();
    
    let isLive = false;
    let isPre = false;
    let isPost = false;
    let text = '';
    let time = '';
    let detail = '';
    
    // If MLB data exists, prefer its codedGameState (mlbGameData or liveData)
    const mlbCoded = game.mlbGameData?.status?.codedGameState || game.liveData?.status?.codedGameState;
      if (mlbCoded) {
      if (mlbCoded === 'I' || mlbCoded === 'M') {
        isLive = true;
        text = 'Live';
      } else if (mlbCoded === 'F' || mlbCoded === 'O' || mlbCoded === 'D') {
        isPost = true;
        text = 'Final';
        // For final games prefer to show the original scheduled start time/date instead of 'TBD'
        time = gameDate ? gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
      } else {
        isPre = true;
        text = 'Scheduled';
        time = gameDate ? gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
        detail = gameDate ? gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      }
      return {
        isLive,
        isPre,
        isPost,
        text,
        time,
        detail
      };
    }

    if (mlbCoded === 'I' || mlbCoded === 'M') {
      isLive = true;
      text = 'Live';
    } else if (mlbCoded === 'P' || mlbCoded === 'S' || mlbCoded === 'W') {
      isPre = true;
      text = 'Scheduled';
      time = gameDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      detail = gameDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    } else if (mlbCoded === 'F' || mlbCoded === 'O' || mlbCoded === 'D') {
      isPost = true;
      text = 'Final';
      detail = gameDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    } else {
      // Fallback logic
      const threeHoursAgo = new Date(now.getTime() - (3 * 60 * 60 * 1000));
      if (gameDate < threeHoursAgo) {
        isPost = true;
        text = 'Final';
      } else if (gameDate <= now) {
        isLive = true;
        text = 'Live';
      } else {
        isPre = true;
        text = 'Scheduled';
        time = gameDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
      }
      detail = gameDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    }
    
    return {
      isLive,
      isPre,
      isPost,
      text,
      time,
      detail
    };
  };

  // Component-scoped helper: Robust extraction of the most recent play for MLB and ESPN shapes
  // Accept homeTeam and awayTeam so the helper doesn't rely on outer-scope variables
  const extractMostRecentPlay = (game, homeTeam = null, awayTeam = null) => {
    try {
      // Helper to build a human-friendly play text from an MLB playEvent
      const buildMLBPlayTextFromEvent = (ev, playObj) => {
        try {
          if (!ev || !ev.details) return null;
          const details = ev.details || {};
          const desc = details.description || '';

          // Batter and pitcher names - prefer matchup in the parent play object
          const batter = (playObj?.matchup?.batter?.fullName) || (ev.player && ev.player.fullName) || (ev.player && ev.player?.player && ev.player.player.fullName) || '';
          const pitcher = (playObj?.matchup?.pitcher?.fullName) || '';

          // Pitch/swing info
          const speed = ev.pitchData?.startSpeed || ev.pitchData?.speed || playObj?.pitchData?.startSpeed || null;
          const pitchType = details.type?.description || details.type || '';

          const balls = ev.count?.balls ?? playObj?.count?.balls ?? '';
          const strikes = ev.count?.strikes ?? playObj?.count?.strikes ?? '';

          const callCode = (details.call && details.call.code) ? String(details.call.code).toUpperCase() : null;

          // Format according to the c2.txt rules
          if (callCode === 'F') {
            // Foul
            const speedText = speed ? `${Math.round(speed)} mph ` : '';
            return `${batter} fouls off ${speedText}${pitchType} from ${pitcher}. Strike ${strikes}`.trim();
          }

          if (callCode === 'B') {
            // Ball
            const speedText = speed ? `${Math.round(speed)} mph ` : '';
            return `${pitcher || 'Pitcher'} throws ${speedText}${pitchType} outside to ${batter}. Ball ${balls}`.trim();
          }

          if (callCode === '*B') {
            // Hit by pitch
            return `${pitcher} throws the ball in dirt. Ball ${balls}`.trim();
          }

          if (callCode === 'W') {
            // Wild pitch
            return `${pitcher} throws a wild pitch. Ball ${balls}`.trim();
          }

          if (callCode === 'H') {
            // Hit (non-specific)
            return `${batter} ${desc}`.trim();
          }

          if (callCode === 'C') {
            // Called strike
            return `${batter} takes strike ${strikes} looking from ${pitcher}`.trim();
          }

          if (callCode === 'S') {
            // Swinging strike
            const speedText = speed ? `${Math.round(speed)} mph ` : '';
            return `${batter} swings at ${speedText}${pitchType} from ${pitcher}. Strike ${strikes}`.trim();
          }

          // D or X (hit / play result) - fallback to description
          if (callCode === 'D' || callCode === 'X') {
            return `${batter} ${desc}`.trim();
          }

          // If no call code or unknown, prefer details.description but try to enrich with batter/pitcher
          if (desc) {
            // If description already contains batter name, return as-is
            if (batter && desc.includes(batter)) return desc;
            if (batter) return `${desc}`.trim();
            return desc;
          }

          return null;
        } catch (e) {
          return null;
        }
      };

      // Small helper: return trimmed non-empty string or null
      const nonEmpty = (v) => {
        try {
          if (v === null || v === undefined) return null;
          const s = String(v).trim();
          return s.length > 0 ? s : null;
        } catch (e) {
          return null;
        }
      };

      // Determine whether this game is an MLB game (MLB parsing should only run for MLB)
      const isMLB = String(game.sport || game.actualLeagueCode || '').toLowerCase().includes('mlb') || Boolean(game.mlbGameData);

      // 1) If we have MLB statsapi liveData with plays.allPlays, prefer that (only for MLB)
      const mlbAllPlays = (isMLB && (game.liveData?.plays?.allPlays || game.liveData?.allPlays || game.mlbGameData?.liveData?.plays?.allPlays || game.liveData?.allPlays)) || null;
      if (isMLB && mlbAllPlays && Array.isArray(mlbAllPlays) && mlbAllPlays.length > 0) {
        const last = mlbAllPlays[mlbAllPlays.length - 1];
        const currentPlayObj = game.liveData?.plays?.currentPlay || null;
        
        try {
          console.log(`FavoritesScreen detected statsapi allPlays for game ${game.id}, last play summary:`, {
            about: last.about || null,
            resultKeys: last.result ? Object.keys(last.result).slice(0,6) : null,
            rawKeys: Object.keys(last).slice(0,8)
          });
        } catch (e) {}

        let playText = '';
        try {
          // Priority order for MLB:
          // 1. currentPlay raw result description
          if (nonEmpty(currentPlayObj?.result?.description)) {
            playText = String(currentPlayObj.result.description).trim();
            console.log(`MLB play text from currentPlay result description: ${playText}`);
          }
          // 2. lastPlay raw result description  
          else if (nonEmpty(last?.result?.description)) {
            playText = String(last.result.description).trim();
            console.log(`MLB play text from lastPlay result description: ${playText}`);
          }
          // 3. current play play text (about.playText or about.description)
          else if (nonEmpty(currentPlayObj?.about?.playText) || nonEmpty(currentPlayObj?.about?.description)) {
            playText = String(nonEmpty(currentPlayObj.about?.playText) || nonEmpty(currentPlayObj.about?.description)).trim();
            console.log(`MLB play text from currentPlay playText: ${playText}`);
          }
          // 3b. lastPlay play text (about.playText or about.description) 
          else if (nonEmpty(last?.about?.playText) || nonEmpty(last?.about?.description)) {
            playText = String(nonEmpty(last.about?.playText) || nonEmpty(last.about?.description)).trim();
            console.log(`MLB play text from lastPlay playText: ${playText}`);
          }
          // 4. Try to extract from playEvents with built logic
          else if (Array.isArray(last.playEvents) && last.playEvents.length > 0) {
            const filtered = last.playEvents
              .filter(ev => ev && ev.details)
              .filter(ev => {
                const evType = String(ev.details.eventType || ev.type || '').toLowerCase();
                return !(evType.includes('game_advisory') || (ev.details && String(ev.details.description || '').toLowerCase().includes('status change')));
              });

            if (filtered.length > 0) {
              const lastEv = filtered[filtered.length - 1];
              const built = buildMLBPlayTextFromEvent(lastEv, last);
              if (built) {
                playText = built;
                console.log(`MLB play text from buildMLBPlayTextFromEvent: ${playText}`);
              }
              else if (lastEv.details && lastEv.details.description) {
                playText = String(lastEv.details.description).trim();
                console.log(`MLB play text from lastEvent description: ${playText}`);
              }
            }
          }
          // 5. matchup text (only if no other play information found)
          else {
            const batterName = last.matchup?.batter?.fullName || currentPlayObj?.matchup?.batter?.fullName || '';
            const pitcherName = last.matchup?.pitcher?.fullName || currentPlayObj?.matchup?.pitcher?.fullName || '';
            if (batterName || pitcherName) {
              playText = `Matchup: ${batterName}${batterName && pitcherName ? ' vs ' : ''}${pitcherName}`.trim();
              console.log(`MLB play text from matchup (fallback): ${playText}`);
            }
          }

          // Final fallback to any remaining fields
          if (!nonEmpty(playText)) {
            playText = nonEmpty(last.playDescription) || nonEmpty(last.playText) || nonEmpty(last.result?.event) || '';
            if (playText) console.log(`MLB play text from final fallback: ${playText}`);
          }
        } catch (e) {
          playText = last.result?.description || last.about?.playText || '';
        }

        let inferredTeamId = null;
        let inferredIsHome = null;
        try {
          const half = (last.about && (last.about.halfInning || last.about.half)) || last.about?.inningState || null;
          if (half) {
            if (String(half).toLowerCase().startsWith('t') || String(half).toLowerCase().includes('top')) {
              inferredIsHome = false;
              inferredTeamId = awayTeam?.team?.id || awayTeam?.id || (awayTeam?.team && awayTeam.team.id) || null;
            } else if (String(half).toLowerCase().startsWith('b') || String(half).toLowerCase().includes('bot') || String(half).toLowerCase().includes('bottom')) {
              inferredIsHome = true;
              inferredTeamId = homeTeam?.team?.id || homeTeam?.id || (homeTeam?.team && homeTeam.team.id) || null;
            }
          }
        } catch (e) {}

        const matchupBatHome = last.matchup?.batHomeId || null;
        const matchupBatAway = last.matchup?.batAwayId || null;
        const teamField = last.team || (inferredTeamId ? { id: inferredTeamId } : (matchupBatHome ? { id: matchupBatHome } : (matchupBatAway ? { id: matchupBatAway } : null)));

        return {
          text: playText || '',
          shortText: last.result?.brief || last.result?.eventType || last.result?.event || '',
          team: teamField,
          inferredIsHome,
          inferredTeamId,
          halfInning: last.about?.halfInning || last.about?.half || last.about?.inningState || null,
          raw: last
        };
      }

      // 2) If we have a playsData array (could be ESPN items or MLB statsapi allPlays reversed)
      if (game.playsData && Array.isArray(game.playsData) && game.playsData.length > 0) {
        const mostRecent = game.playsData[0];
        let mlbText = '';
        if (isMLB) {
          const currentPlayObj = game.liveData?.plays?.currentPlay || null;
          
          try {
            // Priority order for MLB:
            // 1. currentPlay raw result description
            if (nonEmpty(currentPlayObj?.result?.description)) {
              mlbText = String(currentPlayObj.result.description).trim();
              console.log(`MLB play text (playsData) from currentPlay result description: ${mlbText}`);
            }
            // 2. lastPlay raw result description  
            else if (nonEmpty(mostRecent?.result?.description)) {
              mlbText = String(mostRecent.result.description).trim();
              console.log(`MLB play text (playsData) from lastPlay result description: ${mlbText}`);
            }
            // 3. current play play text (about.playText or about.description)
            else if (nonEmpty(currentPlayObj?.about?.playText) || nonEmpty(currentPlayObj?.about?.description)) {
              mlbText = String(nonEmpty(currentPlayObj.about?.playText) || nonEmpty(currentPlayObj.about?.description)).trim();
              console.log(`MLB play text (playsData) from currentPlay playText: ${mlbText}`);
            }
            // 3b. lastPlay play text (about.playText or about.description)
            else if (nonEmpty(mostRecent?.about?.playText) || nonEmpty(mostRecent?.about?.description)) {
              mlbText = String(nonEmpty(mostRecent.about?.playText) || nonEmpty(mostRecent.about?.description)).trim();
              console.log(`MLB play text (playsData) from lastPlay playText: ${mlbText}`);
            }
            // 4. Try to extract from playEvents with built logic
            else if (Array.isArray(mostRecent?.playEvents) && mostRecent.playEvents.length > 0) {
              const filtered = mostRecent.playEvents
                .filter(ev => ev && ev.details)
                .filter(ev => {
                  const evType = String(ev.details.eventType || ev.type || '').toLowerCase();
                  return !(evType.includes('game_advisory') || (ev.details && String(ev.details.description || '').toLowerCase().includes('status change')));
                });

              if (filtered.length > 0) {
                const lastEv = filtered[filtered.length - 1];
                const built = buildMLBPlayTextFromEvent(lastEv, mostRecent);
                if (built) {
                  mlbText = built;
                  console.log(`MLB play text (playsData) from buildMLBPlayTextFromEvent: ${mlbText}`);
                }
                else if (lastEv.details && lastEv.details.description) {
                  mlbText = String(lastEv.details.description).trim();
                  console.log(`MLB play text (playsData) from lastEvent description: ${mlbText}`);
                }
              }
            }
            // 5. matchup text (only if no other play information found)
            else {
              const batterName = mostRecent?.matchup?.batter?.fullName || currentPlayObj?.matchup?.batter?.fullName || '';
              const pitcherName = mostRecent?.matchup?.pitcher?.fullName || currentPlayObj?.matchup?.pitcher?.fullName || '';
              if (batterName || pitcherName) {
                mlbText = `Matchup: ${batterName}${batterName && pitcherName ? ' vs ' : ''}${pitcherName}`.trim();
                console.log(`MLB play text (playsData) from matchup (fallback): ${mlbText}`);
              }
            }

            // Final fallback to any remaining fields
            if (!nonEmpty(mlbText)) {
              mlbText = nonEmpty(mostRecent?.playDescription) || nonEmpty(mostRecent?.playText) || nonEmpty(mostRecent?.result?.event) || nonEmpty(mostRecent?.result?.eventType) || '';
              if (mlbText) console.log(`MLB play text (playsData) from final fallback: ${mlbText}`);
            }
          } catch (e) { mlbText = ''; }
        }

        const mlbShort = mostRecent?.result?.brief || mostRecent?.result?.eventType || mostRecent?.result?.event || mostRecent?.about?.period?.displayValue;
        const mlbTeam = (mostRecent?.team && (mostRecent.team.id || mostRecent.team.teamId)) || null;
        const matchupBatHome = mostRecent?.matchup?.batHomeId;
        const matchupBatAway = mostRecent?.matchup?.batAwayId;

        if (mlbText) {
          let inferredTeamId2 = null;
          let inferredIsHome2 = null;
          try {
            const half2 = (mostRecent.about && (mostRecent.about.halfInning || mostRecent.about.half)) || mostRecent.about?.inningState || null;
            if (half2) {
              if (String(half2).toLowerCase().startsWith('t') || String(half2).toLowerCase().includes('top')) {
                inferredIsHome2 = false;
                inferredTeamId2 = awayTeam?.team?.id || awayTeam?.id || (awayTeam?.team && awayTeam.team.id) || null;
              } else if (String(half2).toLowerCase().startsWith('b') || String(half2).toLowerCase().includes('bot') || String(half2).toLowerCase().includes('bottom')) {
                inferredIsHome2 = true;
                inferredTeamId2 = homeTeam?.team?.id || homeTeam?.id || (homeTeam?.team && homeTeam.team.id) || null;
              }
            }
          } catch (e) {}

          return {
            text: mlbText,
            shortText: mlbShort || mlbText,
            team: mlbTeam || (matchupBatHome ? { id: matchupBatHome } : (matchupBatAway ? { id: matchupBatAway } : null)),
            inferredIsHome: inferredIsHome2,
            inferredTeamId: inferredTeamId2,
            halfInning: mostRecent?.about?.halfInning || mostRecent?.about?.half || mostRecent?.about?.inningState || null,
            raw: mostRecent
          };
        }

        // Fallback to ESPN-like field names (used for soccer and other sports)
        return {
          text: mostRecent.text || mostRecent.shortText || mostRecent.type?.text || '',
          shortText: mostRecent.shortText || mostRecent.text || '',
          team: mostRecent.team || mostRecent.by || mostRecent.actor || null,
          raw: mostRecent
        };
      }

      // 3) Some endpoints return an object with items (espn core) under plays.items
      if (game.plays && Array.isArray(game.plays)) {
        const first = game.plays[0];
        return { text: first.text || first.shortText || '', shortText: first.shortText || first.text || '', team: first.team || null, raw: first };
      }

      return null;
    } catch (err) {
      console.log('Error extracting most recent play:', err?.message || err);
      return null;
    }
  };

  const renderMLBGameCard = (game) => {
    if (!game?.competitions?.[0]) return null;

    const competition = game.competitions[0];
    const awayTeam = competition.competitors.find(team => team.homeAway === 'away');
    const homeTeam = competition.competitors.find(team => team.homeAway === 'home');
    
    if (!awayTeam || !homeTeam) return null;

    const getMLBTeamAbbreviation = (espnTeam) => {
      // ESPN team ID to abbreviation mapping
      const teamMapping = {
        '108': 'LAA', '117': 'HOU', '133': 'ATH', '141': 'TOR', '144': 'ATL',
        '158': 'MIL', '138': 'STL', '112': 'CHC', '109': 'ARI', '119': 'LAD',
        '137': 'SF', '114': 'CLE', '136': 'SEA', '146': 'MIA', '121': 'NYM',
        '120': 'WSH', '110': 'BAL', '135': 'SD', '143': 'PHI', '134': 'PIT',
        '140': 'TEX', '139': 'TB', '111': 'BOS', '113': 'CIN', '115': 'COL',
        '118': 'KC', '116': 'DET', '142': 'MIN', '145': 'CWS', '147': 'NYY',
        '11': 'ATH',   // Sometimes Athletics use ESPN ID 11
      };

      // First try direct abbreviation if available
      if (espnTeam?.team?.abbreviation || espnTeam?.abbreviation) {
        return espnTeam.team?.abbreviation || espnTeam.abbreviation;
      }
      
      // Then try ID mapping
      const teamId = espnTeam?.team?.id || espnTeam?.id;
      const abbr = teamMapping[teamId?.toString()];
      if (abbr) {
        return abbr;
      }
      
      return espnTeam?.team?.shortDisplayName || espnTeam?.shortDisplayName || 'MLB';
    };

    // Helper function to get MLB team ID for favorites system (same as ScoreboardScreen)
    const getMLBTeamId = (espnTeam) => {
      // ESPN team ID to MLB team ID mapping (same as in scoreboard)
      const espnToMLBMapping = {
        '108': '108', '117': '117', '133': '133', '141': '141', '144': '144',
        '158': '158', '138': '138', '112': '112', '109': '109', '119': '119',
        '137': '137', '114': '114', '136': '136', '146': '146', '121': '121',
        '120': '120', '110': '110', '135': '135', '143': '143', '134': '134',
        '140': '140', '139': '139', '111': '111', '113': '113', '115': '115',
        '118': '118', '116': '116', '142': '142', '145': '145', '147': '147',
        '11': '133',   // Sometimes Athletics use ESPN ID 11, map to 133
      };

      return espnToMLBMapping[espnTeam?.team?.id?.toString() || espnTeam?.id?.toString()] || espnTeam?.team?.id?.toString() || espnTeam?.id?.toString();
    };

    const gameStatus = getGameStatus(game);
    
    // Log comprehensive status information for MLB games (only once per status change)
    const mlbCodedState = game.mlbGameData?.status?.codedGameState || game.liveData?.status?.codedGameState;
    const mlbLogKey = `${game.id}-MLB-${gameStatus.isLive}-${gameStatus.isPre}-${gameStatus.isPost}-${mlbCodedState}`;
    if (!loggedGames.has(mlbLogKey)) {
      console.log(`Game ${game.id} (MLB) Status - Live: ${gameStatus.isLive}, Scheduled: ${gameStatus.isPre}, Finished: ${gameStatus.isPost} (MLB coded: ${mlbCodedState || 'null'})`);
      loggedGames.add(mlbLogKey);
      
      // Determine if this game should receive updates and track it
      const shouldUpdate = shouldGameReceiveUpdates(game, gameStatus, 'MLB');
      if (shouldUpdate) {
        gamesToUpdate.add(game.id);
      } else {
        gamesToUpdate.delete(game.id);
      }
    }
    
    const liveData = game.liveData || {};
    const gameId = game.id;

    // Parse scores and determine winner/loser for MLB finished games
    const parseScoreValue = (s) => {
      if (s === null || s === undefined) return '0';
      if (typeof s === 'object') return s.displayValue || s.value || '0';
      return String(s);
    };

    const awayScoreDisplay = parseScoreValue(awayTeam.score);
    const homeScoreDisplay = parseScoreValue(homeTeam.score);
    const awayScoreNum = parseInt(awayScoreDisplay, 10) || 0;
    const homeScoreNum = parseInt(homeScoreDisplay, 10) || 0;

    const isPost = gameStatus.isPost;
    let homeIsWinner = false;
    let awayIsWinner = false;
    let isDraw = false;

    if (isPost) {
      if (homeScoreNum > awayScoreNum) homeIsWinner = true;
      else if (awayScoreNum > homeScoreNum) awayIsWinner = true;
      else isDraw = true;
    }

    const homeIsLoser = isPost && !isDraw && !homeIsWinner;
    const awayIsLoser = isPost && !isDraw && !awayIsWinner;

    const middleContent = () => {
      if (gameStatus.isLive && liveData.status) {
        // Live game - show inning, balls/strikes, bases, outs
        const status = liveData.status;
        const situation = liveData.situation || {};
        
        const inningText = `${situation.isTopInning ? 'Top' : 'Bot'} ${situation.inning || 1}`;
        const ballsStrikesText = `B: ${situation.balls || 0} S: ${situation.strikes || 0}`;
        const outsText = `Outs: ${situation.outs || 0}`;
        
        // Mini bases display
        const basesDisplay = () => (
          <View style={styles.miniBasesContainer}>
            <View style={[
              styles.miniBase, 
              { backgroundColor: situation.bases?.second ? colors.primary : 'transparent' }
            ]} />
            <View style={styles.miniBasesRow}>
              <View style={[
                styles.miniBase, 
                { backgroundColor: situation.bases?.third ? colors.primary : 'transparent' }
              ]} />
              <View style={[
                styles.miniBase, 
                { backgroundColor: situation.bases?.first ? colors.primary : 'transparent' }
              ]} />
            </View>
          </View>
        );
        
        return (
          <View style={styles.liveGameMiddleSection}>
            <Text style={[styles.liveInningText, { color: colors.text }]}>{inningText}</Text>
            <Text style={[styles.liveCountText, { color: colors.text }]}>{ballsStrikesText}</Text>
            {basesDisplay()}
            <Text style={[styles.liveOutsText, { color: colors.text }]}>{outsText}</Text>
          </View>
        );
      } else if (gameStatus.isPre) {
        // Scheduled game - show date and time
        return (
          <View style={styles.gameMiddleSection}>
            <Text style={[styles.gameStatusText, { color: colors.text }]}>
              {gameStatus.text}
            </Text>
            <Text style={[styles.gameTimeText, { color: colors.text }]}>
              {gameStatus.time}
            </Text>
            <Text style={[styles.gameDateText, { color: colors.text }]}>
              {gameStatus.detail}
            </Text>
          </View>
        );
      } else {
        // Finished game - show final score and status
        return (
          <View style={styles.gameMiddleSection}>
            <Text style={[styles.gameStatusText, { color: colors.text }]}>
              {gameStatus.text}
            </Text>
            {gameStatus.detail && (
              <Text style={[styles.gameDetailText, { color: colors.text }]}>
                {gameStatus.detail}
              </Text>
            )}
          </View>
        );
      }
    };



  const currentPlay = extractMostRecentPlay(game, homeTeam, awayTeam);
    let playText = '';
    let playBorderStyle = {};
    if (currentPlay) {
      playText = currentPlay.text || currentPlay.shortText || '';

      // Normalize team id extraction for various shapes
      const extractTeamIdFromPlay = (p) => {
        if (!p || !p.team) return null;
        const t = p.team;
        if (typeof t === 'string') {
          const m = t.match(/teams\/(\d+)/);
          if (m) return m[1];
          return t;
        }
        if (t.id) return String(t.id);
        if (t.teamId) return String(t.teamId);
        if (t._id) return String(t._id);
        if (t.$$ref) {
          const m = String(t.$$ref).match(/teams\/(\d+)/);
          if (m) return m[1];
        }
        return null;
      };

      const playTeamId = extractTeamIdFromPlay(currentPlay.raw || currentPlay.team || currentPlay);
      const homeId = homeTeam?.team?.id || homeTeam?.id || (homeTeam?.team && homeTeam.team.id);
      // If playTeamId is missing, prefer the inferredIsHome flag from the MLB allPlays extractor
      const isHomeTeamPlay = (playTeamId ? String(playTeamId) === String(homeId) : (typeof currentPlay.inferredIsHome === 'boolean' ? currentPlay.inferredIsHome : null));

      // Resolve colors using MLBService when possible, fallback to team object color fields
      let awayColor = (awayTeam?.team?.color || awayTeam?.color || awayTeam?.team?.alternateColor || colors.primary);
      let homeColor = (homeTeam?.team?.color || homeTeam?.color || homeTeam?.team?.alternateColor || colors.primary);
      try {
        const awayName = awayTeam?.team?.name || awayTeam?.team?.displayName || awayTeam?.name;
        const homeName = homeTeam?.team?.name || homeTeam?.team?.displayName || homeTeam?.name;
        const mlbAway = MLBService.getTeamColor(awayName);
        const mlbHome = MLBService.getTeamColor(homeName);
        if (mlbAway) awayColor = mlbAway;
        if (mlbHome) homeColor = mlbHome;
      } catch (e) {
        // ignore
      }

      // If we can't determine which team made the play, show neutral thin borders
      if (typeof isHomeTeamPlay !== 'boolean') {
        playBorderStyle = {
          borderLeftColor: theme?.border || '#333333',
          borderRightColor: theme?.border || '#333333',
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderTopWidth: 1,
          borderBottomWidth: 1,
        };
      } else {
        // Ensure color has # prefix
        const formattedAway = awayColor && awayColor.startsWith('#') ? awayColor : `#${String(awayColor).replace(/^#/, '')}`;
        const formattedHome = homeColor && homeColor.startsWith('#') ? homeColor : `#${String(homeColor).replace(/^#/, '')}`;

        playBorderStyle = {
          borderLeftColor: isHomeTeamPlay ? (theme?.border || '#333333') : (formattedAway || colors.primary),
          borderRightColor: isHomeTeamPlay ? (formattedHome || colors.primary) : (theme?.border || '#333333'),
          borderLeftWidth: isHomeTeamPlay ? 0 : 8,
          borderRightWidth: isHomeTeamPlay ? 8 : 0,
          borderTopWidth: 1,
          borderBottomWidth: 1,
        };
      }

      // Debug: log the extracted play text, team, and chosen color for border
      try {
        const resolvedTeam = isHomeTeamPlay ? (homeTeam?.team?.displayName || homeTeam?.team?.name || homeTeam?.team?.abbreviation || homeTeam?.team?.id) : (awayTeam?.team?.displayName || awayTeam?.team?.name || awayTeam?.team?.abbreviation || awayTeam?.team?.id);
        const resolvedColor = isHomeTeamPlay ? (homeTeam?.team?.color || homeTeam?.color || colors.primary) : (awayTeam?.team?.color || awayTeam?.color || colors.primary);
        console.log(`FavoritesScreen MLB play extracted -> game:${game.id}, playText:"${playText}", playTeamId:${playTeamId}, resolvedTeam:${resolvedTeam}, isHome:${isHomeTeamPlay}, teamColor:${resolvedColor}`);

        // If playText or playTeamId are missing, log raw shape and candidate fields for debugging
        if (!playText || !playTeamId) {
          try {
            const raw = currentPlay.raw || currentPlay;
            console.log(`FavoritesScreen MLB raw mostRecent play for game ${game.id}:`, {
              keys: Object.keys(raw || {}).slice(0,12),
              result_sample: raw?.result ? {
                keys: Object.keys(raw.result).slice(0,8),
                description: raw.result.description || raw.result.event || null
              } : null,
              about_sample: raw?.about ? { keys: Object.keys(raw.about).slice(0,8), playText: raw.about.playText || raw.about.description || null } : null,
              matchup_sample: raw?.matchup ? { keys: Object.keys(raw.matchup).slice(0,8), batHomeId: raw.matchup.batHomeId, batAwayId: raw.matchup.batAwayId } : null,
              team_field: raw?.team || raw?.offense || raw?.defense || null
            });
          } catch (e2) {
            console.log('Error logging raw play object:', e2?.message || e2);
          }
        }
      } catch (e) {
        console.log('FavoritesScreen MLB play debug log error:', e?.message || e);
      }
    }

    return (
      <TouchableOpacity
        style={[
          styles.gameCard,
          { backgroundColor: theme.surface, borderColor: theme.border },
          gameStatus.isLive ? playBorderStyle : {}
        ]}
        onPress={() => handleGamePress(game)}
        activeOpacity={0.7}
      >
        {/* League Header */}
        <View style={[styles.leagueHeader, { backgroundColor: theme.surfaceSecondary }]}>
          <Text style={[styles.leagueText, { color: colors.primary }]}>
            MLB
          </Text>
        </View>
        
        {/* Main Match Content - EXACT same structure as soccer */}
        <View style={[styles.matchContent, { paddingVertical: gameStatus.isLive ? -5 : 8 }]}>
          {/* Away Team (Left Side) */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoRow}>
                  <Image 
                    source={{ 
                      uri: getTeamLogoUrl('mlb', getMLBTeamAbbreviation(awayTeam)) || 
                           'https://via.placeholder.com/40x40?text=MLB' 
                    }} 
                    style={[styles.teamLogo, awayIsLoser && styles.losingTeamLogo]}
                    defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
                  />
                  {!gameStatus.isPre && (
                    <View style={styles.scoreContainer}>
                      <View style={styles.scoreRow}>
                        <Text style={[styles.teamScore, { color: gameStatus.isPost ? (awayIsWinner ? colors.primary : (awayIsLoser ? '#999' : theme.text)) : theme.text }]}>
                          {awayScoreDisplay}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
            <Text style={[styles.teamAbbreviation, { 
              color: awayIsLoser ? '#999' : (isFavorite(getMLBTeamId(awayTeam)) ? colors.primary : theme.text) 
            }]}>
              {isFavorite(getMLBTeamId(awayTeam)) ? '★ ' : ''}{getMLBTeamAbbreviation(awayTeam)}
            </Text>
          </View>
          
          {/* Status Section (Center) */}
          <View style={styles.statusSection}>
            <Text style={[styles.gameStatus, { color: gameStatus.isLive ? '#ff4444' : colors.primary , marginBottom: gameStatus.isLive ? -7.5 : 4}]}>
              {gameStatus.isLive ? '' : gameStatus.text}
            </Text>
            {gameStatus.isLive && liveData.situation ? (
              // Live MLB game - show inning, balls/strikes, bases, outs
              <>
                <Text style={[styles.gameDateTime, { color: theme.text }]}>
                  {`${liveData.situation.isTopInning ? 'Top' : 'Bot'} ${liveData.situation.inning || 1}`}
                </Text>
                {/* Mini bases display */}
                <View style={styles.miniBasesContainer}>
                  <View style={[
                    styles.miniBase, 
                    { backgroundColor: liveData.situation.bases?.second ? colors.primary : 'transparent' }
                  ]} />
                  <View style={styles.miniBasesRow}>
                    <View style={[
                      styles.miniBase, 
                      { backgroundColor: liveData.situation.bases?.third ? colors.primary : 'transparent' }
                    ]} />
                    <View style={[
                      styles.miniBase, 
                      { backgroundColor: liveData.situation.bases?.first ? colors.primary : 'transparent' }
                    ]} />
                  </View>
                </View>
                <Text style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                  {`Outs: ${liveData.situation.outs || 0}`}
                </Text>
              </>
            ) : gameStatus.isLive ? (
              // Live game but no detailed situation data
              <>
                <Text style={[styles.gameDateTime, { color: theme.text }]}>
                  {gameStatus.time || 'Live'}
                </Text>
                <Text style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                  {gameStatus.detail || 'In Progress'}
                </Text>
              </>
            ) : (
              // Scheduled or finished games
              <>
                <Text style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                  {gameStatus.detail}
                </Text>
                {gameStatus.time && (
                  <Text style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                    {gameStatus.time} EST
                  </Text>
                )}
              </>
            )}
          </View>
          
          {/* Home Team (Right Side) */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoRow}>
              {!gameStatus.isPre && (
                <View style={styles.scoreContainer}>
                  <View style={styles.scoreRow}>
                    <Text style={[styles.teamScore, { color: gameStatus.isPost ? (homeIsWinner ? colors.primary : (homeIsLoser ? '#999' : theme.text)) : theme.text }]}>
                      {homeScoreDisplay}
                    </Text>
                  </View>
                </View>
              )}
              <Image 
                source={{ 
                  uri: getTeamLogoUrl('mlb', getMLBTeamAbbreviation(homeTeam)) || 
                       'https://via.placeholder.com/40x40?text=MLB' 
                }} 
                style={[styles.teamLogo, homeIsLoser && styles.losingTeamLogo]}
                defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
              />
            </View>
            <Text style={[styles.teamAbbreviation, { 
              color: homeIsLoser ? '#999' : (isFavorite(getMLBTeamId(homeTeam)) ? colors.primary : theme.text) 
            }]}>
              {isFavorite(getMLBTeamId(homeTeam)) ? '★ ' : ''}{getMLBTeamAbbreviation(homeTeam)}
            </Text>
          </View>
        </View>
        
        {/* Venue Section */}
        <View style={styles.venueSection}>
          {gameStatus.isLive ? (
            // Show most recent play text for live MLB games with colored side border
            (() => {
              // Prefer result.description first, then playText from playEvents, then other fallbacks
              const candidate = (currentPlay?.raw?.result?.description && String(currentPlay.raw.result.description).trim()) ? 
                currentPlay.raw.result.description : 
                ((playText && String(playText).trim()) ? playText : (currentPlay?.raw?.about?.playText || currentPlay?.shortText || null));
              if (candidate) {
                return (
                  <Text style={[styles.livePlayText, { color: theme.text }]} numberOfLines={2}>{candidate}</Text>
                );
              }

              return <Text style={[styles.venueText, { color: theme.textSecondary }]}></Text>;
            })()
          ) : (
            <Text style={[styles.venueText, { color: theme.textSecondary }]}>
              {(() => {
                const venues = {
                  mlb: game.mlbGameData?.venue?.name,
                  competition: competition.venue?.fullName,
                  liveHeader: game.liveData?.header?.competitions?.[0]?.venue?.fullName,
                  gamepackage: game.liveData?.gamepackageJSON?.gmStrp?.venue,
                  gameInfo: game.liveData?.gameInfo?.venue?.fullName,
                  venueName: game.venue?.name,
                  venueFullName: game.venue?.fullName
                };
                console.log(`MLB Game ${game.id} venue sources:`, venues);
                
                return venues.mlb ||
                       venues.competition || 
                       venues.liveHeader || 
                       venues.gamepackage || 
                       venues.gameInfo ||
                       venues.venueName || 
                       venues.venueFullName || 
                       'TBD Stadium';
              })()}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderGameCard = (game) => {
    if (!game?.competitions?.[0]) return null;

    // Debug logging to understand how this game was fetched
    console.log(`Rendering game card for ${game.id}:`, {
      sport: game.sport,
      actualLeagueCode: game.actualLeagueCode,
      fromDirectLink: game.fromDirectLink,
      hasGameDataWithStatus: !!game.gameDataWithStatus,
      hasStatus: !!game.status,
      gameDataWithStatusStructure: game.gameDataWithStatus ? Object.keys(game.gameDataWithStatus) : null
    });

    const competition = game.competitions[0];
    const competitors = competition.competitors || [];
    const homeTeam = competitors.find(c => c.homeAway === "home");
    const awayTeam = competitors.find(c => c.homeAway === "away");

    if (!homeTeam || !awayTeam) return null;

    const gameDate = new Date(game.date);
    
    // Convert to EST
    const estDate = new Date(gameDate.toLocaleString("en-US", {timeZone: "America/New_York"}));
    
    const formatGameTime = (date) => {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York'
      });
    };

    const formatGameDate = (date) => {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/New_York'
      });
    };

    // Helper function to get the current/most recent play for live games (reuses extractor)
    const getCurrentPlay = (game) => {
      try {
  const most = extractMostRecentPlay(game, homeTeam, awayTeam);
        if (!most) {
          console.log(`No plays data for game ${game.id}`);
          return null;
        }
        console.log(`Returning play for game ${game.id}:`, {
          text: most.text || most.shortText || 'N/A',
          rawShape: most.raw ? Object.keys(most.raw).slice(0,5) : null
        });
        return most.raw || most;
      } catch (err) {
        console.log('getCurrentPlay error:', err?.message || err);
        return null;
      }
    };

    // Helper function to extract team ID from various API shapes (like Game Details screen)
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

    // Helper function to get team color for play border
    const getPlayTeamColor = (play, homeTeam, awayTeam) => {
      if (!play || !play.team) {
        return ''; // Gray fallback
      }

      const playTeamId = extractTeamId(play.team);
      const homeId = extractTeamId(homeTeam) || extractTeamId(homeTeam?.team);
      const awayId = extractTeamId(awayTeam) || extractTeamId(awayTeam?.team);

      if (playTeamId) {
        if (String(playTeamId) === String(awayId)) {
          // Try multiple approaches to get team color
          let teamColor = null;
          try {
            teamColor = ChampionsLeagueServiceEnhanced.getTeamColorWithAlternateLogic(awayTeam?.team || awayTeam);
          } catch (error) {
            // Silent fallback
          }
          
          // Fallback to team object color properties
          if (!teamColor) {
            teamColor = (awayTeam?.team?.color || awayTeam?.color || awayTeam?.team?.alternateColor || awayTeam?.alternateColor);
          }
          
          return teamColor || '#dc3545'; // Red fallback for away
        } else if (String(playTeamId) === String(homeId)) {
          let teamColor = null;
          try {
            teamColor = ChampionsLeagueServiceEnhanced.getTeamColorWithAlternateLogic(homeTeam?.team || homeTeam);
          } catch (error) {
            // Silent fallback
          }
          
          // Fallback to team object color properties
          if (!teamColor) {
            teamColor = (homeTeam?.team?.color || homeTeam?.color || homeTeam?.team?.alternateColor || homeTeam?.alternateColor);
          }
          
          return teamColor || '#007bff'; // Blue fallback for home
        }
      }
      
      return ''; // Gray fallback
    };

    // Component to display live play text with team color border
    const LivePlayDisplay = ({ game, theme }) => {
  const extracted = extractMostRecentPlay(game, homeTeam, awayTeam);
      // Log diagnostic summary so we can verify play text and team/color mapping
      try {
        const resolvedTeamName = (extracted && (extracted.team?.id ? (extracted.team?.id === homeTeam?.team?.id ? homeTeam?.team?.name : awayTeam?.team?.name) : (extracted.inferredTeamId ? (extracted.inferredIsHome ? homeTeam?.team?.name : awayTeam?.team?.name) : null))) || null;
        const resolvedColor = extracted && (extracted.team?.id ? MLBService.getTeamColor(resolvedTeamName) : (extracted.inferredTeamId ? MLBService.getTeamColor(resolvedTeamName) : null));
        console.log(`FavoritesScreen MLB play extracted -> game:${game.id}, playText:"${extracted?.text}", playTeamId:${extracted?.team?.id || extracted?.inferredTeamId || null}, resolvedTeam:${resolvedTeamName}, isHome:${extracted?.inferredIsHome || null}, teamColor:${resolvedColor || null}`);
      } catch (e) {
        // ignore logging errors
      }
      if (extracted) {
        const playText = extracted.text || extracted.shortText || 'Live';
        console.log(`LivePlayDisplay for game ${game.id}:`, { displayText: playText });
        return (
          <Text style={[styles.livePlayText, { color: theme.textSecondary }]} numberOfLines={2}>
            {playText}
          </Text>
        );
      }
      console.log(`No current play for game ${game.id}, showing fallback`);
      return <Text style={[styles.venueText, { color: theme.textSecondary }]}>Live</Text>;
    };

    // Determine game status using actual game status data (like scoreboard screens)
    const getMatchStatus = () => {
      // Try to get status from Site API data first (like Game Details screen)
      const statusFromSiteAPI = game.gameDataWithStatus?.header?.competitions?.[0]?.status;
      if (statusFromSiteAPI) {
        const state = statusFromSiteAPI.type?.state;
        
        console.log(`Using Site API status for game ${game.id}:`, {
          state,
          displayClock: statusFromSiteAPI.displayClock,
          period: statusFromSiteAPI.period,
          typeDescription: statusFromSiteAPI.type?.description,
          fullStatus: JSON.stringify(statusFromSiteAPI, null, 2)
        });

        if (state === 'pre') {
          // Match not started - show date and time but render label as 'Scheduled'
          const today = new Date();
          const isToday = gameDate.toDateString() === today.toDateString();
          const yesterday = new Date(today);
          yesterday.setDate(today.getDate() - 1);
          const isYesterday = gameDate.toDateString() === yesterday.toDateString();
          
          let dateText = '';
          if (isToday) {
            dateText = 'Today';
          } else if (isYesterday) {
            dateText = 'Yesterday';
          } else {
            dateText = gameDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
          }
          
          const timeText = formatGameTime(gameDate);

          // For pre-match state return a normalized status object similar to other states
          // Use 'Scheduled' as the primary label and keep date/time in detail/time
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
          const displayClock = statusFromSiteAPI.displayClock || "0'";
          const period = statusFromSiteAPI.period;
          
          // Check if it's halftime
          if (statusFromSiteAPI.type?.description === "Halftime") {
            return {
              text: 'Live',
              time: statusFromSiteAPI.type.description, // "Halftime"
              detail: statusFromSiteAPI.type.shortDetail || 'HT',
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
            time: displayClock || 'Current',
            detail: halfText,
            isLive: true,
            isPre: false,
            isPost: false
          };
        } else if (state === 'post') {
          return {
            text: 'Final',
            time: '',
            detail: '',
            isLive: false,
            isPre: false,
            isPost: true
          };
        }
      }

      // Fallback to original logic using game.status (Core API data)
      const status = game.status;
      const state = status?.type?.state;
      
      if (state === 'pre') {
        // Match not started - show date and time
        const today = new Date();
        const isToday = gameDate.toDateString() === today.toDateString();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const isYesterday = gameDate.toDateString() === yesterday.toDateString();
        
        let dateText = '';
        if (isToday) {
          dateText = 'Today';
        } else if (isYesterday) {
          dateText = 'Yesterday';
        } else {
          dateText = gameDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
        
        const timeText = formatGameTime(gameDate);
        
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
            detail: status.type.shortDetail || 'HT',
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
          time: displayClock || 'Current',
          detail: halfText,
          isLive: true,
          isPre: false,
          isPost: false
        };
      } else {
        // Match finished or no status data - use fallback logic
        const now = new Date();
        const threeHoursAgo = new Date(now.getTime() - (3 * 60 * 60 * 1000));
        
        if (gameDate < threeHoursAgo) {
          return {
            text: 'Final',
            time: '',
            detail: '',
            isLive: false,
            isPre: false,
            isPost: true
          };
        } else if (gameDate <= now) {
          // Game should be live but we don't have proper status data
          console.log('Fallback live game detected for:', game.id);
          return {
            text: 'Live',
            time: 'Live',
            detail: 'In Progress',
            isLive: true,
            isPre: false,
            isPost: false
          };
        } else {
          const timeText = formatGameTime(gameDate);
          const today = new Date();
          const isToday = gameDate.toDateString() === today.toDateString();
          const dateText = isToday ? 'Today' : gameDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
          
          return {
            text: 'Scheduled',
            time: timeText,
            detail: dateText,
            isLive: false,
            isPre: true,
            isPost: false
          };
        }
      }
    };

    const matchStatus = getMatchStatus();
    const gameStatus = matchStatus.text; // Keep this for backward compatibility
    
    // Log comprehensive status information for each game
    let isLive = null;
    let isScheduled = null;
    let isFinished = null;
    
    // For MLB games, also check MLB-specific status
    if (game.sport === 'MLB' || game.actualLeagueCode === 'mlb') {
      const codedGameState = game.mlbGameData?.status?.codedGameState || game.liveData?.status?.codedGameState || game.codedGameState;
      
      if (codedGameState) {
        isLive = codedGameState === 'I';
        isFinished = codedGameState === 'F';
        isScheduled = !isLive && !isFinished;
      } else {
        // Fallback to standard status for MLB if no coded state
        isLive = matchStatus.isLive;
        isScheduled = matchStatus.isPre;
        isFinished = matchStatus.isPost;
      }
    } else {
      // For non-MLB games, use the standard match status
      isLive = matchStatus.isLive;
      isScheduled = matchStatus.isPre;
      isFinished = matchStatus.isPost;
    }
    
    // Only log if this game hasn't been logged yet in this session
    const logKey = `${game.id}-${isLive}-${isScheduled}-${isFinished}`;
    if (!loggedGames.has(logKey)) {
      const gameStartTime = formatGameTime(gameDate);
      __orig_console_log(`Game ${game.id} (${game.sport || 'Unknown'}) Status - Live: ${isLive}, Scheduled: ${isScheduled}, Finished: ${isFinished}, Start Time: ${gameStartTime} EST`);
      loggedGames.add(logKey);
      
      // Determine if this game should receive updates and track it
      const statusInfo = { isLive, isPre: isScheduled, isPost: isFinished };
      const shouldUpdate = shouldGameReceiveUpdates(game, statusInfo, game.sport || 'Unknown');
      if (shouldUpdate) {
        gamesToUpdate.add(game.id);
      } else {
        gamesToUpdate.delete(game.id);
      }
    }
    
    const venue = competition.venue?.fullName || 'TBD';

    // Get scores using the same logic as team page
    const getScoreValue = (scoreData) => {
      if (!scoreData) return '0';
      
      if (scoreData.displayValue) return scoreData.displayValue;
      if (scoreData.value !== undefined) return scoreData.value.toString();
      
      if (typeof scoreData === 'string' || (typeof scoreData === 'object' && scoreData.$ref)) {
        return '0';
      }
      
      return scoreData.toString() || '0';
    };

    // Get shootout scores
    const getShootoutScore = (scoreData) => {
      if (!scoreData || typeof scoreData !== 'object') return null;
      
      if (scoreData.shootoutScore !== undefined && scoreData.shootoutScore !== null) {
        return scoreData.shootoutScore.toString();
      }
      
      return null;
    };

    const homeScore = getScoreValue(homeTeam.score);
    const awayScore = getScoreValue(awayTeam.score);
    const homeShootoutScore = getShootoutScore(homeTeam.score);
    const awayShootoutScore = getShootoutScore(awayTeam.score);
    
    // Determine winner/loser using shootout scores first if they exist
    const determineWinner = () => {
      if (gameStatus !== 'Final') return { homeIsWinner: false, awayIsWinner: false, isDraw: false };
      
      if (homeShootoutScore !== null && awayShootoutScore !== null) {
        const homeShootout = parseInt(homeShootoutScore);
        const awayShootout = parseInt(awayShootoutScore);
        
        if (homeShootout > awayShootout) {
          return { homeIsWinner: true, awayIsWinner: false, isDraw: false };
        } else if (awayShootout > homeShootout) {
          return { homeIsWinner: false, awayIsWinner: true, isDraw: false };
        }
        return { homeIsWinner: false, awayIsWinner: false, isDraw: true };
      }
      
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
    
    const { homeIsWinner, awayIsWinner, isDraw } = determineWinner();
    const homeIsLoser = matchStatus.isPost && !isDraw && !homeIsWinner;
    const awayIsLoser = matchStatus.isPost && !isDraw && !awayIsWinner;

    // Helper function to get competition name based on league code
    const getCompetitionName = (leagueCode) => {
      const competitionNames = {
        // European competitions
        'uefa.champions': 'Champions League',
        'uefa.europa': 'Europa League', 
        'uefa.europa.conf': 'Europa Conference League',
        
        // England
        'eng.1': 'Premier League',
        'eng.fa': 'FA Cup',
        'eng.league_cup': 'EFL Cup',
        
        // Spain
        'esp.1': 'La Liga',
        'esp.copa_del_rey': 'Copa del Rey',
        'esp.super_cup': 'Spanish Supercopa',
        
        // Germany
        'ger.1': 'Bundesliga',
        'ger.dfb_pokal': 'DFB Pokal',
        'ger.super_cup': 'German Super Cup',
        
        // Italy
        'ita.1': 'Serie A',
        'ita.coppa_italia': 'Coppa Italia',
        'ita.super_cup': 'Italian Supercoppa',
        
        // France
        'fra.1': 'Ligue 1',
        'fra.coupe_de_france': 'Coupe de France',
        'fra.super_cup': 'Trophee des Champions'
      };
      
      return competitionNames[leagueCode] || leagueCode;
    };

    // Helper function to get live play border styles for the card
    const getLivePlayBorderStyles = (game, theme) => {
      // Always use consistent border widths to prevent layout shifts and flickering
      const defaultBorderStyles = {
        borderLeftWidth: 3,
        borderRightWidth: 3,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderLeftColor: theme.border,
        borderRightColor: theme.border,
      };

      if (!matchStatus.isLive) return defaultBorderStyles;
      
      // Check if it's halftime - no side borders during halftime
      if (matchStatus.time === "Halftime" || matchStatus.detail === "HT") {
        return {
          borderLeftWidth: 0,
          borderRightWidth: 0,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
        };
      }
      
      const currentPlay = getCurrentPlay(game);
      if (!currentPlay) return defaultBorderStyles;
      
      const homeTeam = game.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home');
      const awayTeam = game.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away');
      const teamColor = getPlayTeamColor(currentPlay, homeTeam, awayTeam);
      const playTeamId = extractTeamId(currentPlay.team);
      const homeId = extractTeamId(homeTeam) || extractTeamId(homeTeam?.team);
      const isHomeTeamPlay = String(playTeamId) === String(homeId);
      
      // If we can't determine team color, use default borders to prevent jittering
      if (!teamColor || teamColor === '') {
        return defaultBorderStyles;
      }
      
      // Ensure color has # prefix
      const formattedColor = teamColor.startsWith('#') ? teamColor : `#${teamColor}`;
      
      // Always keep consistent border widths - only change colors to prevent flickering
      const borderStyles = {
        borderLeftColor: isHomeTeamPlay ? formattedColor : '#333333',
        borderRightColor: !isHomeTeamPlay ? formattedColor : '#333333',
        borderLeftWidth: isHomeTeamPlay ? 8 : 0,
        borderRightWidth: !isHomeTeamPlay ? 8 : 0,
        borderTopWidth: 1,
        borderBottomWidth: 1,
      };
      
      return borderStyles;
    };

    // Check if this is an MLB game and render it with special styling
    if (game.sport === 'MLB' || game.actualLeagueCode === 'mlb') {
      return renderMLBGameCard(game);
    }

    return (
      <TouchableOpacity 
        style={[
          styles.gameCard, 
          { backgroundColor: theme.surface, borderColor: theme.border },
          getLivePlayBorderStyles(game, theme)
        ]}
        onPress={() => handleGamePress(game)}
        activeOpacity={0.7}
      >
        {/* League Header */}
        <View style={[styles.leagueHeader, { backgroundColor: theme.surfaceSecondary }]}>
          {/* Diagnostic logging to help debug mismatched league names (e.g., EFL Cup shown as Premier League) */}
          {console.log('FavoritesScreen render - game object:', game)}
          {console.log('FavoritesScreen render - actualLeagueCode:', game.actualLeagueCode, 'competition:', competition)}
          {console.log('FavoritesScreen render - resolvedCompetitionName:', getCompetitionName(game.actualLeagueCode) || competition?.name || competition?.league?.name || game.sport)}
          <Text style={[styles.leagueText, { color: colors.primary }]}>
            {getCompetitionName(game.actualLeagueCode) || competition?.name || competition?.league?.name || game.sport}
          </Text>
        </View>
        
        {/* Main Match Content */}
        <View style={styles.matchContent}>
          {/* Home Team */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoRow}>
              <TeamLogoImage
                key={`home-${homeTeam.team?.id}`}
                teamId={homeTeam.team?.id}
                style={[styles.teamLogo, homeIsLoser && styles.losingTeamLogo]}
                isDarkMode={isDarkMode}
              />
              {!matchStatus.isPre && (
                <View style={styles.scoreContainer}>
                  <View style={styles.scoreRow}>
                    <Text style={[styles.teamScore, { 
                      color: matchStatus.isPost && homeIsWinner ? colors.primary : 
                             homeIsLoser ? '#999' : theme.text 
                    }]}>
                      {homeScore}
                    </Text>
                    {homeShootoutScore && (
                      <Text style={[
                        styles.shootoutSuperscript, 
                        { color: homeIsLoser ? '#999' : colors.primary }
                      ]}>
                       ({homeShootoutScore})
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </View>
            <Text style={[styles.teamAbbreviation, { 
              color: homeIsLoser ? '#999' : 
                     isFavorite(homeTeam.team?.id) ? colors.primary : theme.text 
            }]}>
              {isFavorite(homeTeam.team?.id) ? '★ ' : ''}{homeTeam.team?.abbreviation || homeTeam.team?.shortDisplayName || 'TBD'}
            </Text>
          </View>
          
          {/* Status Section */}
          <View style={styles.statusSection}>
            <Text style={[styles.gameStatus, { color: matchStatus.isLive ? '#ff4444' : colors.primary }]}>
              {matchStatus.text}
            </Text>
            {matchStatus.isLive ? (
              // For live games, show current time and half
              <>
                <Text style={[styles.gameDateTime, { color: matchStatus.isLive ? theme.text : theme.textSecondary }]}>
                  {matchStatus.time || 'Current'}
                </Text>
                <Text style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                  {matchStatus.detail || 'Live'}
                </Text>
              </>
            ) : (
              // For scheduled and finished games, show date and time
              <>
                <Text style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                  {matchStatus.detail || formatGameDate(gameDate)}
                </Text>
                {matchStatus.time && (
                  <Text style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                    {matchStatus.time} EST
                  </Text>
                )}
              </>
            )}
          </View>
          
          {/* Away Team */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoRow}>
              {!matchStatus.isPre && (
                <View style={styles.scoreContainer}>
                  <View style={styles.scoreRow}>
                    {awayShootoutScore && (
                      <Text style={[
                        styles.shootoutSuperscript, 
                        { color: awayIsLoser ? '#999' : colors.primary }
                      ]}>
                        ({awayShootoutScore})
                      </Text>
                    )}
                    <Text style={[styles.teamScore, { 
                      color: matchStatus.isPost && awayIsWinner ? colors.primary : 
                             awayIsLoser ? '#999' : theme.text 
                    }]}>
                      {awayScore}
                    </Text>
                  </View>
                </View>
              )}
              <TeamLogoImage
                key={`away-${awayTeam.team?.id}`}
                teamId={awayTeam.team?.id}
                style={[styles.teamLogo, awayIsLoser && styles.losingTeamLogo]}
                isDarkMode={isDarkMode}
              />
            </View>
            <Text style={[styles.teamAbbreviation, { 
              color: awayIsLoser ? '#999' : 
                     isFavorite(awayTeam.team?.id) ? colors.primary : theme.text 
            }]}>
              {isFavorite(awayTeam.team?.id) ? '★ ' : ''}{awayTeam.team?.abbreviation || awayTeam.team?.shortDisplayName || 'TBD'}
            </Text>
          </View>
        </View>
        
        {/* Venue or Live Play */}
        <View style={styles.venueSection}>
          {matchStatus.isLive ? (
            <LivePlayDisplay game={game} theme={theme} />
          ) : (
            <Text style={[styles.venueText, { color: theme.textSecondary }]}>{venue}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderGroupedGames = () => {
    // Helper function to get competition name based on league code
    const getCompetitionName = (leagueCode) => {
      const competitionNames = {
        // European competitions
        'uefa.champions': 'Champions League',
        'uefa.europa': 'Europa League', 
        'uefa.europa.conf': 'Europa Conference League',
        
        // England
        'eng.1': 'Premier League',
        'eng.fa': 'FA Cup',
        'eng.league_cup': 'EFL Cup',
        
        // Spain
        'esp.1': 'La Liga',
        'esp.copa_del_rey': 'Copa del Rey',
        'esp.super_cup': 'Spanish Supercopa',
        
        // Germany
        'ger.1': 'Bundesliga',
        'ger.dfb_pokal': 'DFB Pokal',
        'ger.super_cup': 'German Super Cup',
        
        // Italy
        'ita.1': 'Serie A',
        'ita.coppa_italia': 'Coppa Italia',
        'ita.super_cup': 'Italian Supercoppa',
        
        // France
        'fra.1': 'Ligue 1',
        'fra.coupe_de_france': 'Coupe de France',
        'fra.super_cup': 'Trophee des Champions'
      };
      
      return competitionNames[leagueCode] || leagueCode;
    };

    // Function to get generic league group name from actual competition
    const getLeagueGroupName = (actualLeagueCode, fallbackSport) => {
      const competitionName = getCompetitionName(actualLeagueCode);
      
      const groupNames = {
        'Premier League': 'England Soccer',
        'FA Cup': 'England Soccer',
        'EFL Cup': 'England Soccer',
        'La Liga': 'Spain Soccer',
        'Copa del Rey': 'Spain Soccer',
        'Spanish Supercopa': 'Spain Soccer',
        'Serie A': 'Italy Soccer',
        'Coppa Italia': 'Italy Soccer',
        'Italian Supercoppa': 'Italy Soccer',
        'Bundesliga': 'Germany Soccer',
        'DFB Pokal': 'Germany Soccer',
        'German Super Cup': 'Germany Soccer',
        'Ligue 1': 'France Soccer',
        'Coupe de France': 'France Soccer',
        'Trophee des Champions': 'France Soccer',
        'Champions League': 'Champions League',
        'Europa League': 'Europa League',
        'Europa Conference League': 'Europa Conference League'
      };
      
      return groupNames[competitionName] || fallbackSport || 'Unknown';
    };

    // Group games by actual competition using actualLeagueCode
    const grouped = favoriteGames.reduce((acc, game) => {
      const sport = getLeagueGroupName(game.actualLeagueCode, game.sport);
      if (!acc[sport]) {
        acc[sport] = [];
      }
      acc[sport].push(game);
      return acc;
    }, {});

    // Ensure we have an ordering to display groups in
    const order = sectionOrder || DEFAULT_SECTION_ORDER;

    // Build groupedGames in requested order but include any extra groups at the end
    const groupedGames = {};
    for (const key of order) {
      if (grouped[key]) groupedGames[key] = grouped[key];
    }
    // Append any groups not in order
    Object.keys(grouped).forEach(k => {
      if (!groupedGames[k]) groupedGames[k] = grouped[k];
    });

    // Sort games within each group and render each league group
    return Object.keys(groupedGames).map(sport => {
      const sortedGames = sortGamesByStatusAndTime(groupedGames[sport]);
      const isCollapsed = collapsedSections[sport] !== false; // Default to collapsed (true)
      const gamesToShow = isCollapsed ? sortedGames.slice(0, 1) : sortedGames;

      return (
        <View key={sport} style={styles.leagueGroup}>
          <TouchableOpacity 
            style={styles.sectionHeader}
            onPress={() => setCollapsedSections(prev => ({
              ...prev,
              [sport]: !isCollapsed
            }))}
            activeOpacity={0.7}
          >
            <Text style={[styles.leagueGroupTitle, { color: colors.primary }]}>
              {sport}
            </Text>
            <Text style={[styles.collapseArrow, { color: colors.primary }]}>
              {isCollapsed ? '▶' : '▼'}
            </Text>
          </TouchableOpacity>
          {gamesToShow.map((game, index) => (
            <View key={`${game.id}-${index}`}>
              {renderGameCard(game)}
            </View>
          ))}
        </View>
      );
    });
  };

  // Reorder modal content
  const renderReorderModal = () => {
    const data = sectionOrder || DEFAULT_SECTION_ORDER;
    return (
      <Modal
        visible={isReorderModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={closeReorderModal}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: '90%', maxHeight: '70%', backgroundColor: theme.surface, borderRadius: 10, padding: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.primary, marginBottom: 8 }}>Reorder Sections</Text>
            <FlatList
              data={data}
              keyExtractor={(item) => item}
              renderItem={({ item, index }) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
                  <Text style={{ color: theme.text }}>{item}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => moveItem(index, -1)} style={{ padding: 8 }}>
                      <Text style={{ color: colors.primary }}>▲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => moveItem(index, 1)} style={{ padding: 8 }}>
                      <Text style={{ color: colors.primary }}>▼</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
              <TouchableOpacity onPress={closeReorderModal} style={{ padding: 8 }}>
                <Text style={{ color: colors.primary }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>
          Loading favorite games...
        </Text>
      </View>
    );
  }

  const favoriteTeams = getFavoriteTeams();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: colors.primary }]}>Favorites</Text>
      
      {favoriteTeams.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.subtitle, { color: theme.text }]}>
            Your favorite teams and games will appear here
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Add teams to favorites by clicking the star on team pages
          </Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.favoritesContainer} 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          {favoriteGames.length > 0 ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Today's Games
                </Text>
                <TouchableOpacity onPress={openReorderModal} style={{ padding: 8 }} accessibilityLabel="Reorder Sections">
                  {/* Simple 3-bar icon */}
                  <View style={{ width: 28, alignItems: 'center' }}>
                    <View style={{ height: 3, width: 20, backgroundColor: colors.primary, marginVertical: 2, borderRadius: 2 }} />
                    <View style={{ height: 3, width: 20, backgroundColor: colors.primary, marginVertical: 2, borderRadius: 2 }} />
                    <View style={{ height: 3, width: 20, backgroundColor: colors.primary, marginVertical: 2, borderRadius: 2 }} />
                  </View>
                </TouchableOpacity>
              </View>
              {renderGroupedGames()}
              {renderReorderModal()}
            </>
          ) : (
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              No games today for your favorite teams
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 0, // Remove bottom padding to eliminate gap
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  favoritesContainer: {
    flex: 1,
    paddingTop: 5,
    paddingBottom: 20, // Add some bottom padding for content but keep gap minimal
  },
  gameCard: {
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  leagueHeader: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  leagueText: {
    fontSize: 14,
    fontWeight: '600',
  },
  matchContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  teamSection: {
    flex: 1,
    alignItems: 'center',
  },
  teamLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  teamLogo: {
    width: 32,
    height: 32,
  },
  losingTeamLogo: {
    opacity: 0.6,
  },
  scoreContainer: {
    marginHorizontal: 8,
  },
  teamScore: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    minWidth: 30,
  },
  shootoutScore: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 2,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  shootoutSuperscript: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 2,
    marginBottom: 4,
  },
  teamAbbreviation: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  statusSection: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  gameStatus: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  gameDateTime: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 2,
  },
  venueSection: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    alignItems: 'center',
  },
  venueText: {
    fontSize: 11,
    textAlign: 'center',
  },
  livePlayContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  livePlayText: {
    fontSize: 11,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 6,
  },
  gameInfo: {
    padding: 16,
    alignItems: 'center',
  },
  gameText: {
    fontSize: 14,
  },
  leagueGroup: {
    marginBottom: 20,
  },
  leagueGroupTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginLeft: 4,
  },
  collapseArrow: {
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 4,
  },
  livePlayContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  livePlayText: {
    fontSize: 11,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 10,
  },
  // MLB-specific styles
  liveGameMiddleSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  liveInningText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  liveCountText: {
    fontSize: 11,
    marginBottom: 2,
  },
  liveOutsText: {
    fontSize: 11,
  },
  miniBasesContainer: {
    alignItems: 'center',
    marginVertical: 2,
  },
  miniBasesRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  miniBase: {
    width: 8,
    height: 8,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#ccc',
    marginHorizontal: 1,
  },
  playTextContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  playText: {
    fontSize: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  // Mini bases styles for MLB live games
  miniBasesContainer: {
    alignItems: 'center',
    marginVertical: 2,
  },
  miniBasesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 20,
  },
  miniBase: {
    width: 6,
    height: 6,
    borderWidth: 1,
    borderColor: '#666',
    transform: [{ rotate: '45deg' }],
    margin: 1,
  },
});

export default FavoritesScreen;
