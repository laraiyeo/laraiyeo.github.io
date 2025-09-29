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
import { getAPITeamId, convertMLBIdToESPNId, normalizeTeamIdForStorage } from '../utils/TeamIdMapping';
import { NFLService } from '../services/NFLService';
import { getCurrentGameDay, getTodayDateRange } from '../utils/DateUtils';

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
  const { timeout = 3500, force = false, bypassGating = false } = options;
  // During poll passes, avoid making expensive discovery requests to ESPN Core / Site APIs
  // unless explicitly forced or bypassing gating. Return cached data when available, otherwise null.
  try {
    if (!force && !bypassGating && currentFetchPhase === 'poll') {
      const blockedPatterns = ['sports.core.api.espn.com', 'site.api.espn.com', '/v2/sports/'];
      if (blockedPatterns.some(p => String(url).includes(p))) {
        const cached = eventFetchCache.get(url);
        if (cached?.parsed) return cached.parsed;
        // don't perform network fetch during poll for these endpoints
        return null;
      }
    } else if (bypassGating && currentFetchPhase === 'poll') {
      console.log('[BYPASS] Allowing gated URL during poll mode:', url ? url.substring(0, 100) : 'undefined URL');
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
      const timeoutId = setTimeout(() => {
        console.log(`[TIMEOUT] Aborting fetch for ${url ? url.substring(0, 100) : 'undefined URL'}... after ${timeout}ms`);
        controller.abort();
      }, timeout);
      
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
        console.log(`[CACHE] Error fallback for ${url ? url.substring(0, 100) : 'undefined URL'}...: ${error.name || error.message}`);
        urlLastFetchedPass.set(url, currentFetchPassId);
        return cacheEntry.parsed;
      }
      
      // Provide more specific error messages
      if (error.name === 'AbortError') {
        console.log(`[FETCH TIMEOUT] Request aborted after ${timeout}ms for ${url ? url.substring(0, 100) : 'undefined URL'}...`);
        return null; // Return null instead of throwing for timeout errors
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
  
  // Debug logging to understand status detection
  console.log(`shouldGameReceiveUpdates for ${gameId}: isLive=${isLive}, isPre=${isPre}, isPost=${isPost}, teamName=${teamName}`);
  
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
        const mlbWindow = 5 * 60 * 1000; // 5 minutes for MLB
        if (timeDiff < mlbWindow) {
          console.log(`Game ${gameId} (${teamName}): UPDATE - MLB finished game within 5-minute window (${Math.round(timeDiff / 60000)} minutes ago)`);
          return true;
        } else {
          console.log(`Game ${gameId} (${teamName}): NO UPDATE - MLB finished game beyond 5-minute window (${Math.round(timeDiff / 60000)} minutes ago)`);
          return false;
        }
      } else if (isSoccer) {
        const soccerWindow = 5 * 60 * 1000; // 5 minutes for soccer
        if (timeDiff < soccerWindow) {
          console.log(`Game ${gameId} (${teamName}): UPDATE - Soccer finished game within 5-minute window (${Math.round(timeDiff / 60000)} minutes ago)`);
          return true;
        } else {
          console.log(`Game ${gameId} (${teamName}): NO UPDATE - Soccer finished game beyond 5-minute window (${Math.round(timeDiff / 60000)} minutes ago)`);
          return false;
        }
      } else {
        const defaultWindow = 5 * 60 * 1000; // 5 minutes for other sports
        if (timeDiff < defaultWindow) {
          console.log(`Game ${gameId} (${teamName}): UPDATE - Other sport finished game within 5-minute window (${Math.round(timeDiff / 60000)} minutes ago)`);
          return true;
        } else {
          console.log(`Game ${gameId} (${teamName}): NO UPDATE - Other sport finished game beyond 5-minute window (${Math.round(timeDiff / 60000)} minutes ago)`);
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
  const { getFavoriteTeams, isFavorite, favorites, getTeamCurrentGame, updateTeamCurrentGame, clearTeamCurrentGame, refreshAllCurrentGames, autoPopulating } = useFavorites();
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
  const [currentGameDay, setCurrentGameDay] = useState(null);
  const [dailyCleanupInterval, setDailyCleanupInterval] = useState(null);
  


  // Using module-level helper promiseWithTimeout defined above.

  // Function to sort games by status then time
  const sortGamesByStatusAndTime = (games) => {
    return games.sort((a, b) => {
      const getGameStatus = (game) => {
        console.log(`[STATUS DEBUG] Checking status for game ${game.id}`);
        
        // Use the same status checking logic as the display function
        const statusFromSiteAPI = game.gameDataWithStatus?.header?.competitions?.[0]?.status;
        let statusType = null;
        
        if (statusFromSiteAPI) {
          statusType = statusFromSiteAPI.type?.state;
          console.log(`[STATUS DEBUG] Game ${game.id} - statusFromSiteAPI: state="${statusType}"`);
        } else {
          // Fallback to other status sources
          const status = game.status || game.header?.competitions?.[0]?.status || game.competitions?.[0]?.status;
          statusType = status?.type?.state;
          console.log(`[STATUS DEBUG] Game ${game.id} - fallback status: state="${statusType}"`);
        }
        
        if (statusType === 'in') {
          console.log(`[STATUS DEBUG] Game ${game.id} -> Live`);
          return 'Live'; // Live games have highest priority
        } else if (statusType === 'pre') {
          console.log(`[STATUS DEBUG] Game ${game.id} -> Scheduled`);
          return 'Scheduled';
        } else if (statusType === 'post') {
          console.log(`[STATUS DEBUG] Game ${game.id} -> Final`);
          return 'Final';
        }
        
        // If this is an MLB game, prefer MLB's codedGameState when available
        if (game.sport === 'MLB' || String(game.actualLeagueCode || '').toLowerCase() === 'mlb') {
          const coded = game.mlbGameData?.status?.codedGameState || game.liveData?.status?.codedGameState;
          if (coded) {
            console.log(`[STATUS DEBUG] Game ${game.id} - MLB coded: "${coded}"`);
            if (coded === 'F') return 'Final';
            if (coded === 'I') return 'Live';
            return 'Scheduled';
          }
        }
        
        // If this is an NFL game and we couldn't determine status from statusType, check computeMatchFlags
        if (game.sport === 'NFL' || String(game.actualLeagueCode || '').toLowerCase() === 'nfl') {
          console.log(`[STATUS DEBUG] Game ${game.id} - checking NFL computeMatchFlags`);
          const flags = computeMatchFlags(game);
          console.log(`[STATUS DEBUG] Game ${game.id} - NFL flags: isLive=${flags.isLive}, isFinished=${flags.isFinished}, isScheduled=${flags.isScheduled}`);
          if (flags.isLive) {
            console.log(`[STATUS DEBUG] Game ${game.id} -> Live (from NFL flags)`);
            return 'Live';
          }
          if (flags.isFinished) {
            console.log(`[STATUS DEBUG] Game ${game.id} -> Final (from NFL flags)`);
            return 'Final';
          }
          console.log(`[STATUS DEBUG] Game ${game.id} -> Scheduled (from NFL flags)`);
          return 'Scheduled';
        }

        // Fallback to date-based logic if no status available
        console.log(`[STATUS DEBUG] Game ${game.id} - using date-based fallback`);
        const gameDate = new Date(game.date);
        const now = new Date();
        const threeHoursAgo = new Date(now.getTime() - (3 * 60 * 60 * 1000));
        
        if (gameDate < threeHoursAgo) {
          console.log(`[STATUS DEBUG] Game ${game.id} -> Final (date-based)`);
          return 'Final';
        } else if (gameDate <= now) {
          console.log(`[STATUS DEBUG] Game ${game.id} -> Live (date-based)`);
          return 'Live';
        } else {
          console.log(`[STATUS DEBUG] Game ${game.id} -> Scheduled (date-based)`);
          return 'Scheduled';
        }
      };

      const statusA = getGameStatus(a);
      const statusB = getGameStatus(b);
      
      // Debug logging for sorting
      console.log(`[SORT DEBUG] Game ${a.id} (${a.homeTeam?.abbreviation || 'UNK'} vs ${a.awayTeam?.abbreviation || 'UNK'}): status="${statusA}"`);
      console.log(`[SORT DEBUG] Game ${b.id} (${b.homeTeam?.abbreviation || 'UNK'} vs ${b.awayTeam?.abbreviation || 'UNK'}): status="${statusB}"`);
      
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

  // NOTE: Using unified date utils from DateUtils.js for consistent 2 AM NY cutoff

  // Helper function to clear all team current games and force refresh
  const clearAllCurrentGamesAndRefresh = async () => {
    console.log('FavoritesScreen: Daily cleanup - clearing ALL stored current games due to game day change');
    
    // Clear all cached data since it's from a previous game day
    eventFetchCache.clear();
    teamMetadataCache.clear();
    mlbScheduleCache.clear();
    urlLastFetchedPass.clear();
    console.log('FavoritesScreen: Cleared all cached data due to game day change');
    
    // Clear ALL current games for favorite teams to ensure a clean slate for the new day
    const favoriteTeams = getFavoriteTeams();
    let gamesCleared = 0;
    
    for (const team of favoriteTeams) {
      const currentGame = getTeamCurrentGame(team.teamId);
      if (currentGame) {
        console.log(`FavoritesScreen: Clearing game for ${team.sport} - ${team.teamName}: ${currentGame.gameDate || 'no date'}`);
        await clearTeamCurrentGame(team.teamId);
        gamesCleared++;
      }
    }
    
    console.log(`FavoritesScreen: Daily cleanup completed - cleared ALL ${gamesCleared} games for fresh start`);
    
    // Force a complete refresh to fetch new games
    await fetchFavoriteGames(true);
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

    // Hash favorites by teamId and currentGame to detect updates to stored currentGame (eventId/updatedAt)
    const newHash = JSON.stringify((favorites || []).map(f => ({
      teamId: String(f.teamId || ''),
      eventId: f?.currentGame?.eventId || null,
      updatedAt: f?.currentGame?.updatedAt || null
    })).sort((a,b) => (a.teamId || '').localeCompare(b.teamId || '')));
    
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
  }, [favorites]); // React to any change in favorites (including currentGame updates)

  // Daily cleanup effect - monitor for 2 AM EST rollover and clear old games
  useEffect(() => {
    // Initialize current game day
    const initialGameDay = getCurrentGameDay();
    setCurrentGameDay(initialGameDay);
    console.log('FavoritesScreen: Initial game day set to:', initialGameDay);

    // Set up interval to check for day changes every minute
    const checkInterval = setInterval(() => {
      const newGameDay = getCurrentGameDay();
      
      if (currentGameDay && newGameDay !== currentGameDay) {
        console.log('FavoritesScreen: Game day changed from', currentGameDay, 'to', newGameDay);
        setCurrentGameDay(newGameDay);
        
        // Clear all stored current games and refresh
        clearAllCurrentGamesAndRefresh();
      } else if (!currentGameDay) {
        // Set initial game day if not set
        setCurrentGameDay(newGameDay);
      }
    }, 60000); // Check every minute

    setDailyCleanupInterval(checkInterval);

    return () => {
      if (checkInterval) {
        clearInterval(checkInterval);
        setDailyCleanupInterval(null);
      }
    };
  }, [currentGameDay]); // Include currentGameDay to properly track changes

  // Default section order if none present
  const DEFAULT_SECTION_ORDER = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer'];

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

      // Auto-refresh after a short delay to catch auto-populated currentGame data
      const autoRefreshTimer = setTimeout(() => {
        console.log('FavoritesScreen: Auto-refresh to catch auto-populated games');
        fetchFavoriteGames(false); // Use poll mode for this refresh
      }, 2000); // 2 second delay to allow auto-population to complete

      // Listen for app coming back to foreground while this screen is focused
      const onAppStateChange = (nextAppState) => {
        if (nextAppState === 'active') {
          console.log('FavoritesScreen: App returned to foreground - checking for game day changes');
          
          // Check if game day changed while app was in background
          const newGameDay = getCurrentGameDay();
          if (currentGameDay && newGameDay !== currentGameDay) {
            console.log('FavoritesScreen: Game day changed while app was in background');
            setCurrentGameDay(newGameDay);
            clearAllCurrentGamesAndRefresh();
          } else {
            console.log('FavoritesScreen: Game day unchanged - normal refresh');
            fetchFavoriteGames(true);
          }
        }
      };
      const sub = AppState.addEventListener ? AppState.addEventListener('change', onAppStateChange) : null;

      return () => {
        if (DEBUG) console.log('FavoritesScreen: Screen unfocused - pausing updates');
        setIsScreenFocused(false);
        if (updateInterval) {
          clearInterval(updateInterval);
          setUpdateInterval(null);
        }
        if (liveGamesInterval) {
          clearInterval(liveGamesInterval);
          setLiveGamesInterval(null);
        }
        // Note: dailyCleanupInterval is NOT cleared here as it should run continuously
        // to detect the 2 AM rollover even when screen is not focused
        
        // Clear auto-refresh timer
        clearTimeout(autoRefreshTimer);
        
        if (sub && sub.remove) sub.remove();
        // Restore original console.log in case it was silenced by this module
        try {
          if (!DEBUG && console.log) console.log = console.log;
        } catch (e) {
          // ignore
        }
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
    // Check if we have any games that need updates (live or approaching start time)
    const hasGamesNeedingUpdates = favoriteGames.some(game => {
      if (!game) return false;
      const statusInfo = { 
        isLive: game.isLive, 
        isPre: game.isScheduled && !game.isLive, 
        isPost: game.isFinished 
      };
      return shouldGameReceiveUpdates(game, statusInfo, game.sport || 'Unknown');
    });

    if (hasGamesNeedingUpdates && isScreenFocused) {
      console.log('FavoritesScreen: Games needing updates detected - setting up continuous refresh');
      // Set up continuous refresh for live games (every 10 seconds)
      const interval = setInterval(() => {
        console.log('FavoritesScreen: Auto-refresh triggered for games that need updates');
        // Update games that should receive updates based on their status and timing
        setFavoriteGames(currentGames => {
          const gamesToUpdate = currentGames.filter(game => {
            if (!game) return false;
            
            // Create proper status info object with more robust detection
            const statusInfo = { 
              isLive: game.isLive || false, 
              isPre: (game.isScheduled && !game.isLive) || false, 
              isPost: game.isFinished || 
                     (game.status?.type?.completed === true) ||
                     (game.status?.type?.description?.toLowerCase().includes('final')) ||
                     (game.header?.competitions?.[0]?.status?.type?.completed === true) ||
                     (game.competitions?.[0]?.status?.type?.completed === true) ||
                     false
            };
            
            // Debug log to see what's happening
            console.log(`Auto-refresh check for game ${game.id || game.eventId}: isLive=${statusInfo.isLive}, isPre=${statusInfo.isPre}, isPost=${statusInfo.isPost}`);
            
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
          
          // Create proper status info object with more robust detection (same as main auto-refresh)
          const statusInfo = { 
            isLive: game.isLive || false, 
            isPre: (game.isScheduled && !game.isLive) || false, 
            isPost: game.isFinished || 
                   (game.status?.type?.completed === true) ||
                   (game.status?.type?.description?.toLowerCase().includes('final')) ||
                   (game.header?.competitions?.[0]?.status?.type?.completed === true) ||
                   (game.competitions?.[0]?.status?.type?.completed === true) ||
                   false
          };
          
          // Debug log to see what's happening
          console.log(`Plays auto-refresh check for game ${game.id || game.eventId}: isLive=${statusInfo.isLive}, isPre=${statusInfo.isPre}, isPost=${statusInfo.isPost}`);
          
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
  }, 25 * 1000); // 25 seconds
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

    // Wait for auto-population to complete before proceeding
    if (autoPopulating) {
      console.log('Waiting for auto-population to complete...');
      // Wait up to 10 seconds for auto-population
      let attempts = 0;
      while (autoPopulating && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }
      console.log('Auto-population wait completed, proceeding with fetch');
    }

    try {
      isFetchingFavorites = true;
      // Mark the fetch phase so fetchJsonWithCache can decide whether to allow discovery fetches
      currentFetchPhase = forceRefresh ? 'initial' : 'poll';
      const now = Date.now();

      // Reduce debounce frequency: don't refetch more often than every 20 seconds
      if (!forceRefresh && lastFetchTime && (now - lastFetchTime) < 20000) {
        if (DEBUG) console.log('Skipping fetch - too soon since last fetch (20s cooldown)');
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
      
      // Debug: Check if favorites already have currentGame data
      favoriteTeams.forEach(team => {
        const teamName = team.displayName || team.teamName || 'Unknown';
        if (team.currentGame) {
          console.log(`[STORED GAME] ${teamName} already has currentGame:`, team.currentGame);
        } else {
          console.log(`[NO STORED GAME] ${teamName} has no currentGame stored`);
        }
      });
      
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

      // For each unique team, use the currentGame data from FavoritesContext
      const gamesPromises = uniqueTeams.flatMap(async (team) => {
        const teamGames = [];
        const teamName = (team && (team.displayName || team.teamName)) || 'Unknown Team';
        const teamStart = Date.now();
        const phaseTimes = {};
        
        // Use currentGame data from the team object (populated by FavoritesContext auto-population)
        const currentGameData = team.currentGame || null;
        
        if (!currentGameData) {
          console.log(`[NO CURRENT GAME] ${teamName} has no currentGame - team page utils will handle this in the background`);
          phaseTimes.total = Date.now() - teamStart;
          console.log(`FavoritesScreen: team ${teamName} fetch phases (ms):`, phaseTimes);
          return teamGames; // Return empty for teams without currentGame
        }
        
        // Fast display: create a lightweight instant game card from stored currentGame so UI is instantaneous
        const instantGame = {
          id: currentGameData.eventId ? String(currentGameData.eventId) : `fav-${team.teamId}-${currentGameData.gameDate}`,
          eventId: currentGameData.eventId || null,
          eventLink: currentGameData.eventLink || null,
          gameDate: currentGameData.gameDate || null,
          competition: currentGameData.competition || team.sport || null,
          favoriteTeam: team.displayName || team.teamName || null,
          favoriteTeamId: team.teamId || team.id || null
        };

        try {
          // Merge instant card into UI immediately (fast display)
          mergeAndSetGames([ instantGame ]);
          // Hide initial loading spinner as soon as we show the first instant card
          setLoading(false);
          // Mark that we've rendered incrementally so the first slow background fetch doesn't hide the UI again
          incrementalRendered = true;
        } catch (e) {
          // ignore merge errors for instant display
        }

        if (DEBUG) console.log(`[USING FAVORITE GAME] Using currentGame from favorites for ${teamName}:`, currentGameData);
        
        // Ensure eventLink is set for the stored game
        if ((currentGameData.competition === 'mlb' || team.sport === 'MLB') && !currentGameData.eventLink && currentGameData.eventId) {
          console.log(`[DEBUG] Setting missing eventLink for MLB game ${currentGameData.eventId}`);
          currentGameData.eventLink = `/api/v1.1/game/${currentGameData.eventId}/feed/live`;
        }
        
        if ((currentGameData.competition === 'nfl' || team.sport === 'NFL') && !currentGameData.eventLink && currentGameData.eventId) {
          console.log(`[DEBUG] Setting missing eventLink for NFL game ${currentGameData.eventId}`);
          currentGameData.eventLink = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${currentGameData.eventId}`;
        }
        
        try {
          // Still perform a background enhancement fetch to get full game details, but do not block the UI
          const directResult = await promiseWithTimeout(fetchGameFromEventLink(team, currentGameData), 4500);
          if (directResult) {
            const results = Array.isArray(directResult) ? directResult : [directResult];
            const valid = results.filter(r => r !== null);
            if (valid.length > 0) teamGames.push(...valid);
          }
        } catch (error) {
          console.log(`Direct fetch failed for ${teamName}:`, error);
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
      
      // Automatically store currentGame data for all teams that have games
      console.log('[AUTO STORAGE] Storing currentGame data for all teams with fetched games...');
      const storagePromises = [];
      
      for (const game of uniqueGames) {
        if (game.favoriteTeam && game.eventId && game.eventLink && game.gameDate) {
          const currentGameData = {
            eventId: game.eventId,
            eventLink: game.eventLink,
            gameDate: game.gameDate,
            competition: game.competition || game.sport || 'unknown',
            updatedAt: new Date().toISOString()
          };
          
          // Find the team in favorites to get the correct teamId
          const favoriteTeam = favoriteTeams.find(t => 
            t.displayName === game.favoriteTeam || 
            t.teamName === game.favoriteTeam ||
            String(t.teamId) === String(game.favoriteTeamId)
          );
          
          if (favoriteTeam && favoriteTeam.teamId) {
            console.log(`[AUTO STORAGE] Storing currentGame for ${game.favoriteTeam} (teamId: ${favoriteTeam.teamId}):`, currentGameData);
            storagePromises.push(
              updateTeamCurrentGame(favoriteTeam.teamId, currentGameData).catch(error => {
                console.log(`[AUTO STORAGE] Failed to store currentGame for ${game.favoriteTeam}:`, error.message);
              })
            );
          } else {
            console.log(`[AUTO STORAGE] Could not find favorite team for ${game.favoriteTeam}, skipping storage`);
          }
        }
      }
      
      // Wait for all storage operations to complete
      if (storagePromises.length > 0) {
        await Promise.allSettled(storagePromises);
        console.log(`[AUTO STORAGE] Completed storing currentGame data for ${storagePromises.length} teams`);
      }
      
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
        const finalGames = sortGamesByStatusAndTime(uniqueGames.map(g => ({ ...(g || {}), ...computeMatchFlags(g || {}) })));
        console.log(`[FAVORITES STATE] Setting ${finalGames.length} games to favoriteGames state:`, finalGames.map(g => `${g.id} (${g.sport})`));
        setFavoriteGames(finalGames);
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
        (currentGamesSnapshot || favoriteGames).map(async (game) => {
          // Check if this game is one that should receive updates
          const shouldUpdate = gamesToUpdate.find(g => g.id === game.id);
          
          if (!shouldUpdate) {
            return game; // Return unchanged if not in update list
          }

          // temporary holder for status data fetched alongside plays
          let extraStatusForMerge = null;
          // temporary holder for individual competitor score data
          let extraScoreDataForMerge = null;

          try {
            let playsData = null;
            
            // Determine the correct API endpoint based on sport
            console.log(`[BRANCH DEBUG] Game ${game.id} - sport: "${game.sport}", actualLeagueCode: "${game.actualLeagueCode}"`);
            if (game.sport === 'Champions League' || game.actualLeagueCode === 'uefa.champions') {
              console.log(`[BRANCH DEBUG] Using Champions League branch for game ${game.id}`);
              const playsResponseData = await fetchJsonWithCache(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.champions/events/${game.id}/competitions/${game.id}/plays?lang=en&region=us&limit=1000`);
              if (playsResponseData.items && playsResponseData.items.length > 0) {
                playsData = [...playsResponseData.items].reverse();
                console.log(`Updated plays for UCL game ${game.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
              }
              
              // Also fetch Site API status for Champions League
              try {
                const siteApiUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/summary?event=${game.id}`;
                console.log(`[SITE API UCL] Fetching status from: ${siteApiUrl}`);
                const statusJson = await fetchJsonWithCache(siteApiUrl);
                if (statusJson && statusJson.header && statusJson.header.competitions && statusJson.header.competitions[0]) {
                  extraStatusForMerge = statusJson.header.competitions[0];
                  console.log(`[SITE API UCL] Fetched Site API status for UCL game ${game.id}`);
                } else {
                  console.log(`[SITE API UCL] No valid status data in response for game ${game.id}`);
                }
              } catch (statusErr) {
                console.log(`[SITE API UCL] Could not fetch Site API status for UCL game ${game.id}:`, statusErr?.message || statusErr);
              }

              // Also fetch individual competitor score data like initial load does
              if (game.competitions?.[0]?.competitors) {
                try {
                  console.log(`[SCORE FETCH UCL] Fetching individual competitor scores for game ${game.id}`);
                  const scorePromises = game.competitions[0].competitors.map(async (competitor, index) => {
                    if (competitor.score?.$ref) {
                      console.log(`[SCORE FETCH UCL] Fetching score data from: ${competitor.score.$ref}`);
                      const scoreData = await getEventData(competitor.score.$ref, true).catch(() => null);
                      return { index, scoreData };
                    }
                    return { index, scoreData: null };
                  });
                  const scoreResults = await Promise.all(scorePromises);
                  console.log(`[SCORE FETCH UCL] Retrieved ${scoreResults.filter(s => s.scoreData !== null).length} score updates for game ${game.id}`);
                  
                  // Store score data for later merging
                  extraScoreDataForMerge = scoreResults.filter(r => r.scoreData !== null);
                } catch (scoreErr) {
                  console.log(`[SCORE FETCH UCL] Error fetching competitor scores for game ${game.id}:`, scoreErr?.message || scoreErr);
                }
              }
            } else if (game.sport === 'Europa League' || game.actualLeagueCode === 'uefa.europa') {
              console.log(`[BRANCH DEBUG] Using Europa League branch for game ${game.id}`);
              const playsResponseData = await fetchJsonWithCache(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.europa/events/${game.id}/competitions/${game.id}/plays?lang=en&region=us&limit=1000`);
              if (playsResponseData.items && playsResponseData.items.length > 0) {
                playsData = [...playsResponseData.items].reverse();
                console.log(`Updated plays for UEL game ${game.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
              }
              
              // Also fetch Site API status for Europa League
              try {
                const siteApiUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/summary?event=${game.id}`;
                console.log(`[SITE API UEL] Fetching status from: ${siteApiUrl}`);
                const statusJson = await fetchJsonWithCache(siteApiUrl);
                if (statusJson && statusJson.header && statusJson.header.competitions && statusJson.header.competitions[0]) {
                  extraStatusForMerge = statusJson.header.competitions[0];
                  console.log(`[SITE API UEL] Fetched Site API status for UEL game ${game.id}`);
                } else {
                  console.log(`[SITE API UEL] No valid status data in response for game ${game.id}`);
                }
              } catch (statusErr) {
                console.log(`[SITE API UEL] Could not fetch Site API status for UEL game ${game.id}:`, statusErr?.message || statusErr);
              }

              // Also fetch individual competitor score data like initial load does
              if (game.competitions?.[0]?.competitors) {
                try {
                  console.log(`[SCORE FETCH UEL] Fetching individual competitor scores for game ${game.id}`);
                  const scorePromises = game.competitions[0].competitors.map(async (competitor, index) => {
                    if (competitor.score?.$ref) {
                      console.log(`[SCORE FETCH UEL] Fetching score data from: ${competitor.score.$ref}`);
                      const scoreData = await getEventData(competitor.score.$ref, true).catch(() => null);
                      return { index, scoreData };
                    }
                    return { index, scoreData: null };
                  });
                  const scoreResults = await Promise.all(scorePromises);
                  console.log(`[SCORE FETCH UEL] Retrieved ${scoreResults.filter(s => s.scoreData !== null).length} score updates for game ${game.id}`);
                  
                  // Store score data for later merging
                  extraScoreDataForMerge = scoreResults.filter(r => r.scoreData !== null);
                } catch (scoreErr) {
                  console.log(`[SCORE FETCH UEL] Error fetching competitor scores for game ${game.id}:`, scoreErr?.message || scoreErr);
                }
              }
            } else if (game.sport === 'Europa Conference League' || game.actualLeagueCode === 'uefa.europa.conf') {
              console.log(`[BRANCH DEBUG] Using Europa Conference League branch for game ${game.id}`);
              const playsResponseData = await fetchJsonWithCache(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.europa.conf/events/${game.id}/competitions/${game.id}/plays?lang=en&region=us&limit=1000`);
              if (playsResponseData.items && playsResponseData.items.length > 0) {
                playsData = [...playsResponseData.items].reverse();
                console.log(`Updated plays for UECL game ${game.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
              }
              
              // Also fetch Site API status for Europa Conference League
              try {
                const siteApiUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa.conf/summary?event=${game.id}`;
                console.log(`[SITE API UECL] Fetching status from: ${siteApiUrl}`);
                const statusJson = await fetchJsonWithCache(siteApiUrl);
                if (statusJson && statusJson.header && statusJson.header.competitions && statusJson.header.competitions[0]) {
                  extraStatusForMerge = statusJson.header.competitions[0];
                  console.log(`[SITE API UECL] Fetched Site API status for UECL game ${game.id}`);
                } else {
                  console.log(`[SITE API UECL] No valid status data in response for game ${game.id}`);
                }
              } catch (statusErr) {
                console.log(`[SITE API UECL] Could not fetch Site API status for UECL game ${game.id}:`, statusErr?.message || statusErr);
              }

              // Also fetch individual competitor score data like initial load does
              if (game.competitions?.[0]?.competitors) {
                try {
                  console.log(`[SCORE FETCH UECL] Fetching individual competitor scores for game ${game.id}`);
                  const scorePromises = game.competitions[0].competitors.map(async (competitor, index) => {
                    if (competitor.score?.$ref) {
                      console.log(`[SCORE FETCH UECL] Fetching score data from: ${competitor.score.$ref}`);
                      const scoreData = await getEventData(competitor.score.$ref, true).catch(() => null);
                      return { index, scoreData };
                    }
                    return { index, scoreData: null };
                  });
                  const scoreResults = await Promise.all(scorePromises);
                  console.log(`[SCORE FETCH UECL] Retrieved ${scoreResults.filter(s => s.scoreData !== null).length} score updates for game ${game.id}`);
                  
                  // Store score data for later merging
                  extraScoreDataForMerge = scoreResults.filter(r => r.scoreData !== null);
                } catch (scoreErr) {
                  console.log(`[SCORE FETCH UECL] Error fetching competitor scores for game ${game.id}:`, scoreErr?.message || scoreErr);
                }
              }
            } else if (game.sport === 'MLB' || game.actualLeagueCode === 'mlb') {
              // For MLB games, use the direct game link (statsapi) instead of ESPN plays endpoint
              console.log(`[DEBUG] Processing MLB game ${game.id}, eventLink: ${game.eventLink || 'MISSING'}`);
              if (game.eventLink) {
                console.log(`[DEBUG] Fetching MLB game data from: ${game.eventLink}`);
                const gameData = await getEventData(game.eventLink, true); // bypass gating for live updates
                console.log(`[DEBUG] MLB game data response:`, {
                  hasGameData: !!gameData,
                  hasLiveData: !!(gameData && gameData.liveData),
                  hasPlays: !!(gameData && gameData.liveData && gameData.liveData.plays),
                  hasAllPlays: !!(gameData && gameData.liveData && gameData.liveData.plays && gameData.liveData.plays.allPlays),
                  playsCount: gameData?.liveData?.plays?.allPlays?.length || 0
                });
                // If statsapi returned liveData, pull both plays and updated situation info
                if (gameData && gameData.liveData) {
                  const allPlays = gameData.liveData.plays?.allPlays;
                  if (Array.isArray(allPlays) && allPlays.length > 0) {
                    // Preserve the raw statsapi allPlays array (reversed) so the extractor
                    // that understands MLB shapes can use full play objects and descriptions.
                    playsData = [...allPlays].reverse();
                    console.log(`Updated plays for MLB game ${game.id} from statsapi, total plays: ${playsData.length}`);
                    // Log a sample of the most recent play keys to help debugging shape issues
                    const sample = playsData[0];
                    if (sample) {
                      console.log(`Sample MLB play keys for game ${game.id}:`, Object.keys(sample).slice(0,10));
                    }
                  } else {
                    console.log(`No plays data found in statsapi response for MLB game ${game.id}`);
                  }

                  // Build a normalized situation object from statsapi, preferring currentPlay.count
                  // for live balls/strikes/outs, with linescore as fallback. UI reads game.liveData.situation.
                  try {
                    const ls = gameData.liveData.linescore || {};
                    const currentPlay = gameData.liveData.plays?.currentPlay;
                    const currentCount = currentPlay?.count;
                    const matchup = currentPlay?.matchup || {};
                    
                    var newSituation = {
                      balls: currentCount?.balls ?? ls.balls ?? 0,
                      strikes: currentCount?.strikes ?? ls.strikes ?? 0,
                      outs: currentCount?.outs ?? ls.outs ?? 0,
                      inning: ls.currentInning || ls.inning || currentPlay?.about?.inning || 1,
                      isTopInning: (ls.inningState === 'Top') || (currentPlay?.about?.isTopInning === false ? false : true),
                      bases: {
                        first: !!matchup.postOnFirst,
                        second: !!matchup.postOnSecond,
                        third: !!matchup.postOnThird
                      }
                    };
                    
                    // Debug log the extracted situation values
                    console.log(`[SITUATION DEBUG] Game ${game.id}:`, {
                      fromCurrentPlay: currentCount ? `${currentCount.balls}-${currentCount.strikes}, ${currentCount.outs} outs` : 'null',
                      fromLinescore: ls ? `${ls.balls || 0}-${ls.strikes || 0}, ${ls.outs || 0} outs` : 'null',
                      finalSituation: `${newSituation.balls}-${newSituation.strikes}, ${newSituation.outs} outs, inning ${newSituation.inning}, top: ${newSituation.isTopInning}`,
                      basesFromMatchup: `1st: ${!!matchup.postOnFirst}, 2nd: ${!!matchup.postOnSecond}, 3rd: ${!!matchup.postOnThird}`,
                      basesFromLinescore: `1st: ${!!ls.offense?.first}, 2nd: ${!!ls.offense?.second}, 3rd: ${!!ls.offense?.third}`
                    });
                  } catch (e) {
                    // ignore building situation
                    var newSituation = null;
                    console.log(`[SITUATION DEBUG] Error building situation for game ${game.id}:`, e?.message || e);
                  }
                }
                // If we fetched plays but they lack usable description fields, don't overwrite
                // the existing playsData for this game (prevents losing rich descriptions).
                if (playsData && Array.isArray(playsData) && playsData.length > 0) {
                  const latest = playsData[0];
                  const hasDescription = (latest && (
                    (latest.result && latest.result.description) ||
                    latest.about && (latest.about.playText || latest.about.description) ||
                    latest.playText || latest.description ||
                    (Array.isArray(latest.playEvents) && latest.playEvents.some(ev => ev?.details?.description))
                  ));
                  if (!hasDescription && game.playsData && Array.isArray(game.playsData) && game.playsData.length > 0) {
                    console.log(`Fetched MLB plays for game ${game.id} lack descriptions; preserving existing playsData (${game.playsData.length} items)`);
                    playsData = game.playsData; // preserve previous rich plays
                  }
                }

                // For MLB games, handle both plays and situation updates here where gameData is available
                let updatedGame = game;
                
                // Update plays if changed
                if (playsData) {
                  const currentPlaysJson = JSON.stringify(game.playsData);
                  const newPlaysJson = JSON.stringify(playsData);
                  if (currentPlaysJson !== newPlaysJson) {
                    updatedGame = { ...updatedGame, playsData };
                  }
                }

                // Update scores from currentPlay if available
                if (gameData && gameData.liveData && gameData.liveData.plays && gameData.liveData.plays.currentPlay) {
                  const currentPlay = gameData.liveData.plays.currentPlay;
                  if (currentPlay.result && (currentPlay.result.awayScore !== undefined || currentPlay.result.homeScore !== undefined)) {
                    const updatedCompetitions = [...(updatedGame.competitions || [])];
                    if (updatedCompetitions[0] && updatedCompetitions[0].competitors) {
                      const updatedCompetitors = updatedCompetitions[0].competitors.map(competitor => {
                        if (competitor.homeAway === 'away' && currentPlay.result.awayScore !== undefined) {
                          return { ...competitor, score: String(currentPlay.result.awayScore) };
                        } else if (competitor.homeAway === 'home' && currentPlay.result.homeScore !== undefined) {
                          return { ...competitor, score: String(currentPlay.result.homeScore) };
                        }
                        return competitor;
                      });
                      
                      updatedCompetitions[0] = { ...updatedCompetitions[0], competitors: updatedCompetitors };
                      updatedGame = { ...updatedGame, competitions: updatedCompetitions };
                      
                      console.log(`[SCORE UPDATE] Game ${game.id} scores updated - Away: ${currentPlay.result.awayScore}, Home: ${currentPlay.result.homeScore}`);
                    }
                  }
                }

                // Update situation if changed (gameData is available here)
                if (typeof newSituation !== 'undefined') {
                  try {
                    const currentSituationJson = JSON.stringify((game.liveData && game.liveData.situation) || null);
                    const newSituationJson = JSON.stringify(newSituation);
                    if (currentSituationJson !== newSituationJson) {
                      const mergedLive = { ...(updatedGame.liveData || {}), situation: newSituation };
                      // Prefer the liveData.status from statsapi if available
                      if (gameData && gameData.liveData && gameData.liveData.status) mergedLive.status = gameData.liveData.status;
                      updatedGame = { ...updatedGame, liveData: mergedLive };
                      console.log(`[SITUATION UPDATE] Game ${game.id} situation changed - updating state`);
                    } else {
                      console.log(`[SITUATION UPDATE] Game ${game.id} situation unchanged - no state update needed`);
                    }
                  } catch (e) {
                    console.log(`[SITUATION UPDATE] Error comparing situation for game ${game.id}:`, e?.message || e);
                  }
                }

                return updatedGame;
              } else {
                console.log(`No eventLink available for MLB game ${game.id}, skipping plays update`);
              }
            } else if (game.actualLeagueCode === 'nfl') {
              // Handle NFL games with proper API
              console.log(`[BRANCH DEBUG] Using NFL branch for game ${game.id}`);
              console.log(`[LIVE UPDATE] Starting update for NFL game ${game.id}`);
              try {
                // Use the ESPN NFL summary API to get updated game data
                const nflSummaryUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${game.id}`;
                const updatedData = await fetchJsonWithCache(nflSummaryUrl, { bypassGating: true });

                // Also fetch drives (plays) so we can derive situation/play text reliably like GameDetails
                let drivesData = null;
                try {
                  drivesData = await NFLService.getDrives(game.id).catch(() => null);
                } catch (dErr) {
                  console.log(`[NFL DRIVES] Error fetching drives for ${game.id}:`, dErr?.message || dErr);
                }

                if (updatedData?.header?.competitions?.[0]) {
                  const competition = updatedData.header.competitions[0];
                  
                  // Create a new game object to ensure React detects changes
                  const updatedGame = { ...game };

                  // Update game status and scores
                  if (competition.status) {
                    updatedGame.status = competition.status.type?.description || game.status;
                    updatedGame.displayClock = competition.status.displayClock;
                    updatedGame.period = competition.status.period;
                  }

                  // Update team scores and colors
                  const homeTeam = competition.competitors?.find(c => c.homeAway === 'home');
                  const awayTeam = competition.competitors?.find(c => c.homeAway === 'away');

                  if (homeTeam && updatedGame.homeTeam) {
                    updatedGame.homeTeam = { ...updatedGame.homeTeam, score: homeTeam.score };
                    // Update team color if available
                    if (homeTeam.team?.color && !updatedGame.homeTeam.color) {
                      updatedGame.homeTeam.color = homeTeam.team.color;
                    }
                    // Ensure team object exists for color access
                    if (!updatedGame.homeTeam.team && homeTeam.team) {
                      updatedGame.homeTeam.team = homeTeam.team;
                    }
                  }
                  if (awayTeam && updatedGame.awayTeam) {
                    updatedGame.awayTeam = { ...updatedGame.awayTeam, score: awayTeam.score };
                    // Update team color if available
                    if (awayTeam.team?.color && !updatedGame.awayTeam.color) {
                      updatedGame.awayTeam.color = awayTeam.team.color;
                    }
                    // Ensure team object exists for color access
                    if (!updatedGame.awayTeam.team && awayTeam.team) {
                      updatedGame.awayTeam.team = awayTeam.team;
                    }
                  }

                  // Update situation data
                  if (competition.situation) {
                    updatedGame.situation = {
                      possession: competition.situation.possession,
                      down: competition.situation.down,
                      distance: competition.situation.distance,
                      yardLine: competition.situation.yardLine,
                      possessionText: competition.situation.possessionText,
                      shortDownDistanceText: competition.situation.shortDownDistanceText
                    };
                    console.log(`[NFL LIVE UPDATE] Updated situation for game ${updatedGame.id}:`, updatedGame.situation);
                  }

                  // Merge drives/plays into game so downstream rendering can use them directly
                  if (drivesData && Array.isArray(drivesData) && drivesData.length) {
                    // attach raw drives and also set playsData similar to other branches
                    updatedGame.drives = drivesData;
                    // find most recent drive with plays
                    const driveWithPlays = [...drivesData].reverse().find(d => Array.isArray(d.plays) && d.plays.length) || drivesData[drivesData.length - 1];
                    updatedGame.playsData = driveWithPlays && Array.isArray(driveWithPlays.plays) ? [...driveWithPlays.plays].reverse() : null;
                    console.log(`[NFL DRIVES] Attached ${drivesData.length} drives for game ${updatedGame.id}, plays in most recent drive: ${updatedGame.playsData ? updatedGame.playsData.length : 0}`);
                    
                    // Always try to update situation with latest data from drives
                    const currentDrive = drivesData.find(drive => !drive.end?.text && drive.result !== 'End of Game');
                    if (currentDrive && currentDrive.plays && currentDrive.plays.length) {
                      const lastPlay = currentDrive.plays[currentDrive.plays.length - 1];
                      if (lastPlay && lastPlay.end) {
                        updatedGame.situation = updatedGame.situation || {};
                        // Always update with latest data from drives
                        if (lastPlay.end.shortDownDistanceText) {
                          console.log(`[NFL SITUATION UPDATE] Updating shortDownDistanceText from '${updatedGame.situation.shortDownDistanceText}' to '${lastPlay.end.shortDownDistanceText}'`);
                          updatedGame.situation.shortDownDistanceText = lastPlay.end.shortDownDistanceText;
                        }
                        if (lastPlay.end.possessionText) {
                          console.log(`[NFL SITUATION UPDATE] Updating possessionText from '${updatedGame.situation.possessionText}' to '${lastPlay.end.possessionText}'`);
                          updatedGame.situation.possessionText = lastPlay.end.possessionText;
                        }
                        // Also update other situation fields if available
                        if (lastPlay.end.down) {
                          updatedGame.situation.down = lastPlay.end.down;
                        }
                        if (lastPlay.end.distance) {
                          updatedGame.situation.distance = lastPlay.end.distance;
                        }
                        if (lastPlay.end.yardLine) {
                          updatedGame.situation.yardLine = lastPlay.end.yardLine;
                        }
                        console.log(`[NFL SITUATION] Updated situation from drives for game ${updatedGame.id}:`, updatedGame.situation);
                      }
                    }
                  }

                  console.log(`Updated NFL game ${updatedGame.id} with fresh data`);
                  return updatedGame; // Return the updated game object
                } else {
                  console.log(`Failed to fetch updated NFL data for game ${game.id}`);
                }
              } catch (nflUpdateError) {
                console.log(`Error updating NFL game ${game.id}:`, nflUpdateError.message);
              }
              return game; // Return game object even if update failed
            } else if (game.actualLeagueCode && game.actualLeagueCode !== 'nfl') {
              // Handle domestic leagues using the actualLeagueCode (skip NFL as it's not soccer)
              console.log(`[BRANCH DEBUG] Using generic actualLeagueCode branch for game ${game.id}`);
              console.log(`[LIVE UPDATE] Starting update for ${game.actualLeagueCode} game ${game.id}`);
              const playsResponseData = await fetchJsonWithCache(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${game.actualLeagueCode}/events/${game.id}/competitions/${game.id}/plays?lang=en&region=us&limit=1000`);
                if (playsResponseData?.items && playsResponseData.items.length > 0) {
                playsData = [...playsResponseData.items].reverse();
                console.log(`Updated plays for ${game.actualLeagueCode} game ${game.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
              } else {
                console.log(`Failed to fetch plays for ${game.actualLeagueCode} game ${game.id}`);
              }

              // Also attempt to fetch the Site API summary to get authoritative status/score/displayClock
              try {
                const leagueCode = game.actualLeagueCode;
                const siteApiUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueCode}/summary?event=${game.id}`;
                console.log(`[SITE API] Attempting to fetch status for ${leagueCode} game ${game.id} from: ${siteApiUrl}`);
                const statusJson = await fetchJsonWithCache(siteApiUrl);
                console.log(`[SITE API] Response for ${game.id}:`, { hasData: !!statusJson, hasHeader: !!statusJson?.header, hasCompetitions: !!statusJson?.header?.competitions, hasComp0: !!statusJson?.header?.competitions?.[0] });
                if (statusJson && statusJson.header && statusJson.header.competitions && statusJson.header.competitions[0]) {
                  // Attach to a temporary variable so we can merge after plays/updatedGame is constructed
                  extraStatusForMerge = statusJson.header.competitions[0];
                  console.log(`Fetched Site API status for ${leagueCode} game ${game.id}`);
                } else {
                  console.log(`[SITE API] No valid status data in response for ${game.id}`);
                }
              } catch (statusErr) {
                console.log(`Could not fetch Site API status for ${game.id} (${game.actualLeagueCode}):`, statusErr?.message || statusErr);
              }

              // Also fetch individual competitor score data like initial load does
              if (game.competitions?.[0]?.competitors) {
                try {
                  console.log(`[SCORE FETCH] Fetching individual competitor scores for ${game.actualLeagueCode} game ${game.id}`);
                  const scorePromises = game.competitions[0].competitors.map(async (competitor, index) => {
                    if (competitor.score?.$ref) {
                      console.log(`[SCORE FETCH] Fetching score data from: ${competitor.score.$ref}`);
                      const scoreData = await getEventData(competitor.score.$ref, true).catch(() => null);
                      return { index, scoreData };
                    }
                    return { index, scoreData: null };
                  });
                  const scoreResults = await Promise.all(scorePromises);
                  console.log(`[SCORE FETCH] Retrieved ${scoreResults.filter(s => s.scoreData !== null).length} score updates for game ${game.id}`);
                  
                  // Store score data for later merging
                  extraScoreDataForMerge = scoreResults.filter(r => r.scoreData !== null);
                } catch (scoreErr) {
                  console.log(`[SCORE FETCH] Error fetching competitor scores for game ${game.id}:`, scoreErr?.message || scoreErr);
                }
              }
            }
            // Add more sports here as needed
            
            // Decide whether we need to update this game object in state.
            // We update if playsData changed (for non-MLB games).
            // MLB games are handled completely within their branch above.
                let updatedGame = game;
            if (playsData) {
              const currentPlaysJson = JSON.stringify(game.playsData);
              const newPlaysJson = JSON.stringify(playsData);
              if (currentPlaysJson !== newPlaysJson) {
                updatedGame = { ...updatedGame, playsData };
              }
            }

                // If we fetched site API status for this league, merge status and scores
                if (extraStatusForMerge && updatedGame.competitions && updatedGame.competitions[0]) {
                  try {
                    console.log(`[STATUS MERGE] Starting merge for game ${game.id}, extraStatusForMerge has status:`, !!extraStatusForMerge.status);
                    const updatedCompetitions = (updatedGame.competitions || []).map(c => ({ ...c }));
                    // Merge status object
                    updatedCompetitions[0].status = extraStatusForMerge.status || updatedCompetitions[0].status;
                    // Merge competitor scores from extraStatusForMerge where available
                    if (Array.isArray(extraStatusForMerge.competitors) && Array.isArray(updatedCompetitions[0].competitors)) {
                      const scoreMap = new Map();
                      for (const hc of extraStatusForMerge.competitors) {
                        const tid = hc.team?.id || hc.team?.teamId || null;
                        if (tid != null) scoreMap.set(String(tid), hc.score);
                      }
                      updatedCompetitions[0].competitors = updatedCompetitions[0].competitors.map(comp => {
                        try {
                          const compTeamId = comp.team?.id || comp.team?.teamId || comp.id || (comp.$$ref && String(comp.$$ref).match(/teams\/(\d+)/)?.[1]);
                          const s = compTeamId ? scoreMap.get(String(compTeamId)) : undefined;
                          if (s !== undefined && s !== null) return { ...comp, score: String(s) };
                        } catch (e) {}
                        return comp;
                      });
                    }
                    updatedGame = { ...updatedGame, competitions: updatedCompetitions, gameDataWithStatus: { header: { competitions: [ extraStatusForMerge ] } } };
                    console.log(`[STATUS MERGE] Merged Site API status for game ${game.id}, displayClock: ${extraStatusForMerge.status?.displayClock}`);
                  } catch (e) {
                    console.log('Error merging Site API status into game object:', e);
                  }
                } else {
                  console.log(`[STATUS MERGE] Skipping merge for game ${game.id} - extraStatusForMerge: ${!!extraStatusForMerge}, competitions: ${!!updatedGame.competitions}, comp[0]: ${!!updatedGame.competitions?.[0]}`);
                }

                // Merge individual competitor score data if available
                if (extraScoreDataForMerge && extraScoreDataForMerge.length > 0 && updatedGame.competitions && updatedGame.competitions[0]) {
                  try {
                    console.log(`[SCORE MERGE] Merging ${extraScoreDataForMerge.length} individual score updates for game ${game.id}`);
                    const updatedCompetitions = [...(updatedGame.competitions || [])];
                    if (updatedCompetitions[0]) {
                      const updatedCompetitors = [...(updatedCompetitions[0].competitors || [])];
                      extraScoreDataForMerge.forEach(({ index, scoreData }) => {
                        if (scoreData && updatedCompetitors[index]) {
                          updatedCompetitors[index] = { ...updatedCompetitors[index], score: scoreData };
                          console.log(`[SCORE MERGE] Updated competitor ${index} score for game ${game.id}:`, scoreData);
                        }
                      });
                      updatedCompetitions[0] = { ...updatedCompetitions[0], competitors: updatedCompetitors };
                      updatedGame = { ...updatedGame, competitions: updatedCompetitions };
                    }
                  } catch (e) {
                    console.log('Error merging individual score data into game object:', e);
                  }
                } else {
                  console.log(`[SCORE MERGE] Skipping score merge for game ${game.id} - extraScoreDataForMerge: ${extraScoreDataForMerge ? extraScoreDataForMerge.length : 'null'} items`);
                }

            return updatedGame;
          } catch (error) {
            console.error(`Error updating plays for game ${game.id}:`, error);
            return game;
          }
        })
      );

      // Only update state if there were actual changes
      const baseGames = currentGamesSnapshot || favoriteGames;
      const extractCompetitionsScoreSnapshot = (g) => {
        try {
          if (!g || !g.competitions || !g.competitions[0]) return null;
          const comps = g.competitions[0];
          const competitors = (comps.competitors || []).map(c => ({ id: c.team?.id || c.id || null, score: c.score }));
          const status = comps.status || null;
          return { competitors, status };
        } catch (e) {
          return null;
        }
      };

      const hasChanges = updatedGames.some((game, index) => {
        const prev = baseGames[index] || {};
        const currentPlays = JSON.stringify(prev?.playsData || null);
        const newPlays = JSON.stringify(game.playsData || null);
        if (currentPlays !== newPlays) return true;
        
        // Check both game.situation (NFL) and game.liveData.situation (MLB)
        const currentSituationNFL = JSON.stringify(prev?.situation || null);
        const newSituationNFL = JSON.stringify(game?.situation || null);
        if (currentSituationNFL !== newSituationNFL) return true;
        
        const currentSituationMLB = JSON.stringify(prev?.liveData?.situation || null);
        const newSituationMLB = JSON.stringify(game?.liveData?.situation || null);
        if (currentSituationMLB !== newSituationMLB) return true;

        // Compare competition scores/status
        const prevCompSnap = JSON.stringify(extractCompetitionsScoreSnapshot(prev));
        const newCompSnap = JSON.stringify(extractCompetitionsScoreSnapshot(game));
        if (prevCompSnap !== newCompSnap) return true;

        return false;
      });
      
      if (hasChanges) {
        console.log('Plays data changed, updating state');
        console.log(`[STATE UPDATE] Before setFavoriteGames - game ${updatedGames[0]?.id} situation:`, updatedGames[0]?.situation);
        setFavoriteGames(updatedGames);
      } else {
        console.log('No changes in plays data, skipping state update');
      }
    } catch (error) {
      console.error('Error updating live games plays:', error);
    }
  };

  // Function to fetch game data directly using event link
  const getEventData = async (url, bypassGating = false) => {
    if (!url) return null;
    // Resolve known relative MLB feed links to full statsapi URL
    try {
      if (typeof url === 'string' && url.startsWith('/api/v1.1/game/')) {
        url = `https://statsapi.mlb.com${url}`;
      }
    } catch (e) {
      // ignore
    }
    return await fetchJsonWithCache(url, { bypassGating });
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
      console.log(`[DIRECT FETCH] Live game update for ${teamName} - bypassing poll gating`);

      // Check if the current game is from today (with wider range for favorited teams)
      const { todayStart, todayEnd } = getTodayDateRange();
      const gameDate = currentGameData.gameDate ? new Date(currentGameData.gameDate) : null;
      if (!gameDate) {
        console.log(`No valid gameDate for ${teamName} in currentGameData, skipping direct fetch`);
        return null;
      }
      
      // For favorited teams we want to include games within the standard 2AM NY -> 2AM NY window.
      // Previously this incorrectly added 24 hours to the end which caused tomorrow's games to be
      // included. Keep the range bounded to todayEnd to avoid pulling in games for the following day.
      const extendedTodayEnd = new Date(todayEnd.getTime()); // don't expand beyond next 2AM NY

      if (gameDate < todayStart || gameDate >= extendedTodayEnd) {
        console.log(`[DATE FILTER] Game for ${teamName} excluded - gameDate: ${gameDate.toISOString()}, todayStart: ${todayStart.toISOString()}, extendedTodayEnd: ${extendedTodayEnd.toISOString()}`);
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
        // Resolve the eventLink to a full statsapi URL if it's a relative path
        let resolvedMlbEventLink = currentGameData.eventLink;
        try {
          if (typeof resolvedMlbEventLink === 'string' && resolvedMlbEventLink.startsWith('/api/v1.1/game/')) {
            resolvedMlbEventLink = `https://statsapi.mlb.com${resolvedMlbEventLink}`;
          }
        } catch (e) {
          // ignore
        }

        const convertedGame = {
          id: currentGameData.eventId,
          sport: 'MLB',
          actualLeagueCode: 'mlb',
          date: currentGameData.gameDate,
          venue: {
            name: mlbData.gameData?.venue?.name,
            fullName: mlbData.gameData?.venue?.name
          },
          // Include resolved direct link for MLB so callers can use it for live updates
          eventLink: resolvedMlbEventLink,
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
      
      // Handle NFL games differently - use ESPN API format for proper situation data
      const isNFL = teamSport === 'nfl' || currentGameData.competition === 'nfl';
      if (isNFL && currentGameData.eventId) {
        console.log(`Fetching NFL game using ESPN API for ${teamName} with eventId: ${currentGameData.eventId}`);
        const nflUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${currentGameData.eventId}`;
        
        try {
          // Use longer timeout for NFL API calls and bypass poll gating
          const eventData = await fetchJsonWithCache(nflUrl, { timeout: 8000, bypassGating: true });
          
          if (!eventData) {
            console.log(`Failed to fetch NFL game data for ${teamName} - no data returned`);
            return null;
          }
          
          console.log(`[DEBUG] NFL API response structure for ${teamName}:`, {
            hasHeader: !!eventData.header,
            hasCompetitions: !!eventData.header?.competitions,
            competitionsLength: eventData.header?.competitions?.length,
            hasDirectCompetitions: !!eventData.competitions,
            directCompetitionsLength: eventData.competitions?.length,
            topLevelKeys: Object.keys(eventData).slice(0, 10)
          });
          
          // The ESPN summary API has a different structure than the scoreboard API
          // Extract the competition data from the header
          const competition = eventData.header?.competitions?.[0];
          if (!competition) {
            console.log(`No competition data found in NFL API response for ${teamName}`);
            return null;
          }
          
          // Build the game object manually from the summary API structure
          const homeTeam = competition.competitors?.find(c => c.homeAway === 'home');
          const awayTeam = competition.competitors?.find(c => c.homeAway === 'away');
          
          if (!homeTeam || !awayTeam) {
            console.log(`Missing team data in NFL API response for ${teamName}`);
            return null;
          }
          
          // Extract situation data for live games
          console.log(`[NFL SITUATION EXTRACT] Checking situation data for ${teamName}:`, {
            competitionKeys: competition ? Object.keys(competition) : [],
            hasSituation: !!competition.situation,
            situationData: competition.situation,
            status: competition.status
          });
          
          // Try to extract situation using NFLService like GameDetails does
          let situation = null;
          try {
            // Use NFLService.extractGameSituation with the event data we have
            const gameForExtraction = {
              competitions: [competition]
            };
            situation = NFLService.extractGameSituation(gameForExtraction);
            console.log(`[NFL SITUATION EXTRACT] NFLService.extractGameSituation result:`, situation);
          } catch (error) {
            console.log(`[NFL SITUATION EXTRACT] Error using NFLService.extractGameSituation:`, error);
          }

          // Fallback to direct extraction if NFLService didn't work
          if (!situation && competition.situation) {
            situation = {
              possession: competition.situation.possession,
              down: competition.situation.down,
              distance: competition.situation.distance,
              yardLine: competition.situation.yardLine,
              possessionText: competition.situation.possessionText,
              shortDownDistanceText: competition.situation.shortDownDistanceText
            };
          }

          // If we still don't have down/distance (common with the summary endpoint), try to derive it from drives/plays
          const needsPlayExtraction = !situation || (!situation.down && !situation.shortDownDistanceText && !situation.possessionText);
          let initialDrivesData = null; // Store drives data for immediate attachment
          if (needsPlayExtraction) {
            try {
              const eventIdForPlays = competition.id || currentGameData.eventId;
              if (eventIdForPlays) {
                // Prefer the drives endpoint (same as GameDetails) which includes drives and plays refs
                const drives = await NFLService.getDrives(eventIdForPlays);
                initialDrivesData = drives; // Store for later attachment to game object
                if (drives && drives.length) {
                  // Find the current drive in progress, otherwise fall back to the last drive
                  let currentDrive = drives.find(d => !d.end?.text && d.result !== 'End of Game');
                  if (!currentDrive) currentDrive = drives[drives.length - 1] || drives[0];

                  // Gather plays from the current drive or from the most recent drive that has plays
                  let plays = Array.isArray(currentDrive?.plays) ? currentDrive.plays : [];
                  if (!plays.length) {
                    const driveWithPlays = [...drives].reverse().find(d => Array.isArray(d.plays) && d.plays.length);
                    if (driveWithPlays) plays = driveWithPlays.plays;
                  }

                  if (plays && plays.length) {
                    // Find the most recent play that has an end object
                    const playsWithEnd = plays.filter(p => p && p.end);
                    const sorted = playsWithEnd.sort((a, b) => {
                      const seqA = parseInt(a.sequenceNumber) || 0;
                      const seqB = parseInt(b.sequenceNumber) || 0;
                      return seqA - seqB;
                    });
                    const mostRecentPlay = sorted.length ? sorted[sorted.length - 1] : playsWithEnd[0] || null;
                    if (mostRecentPlay && mostRecentPlay.end) {
                      const end = mostRecentPlay.end;

                      // Helper: format ordinal (1 -> 1st etc.)
                      const getOrdinal = (num) => {
                        if (num === null || num === undefined) return String(num);
                        const n = parseInt(num, 10);
                        const s = ['th','st','nd','rd'];
                        const v = n % 100;
                        return n + (s[(v-20)%10] || s[v] || s[0]);
                      };

                      const down = end.down || (end.down?.number) || null;
                      let distance = null;
                      if (end.distance && typeof end.distance === 'object') {
                        distance = end.distance.yards !== undefined ? end.distance.yards : null;
                      } else if (typeof end.distance === 'number') {
                        distance = end.distance;
                      }

                      const shortDownDistanceText = end.shortDownDistanceText || (down ? `${getOrdinal(down)} & ${distance !== null ? distance : ''}`.trim() : null);
                      const possessionText = end.possessionText || null;

                      // yardLine sometimes appears on end.possessionYardLine or end.yardLine or in possessionText
                      let yardLine = null;
                      if (end.possessionYardLine !== undefined && end.possessionYardLine !== null) yardLine = end.possessionYardLine;
                      else if (end.yardLine !== undefined && end.yardLine !== null) yardLine = end.yardLine;
                      else if (possessionText) {
                        // possessionText often already contains team + number (e.g., "ARI 12")
                        yardLine = possessionText;
                      }

                      situation = situation || {};
                      // set extracted values if missing
                      if (!situation.shortDownDistanceText && shortDownDistanceText) situation.shortDownDistanceText = shortDownDistanceText;
                      if (!situation.down && down) situation.down = down;
                      if ((situation.distance === undefined || situation.distance === null) && distance !== null) situation.distance = distance;
                      if (!situation.possessionText && possessionText) situation.possessionText = possessionText;
                      if ((situation.yardLine === undefined || situation.yardLine === null) && yardLine !== null) situation.yardLine = yardLine;
                      console.log(`[NFL SITUATION EXTRACT] Derived from plays for ${teamName}:`, { shortDownDistanceText: situation.shortDownDistanceText, possessionText: situation.possessionText, down: situation.down, distance: situation.distance, yardLine: situation.yardLine });
                    }
                  }
                }
              }
            } catch (e) {
              console.log(`[NFL SITUATION EXTRACT] Error extracting from plays:`, e);
            }
          }
          
          // Extract venue information (try multiple sources like GameDetailsScreen)
          const venue = eventData.gameInfo?.venue?.fullName || 
                       eventData.header?.competitions?.[0]?.venue?.fullName || 
                       competition.venue?.fullName || 
                       eventData.header?.venue?.fullName;
          
          // Create the formatted game object
          const formattedGame = {
            id: competition.id || currentGameData.eventId,
            date: competition.date,
            status: competition.status?.type?.description || 'Scheduled',
            period: competition.status?.period,
            displayClock: competition.status?.displayClock,
            venue: venue,
            competitions: [{
              id: competition.id,
              date: competition.date,
              venue: { fullName: venue },
              competitors: [
                {
                  id: awayTeam.id,
                  homeAway: 'away',
                  team: {
                    id: awayTeam.team?.id || awayTeam.id,
                    abbreviation: awayTeam.team?.abbreviation,
                    displayName: awayTeam.team?.displayName,
                    name: awayTeam.team?.name,
                    logos: awayTeam.team?.logos || [{
                      href: `https://a.espncdn.com/i/teamlogos/nfl/500/${awayTeam.team?.abbreviation?.toLowerCase()}.png`
                    }]
                  },
                  score: awayTeam.score
                },
                {
                  id: homeTeam.id,
                  homeAway: 'home',
                  team: {
                    id: homeTeam.team?.id || homeTeam.id,
                    abbreviation: homeTeam.team?.abbreviation,
                    displayName: homeTeam.team?.displayName,
                    name: homeTeam.team?.name,
                    logos: homeTeam.team?.logos || [{
                      href: `https://a.espncdn.com/i/teamlogos/nfl/500/${homeTeam.team?.abbreviation?.toLowerCase()}.png`
                    }]
                  },
                  score: homeTeam.score
                }
              ],
              status: competition.status,
              situation: situation
            }],
            homeTeam: {
              id: homeTeam.team?.id || homeTeam.id,
              abbreviation: homeTeam.team?.abbreviation,
              displayName: homeTeam.team?.displayName,
              score: homeTeam.score,
              logos: homeTeam.team?.logos || [{
                href: `https://a.espncdn.com/i/teamlogos/nfl/500/${homeTeam.team?.abbreviation?.toLowerCase()}.png`
              }]
            },
            awayTeam: {
              id: awayTeam.team?.id || awayTeam.id,
              abbreviation: awayTeam.team?.abbreviation,
              displayName: awayTeam.team?.displayName,
              score: awayTeam.score,
              logos: awayTeam.team?.logos || [{
                href: `https://a.espncdn.com/i/teamlogos/nfl/500/${awayTeam.team?.abbreviation?.toLowerCase()}.png`
              }]
            },
            situation: situation
          };
          
          // Attach drives data if we fetched it during initial creation
          if (initialDrivesData && Array.isArray(initialDrivesData)) {
            formattedGame.drives = initialDrivesData;
            // Also set playsData similar to updateLiveGamesPlays
            const driveWithPlays = [...initialDrivesData].reverse().find(d => Array.isArray(d.plays) && d.plays.length) || initialDrivesData[initialDrivesData.length - 1];
            formattedGame.playsData = driveWithPlays && Array.isArray(driveWithPlays.plays) ? [...driveWithPlays.plays].reverse() : null;
            
            // Extract team colors from drives data and update homeTeam/awayTeam objects
            const homeTeamId = String(formattedGame.homeTeam?.id || '');
            const awayTeamId = String(formattedGame.awayTeam?.id || '');
            
            initialDrivesData.forEach(drive => {
              if (drive.team && drive.team.id) {
                const driveTeamId = String(drive.team.id);
                if (driveTeamId === homeTeamId && drive.team.color && !formattedGame.homeTeam.team?.color) {
                  // Update home team with color information
                  formattedGame.homeTeam = {
                    ...formattedGame.homeTeam,
                    team: {
                      ...formattedGame.homeTeam.team,
                      color: drive.team.color
                    }
                  };
                  console.log(`[NFL INITIAL] Added home team color: ${drive.team.color}`);
                } else if (driveTeamId === awayTeamId && drive.team.color && !formattedGame.awayTeam.team?.color) {
                  // Update away team with color information
                  formattedGame.awayTeam = {
                    ...formattedGame.awayTeam,
                    team: {
                      ...formattedGame.awayTeam.team,
                      color: drive.team.color
                    }
                  };
                  console.log(`[NFL INITIAL] Added away team color: ${drive.team.color}`);
                }
              }
            });
            
            console.log(`[NFL INITIAL] Attached ${initialDrivesData.length} drives during initial creation, plays in most recent drive: ${formattedGame.playsData ? formattedGame.playsData.length : 0}`);
          }
          
          // Add additional metadata
          const convertedGame = {
            ...formattedGame,
            favoriteTeam: team,
            sport: 'NFL',
            actualLeagueCode: 'nfl',
            fromDirectLink: true,
            eventLink: nflUrl
          };
          
          console.log(`Successfully converted NFL game ${convertedGame.id} for ${teamName}`, {
            hasHomeTeam: !!convertedGame.homeTeam,
            hasAwayTeam: !!convertedGame.awayTeam,
            hasSituation: !!convertedGame.situation,
            situationKeys: convertedGame.situation ? Object.keys(convertedGame.situation) : [],
            venue: venue,
            homeScore: convertedGame.homeTeam?.score,
            awayScore: convertedGame.awayTeam?.score,
            status: convertedGame.status
          });
          return convertedGame;
        } catch (nflError) {
          console.log(`Error fetching NFL game data for ${teamName}:`, nflError.message || nflError);
          console.log(`Error stack:`, nflError.stack);
          return null;
        }
      }
      
  // For non-MLB games (or if MLB branch didn't run), use the existing helper which caches and is null-safe
      // Resolve the URL first so we can save it in the return object
      let resolvedEventLink = currentGameData.eventLink;
      try {
        if (typeof resolvedEventLink === 'string' && resolvedEventLink.startsWith('/api/v1.1/game/')) {
          resolvedEventLink = `https://statsapi.mlb.com${resolvedEventLink}`;
        }
      } catch (e) {
        // ignore
      }
      console.log(`[DEBUG] Resolved eventLink for ${teamName}: ${resolvedEventLink}`);
      
      const eventData = await getEventData(currentGameData.eventLink, true); // Bypass gating for direct game links
      if (!eventData) {
        console.log(`No event JSON returned for ${teamName} from link: ${currentGameData.eventLink}`);
        return null;
      }
      
      // Fetch team and score data for competitors if needed
      if (eventData.competitions?.[0]?.competitors) {
        const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
          try {
            const [teamData, scoreData] = await Promise.all([
              competitor.team?.$ref ? getEventData(competitor.team.$ref, true).catch(() => null) : null,
              competitor.score?.$ref ? getEventData(competitor.score.$ref, true).catch(() => null) : null
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

      const returnObject = {
        ...eventData,
        favoriteTeam: team,
        sport: team.sport,
        eventLink: resolvedEventLink, // Use the resolved full URL instead of relative path
        // Prefer the inferred league code from the event link, fall back to provided competition or team.sport
        actualLeagueCode: inferredLeagueCode || currentGameData.competition || team.sport,
        gameDataWithStatus: gameDataWithStatus,
        playsData: playsData,
        fromDirectLink: true // Flag to indicate this came from direct link
      };
      
      console.log(`[DEBUG] Returning game object for ${teamName}, eventLink: ${returnObject.eventLink}`);
      return returnObject;
      
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
      
      // Use the same date format as team page - YYYY-MM-DD for today
      // Use EST hours to match the getTodayDateRange function
      const today = new Date();
      const estOffset = -4 * 60; // EST is UTC-4 during daylight time
      const todayEST = new Date(today.getTime() + estOffset * 60 * 1000);
      const currentHourEST = todayEST.getUTCHours();
      
      let gameDay;
      if (currentHourEST < 2) {
        gameDay = new Date(todayEST.getTime() - 24 * 60 * 60 * 1000); // Yesterday
      } else {
        gameDay = new Date(todayEST); // Today
      }
      
      const todayDateStr = gameDay.getFullYear() + '-' + 
                          String(gameDay.getMonth() + 1).padStart(2, '0') + '-' + 
                          String(gameDay.getDate()).padStart(2, '0');
      
      console.log(`MLB API: Using date ${todayDateStr} for team ${teamName} (${team.teamId})`);
      
      // Convert ESPN ID to MLB ID for API calls
      const mlbApiTeamId = getAPITeamId(team.teamId, 'mlb');
      console.log(`MLB API: Converting ESPN ID ${team.teamId} to MLB API ID ${mlbApiTeamId}`);
      
      // Try to get today's MLB games for this team using the same format as team page
      const mlbScheduleUrl = `https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&startDate=${todayDateStr}&endDate=${todayDateStr}&teamId=${mlbApiTeamId}&hydrate=team,linescore,decisions`;
      console.log(`MLB API URL: ${mlbScheduleUrl}`);
      
      const mlbSchedule = await fetchJsonWithCache(mlbScheduleUrl);
      console.log(`MLB schedule response:`, mlbSchedule);
      
      if (mlbSchedule?.dates?.[0]?.games?.length > 0) {
        const game = mlbSchedule.dates[0].games[0];
        console.log(`Found today's MLB game:`, game.gamePk, game.teams.home.team.name, 'vs', game.teams.away.team.name);
        
        // Fetch detailed game data using the game ID
        const gameDetailUrl = `https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events/${game.gamePk}?lang=en&region=us`;
        const gameDetailData = await fetchJsonWithCache(gameDetailUrl);
        
        // Fetch live data from ESPN's live API (similar to GameDetailsScreen)
        let liveData = null;
        try {
          const liveUrl = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${game.gamePk}`;
          liveData = await fetchJsonWithCache(liveUrl);
          console.log(`Successfully fetched live MLB data for game ${game.gamePk}`);
        } catch (liveError) {
          console.warn(`Could not fetch live MLB data for game ${game.gamePk}:`, liveError);
        }

        return {
          ...gameDetailData,
          favoriteTeam: team,
          sport: 'MLB',
          actualLeagueCode: 'mlb',
          eventLink: `https://statsapi.mlb.com/api/v1.1/game/${game.gamePk}/feed/live`,
          liveData,
          mlbGameData: game // Use the MLB API game data directly
        };
      }

      console.log(`No today's game found for ${teamName}`);
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
    } else if (actualCompetition === 'nfl' || game.sport === 'NFL' || game.sport === 'nfl') {
      // NFL uses the same generic GameDetails screen in the app stack - pass sport 'nfl'
      navigation.navigate('GameDetails', {
        gameId: game.id,
        sport: 'nfl',
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
          
          // For MLB, check if we also have direct access to allPlays for more complete data
          const directAllPlays = game.liveData?.plays?.allPlays || game.liveData?.allPlays || game.mlbGameData?.liveData?.plays?.allPlays;
          const lastFromAllPlays = (directAllPlays && Array.isArray(directAllPlays) && directAllPlays.length > 0) ? directAllPlays[directAllPlays.length - 1] : null;
          
          // Use the more complete data source if available, otherwise fall back to mostRecent
          const playToAnalyze = lastFromAllPlays || mostRecent;
          
          try {
            // Priority order for MLB:
            // 1. currentPlay raw result description
            if (nonEmpty(currentPlayObj?.result?.description)) {
              mlbText = String(currentPlayObj.result.description).trim();
              console.log(`MLB play text (playsData) from currentPlay result description: ${mlbText}`);
            }
            // 2. playToAnalyze raw result description  
            else if (nonEmpty(playToAnalyze?.result?.description)) {
              mlbText = String(playToAnalyze.result.description).trim();
              console.log(`MLB play text (playsData) from ${lastFromAllPlays ? 'allPlays' : 'playsData'} result description: ${mlbText}`);
            }
            // 3. current play play text (about.playText or about.description)
            else if (nonEmpty(currentPlayObj?.about?.playText) || nonEmpty(currentPlayObj?.about?.description)) {
              mlbText = String(nonEmpty(currentPlayObj.about?.playText) || nonEmpty(currentPlayObj.about?.description)).trim();
              console.log(`MLB play text (playsData) from currentPlay playText: ${mlbText}`);
            }
            // 3b. playToAnalyze play text (about.playText or about.description)
            else if (nonEmpty(playToAnalyze?.about?.playText) || nonEmpty(playToAnalyze?.about?.description)) {
              mlbText = String(nonEmpty(playToAnalyze.about?.playText) || nonEmpty(playToAnalyze.about?.description)).trim();
              console.log(`MLB play text (playsData) from ${lastFromAllPlays ? 'allPlays' : 'playsData'} playText: ${mlbText}`);
            }
            // 4. Try to extract from playEvents with built logic
            else if (Array.isArray(playToAnalyze?.playEvents) && playToAnalyze.playEvents.length > 0) {
              const filtered = playToAnalyze.playEvents
                .filter(ev => ev && ev.details)
                .filter(ev => {
                  const evType = String(ev.details.eventType || ev.type || '').toLowerCase();
                  return !(evType.includes('game_advisory') || (ev.details && String(ev.details.description || '').toLowerCase().includes('status change')));
                });

              if (filtered.length > 0) {
                const lastEv = filtered[filtered.length - 1];
                const built = buildMLBPlayTextFromEvent(lastEv, playToAnalyze);
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
              const batterName = playToAnalyze?.matchup?.batter?.fullName || currentPlayObj?.matchup?.batter?.fullName || '';
              const pitcherName = playToAnalyze?.matchup?.pitcher?.fullName || currentPlayObj?.matchup?.pitcher?.fullName || '';
              if (batterName || pitcherName) {
                mlbText = `Matchup: ${batterName}${batterName && pitcherName ? ' vs ' : ''}${pitcherName}`.trim();
                console.log(`MLB play text (playsData) from matchup (fallback): ${mlbText}`);
              }
            }

            // Final fallback to any remaining fields
            if (!nonEmpty(mlbText)) {
              mlbText = nonEmpty(playToAnalyze?.playDescription) || nonEmpty(playToAnalyze?.playText) || nonEmpty(playToAnalyze?.result?.event) || nonEmpty(playToAnalyze?.result?.eventType) || '';
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

    // Helper function to get ESPN team ID for favorites system (using new mapping system)
    const getMLBTeamId = (espnTeam) => {
      const rawTeamId = espnTeam?.team?.id || espnTeam?.id;
      if (!rawTeamId) return null;
      
      const teamIdStr = String(rawTeamId);
      
      // First check if this is already an ESPN ID (most common case now)
      // If it's an ESPN ID for MLB, return it as-is for favorites
      if (convertMLBIdToESPNId(teamIdStr)) {
        // This is an MLB ID, convert to ESPN ID for consistency
        return convertMLBIdToESPNId(teamIdStr);
      }
      
      // Otherwise, assume it's already an ESPN ID or unknown
      return teamIdStr;
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

    // Debug: log what the UI is actually reading from liveData.situation
    if (gameStatus.isLive && liveData.situation) {
      console.log(`[UI RENDER DEBUG] Game ${gameId} rendering with liveData.situation:`, {
        balls: liveData.situation.balls,
        strikes: liveData.situation.strikes,
        outs: liveData.situation.outs,
        inning: liveData.situation.inning,
        isTopInning: liveData.situation.isTopInning,
        bases: liveData.situation.bases
      });
    }

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
            <Text allowFontScaling={false} style={[styles.liveInningText, { color: colors.text }]}>{inningText}</Text>
            <Text allowFontScaling={false} style={[styles.liveCountText, { color: colors.text }]}>{ballsStrikesText}</Text>
            {basesDisplay()}
            <Text allowFontScaling={false} style={[styles.liveOutsText, { color: colors.text }]}>{outsText}</Text>
          </View>
        );
      } else if (gameStatus.isPre) {
        // Scheduled game - show date and time
        return (
          <View style={styles.gameMiddleSection}>
            <Text allowFontScaling={false} style={[styles.gameStatusText, { color: colors.text }]}>
              {gameStatus.text}
            </Text>
            <Text allowFontScaling={false} style={[styles.gameTimeText, { color: colors.text }]}>
              {gameStatus.time}
            </Text>
            <Text allowFontScaling={false} style={[styles.gameDateText, { color: colors.text }]}>
              {gameStatus.detail}
            </Text>
          </View>
        );
      } else {
        // Finished game - show final score and status
        return (
          <View style={styles.gameMiddleSection}>
            <Text allowFontScaling={false} style={[styles.gameStatusText, { color: colors.text }]}>
              {gameStatus.text}
            </Text>
            {gameStatus.detail && (
              <Text allowFontScaling={false} style={[styles.gameDetailText, { color: colors.text }]}>
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
          <Text allowFontScaling={false} style={[styles.leagueText, { color: colors.primary }]}>
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
                        <Text allowFontScaling={false} style={[styles.teamScore, { color: gameStatus.isPost ? (awayIsWinner ? colors.primary : (awayIsLoser ? '#999' : theme.text)) : theme.text }]}>
                          {awayScoreDisplay}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
            <Text allowFontScaling={false} style={[styles.teamAbbreviation, { 
              color: awayIsLoser ? '#999' : (isFavorite(getMLBTeamId(awayTeam), 'mlb') ? colors.primary : theme.text) 
            }]}>
              {isFavorite(getMLBTeamId(awayTeam), 'mlb') ? '★ ' : ''}{getMLBTeamAbbreviation(awayTeam)}
            </Text>
          </View>
          
          {/* Status Section (Center) */}
          <View style={styles.statusSection}>
            <Text allowFontScaling={false} style={[styles.gameStatus, { color: gameStatus.isLive ? '#ff4444' : colors.primary , marginBottom: gameStatus.isLive ? -7.5 : 4}]}>
              {gameStatus.isLive ? '' : gameStatus.text}
            </Text>
            {gameStatus.isLive && liveData.situation ? (
              // Live MLB game - show inning, balls/strikes, bases, outs
              <>
                <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.text }]}>
                  {`${liveData.situation.isTopInning ? 'Top' : 'Bot'} ${liveData.situation.inning || 1}`} • {`${liveData.situation.balls || 0}-${liveData.situation.strikes || 0}`}
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
                <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                  {`Outs: ${liveData.situation.outs || 0}`}
                </Text>
              </>
            ) : gameStatus.isLive ? (
              // Live game but no detailed situation data
              <>
                <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.text }]}>
                  {gameStatus.time || 'Live'}
                </Text>
                <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                  {gameStatus.detail || 'In Progress'}
                </Text>
              </>
            ) : (
              // Scheduled or finished games
              <>
                <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                  {gameStatus.detail}
                </Text>
                {gameStatus.time && (
                  <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary }]}>
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
                    <Text allowFontScaling={false} style={[styles.teamScore, { color: gameStatus.isPost ? (homeIsWinner ? colors.primary : (homeIsLoser ? '#999' : theme.text)) : theme.text }]}>
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
            <Text allowFontScaling={false} style={[styles.teamAbbreviation, { 
              color: homeIsLoser ? '#999' : (isFavorite(getMLBTeamId(homeTeam), 'mlb') ? colors.primary : theme.text) 
            }]}>
              {isFavorite(getMLBTeamId(homeTeam), 'mlb') ? '★ ' : ''}{getMLBTeamAbbreviation(homeTeam)}
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
                  <Text allowFontScaling={false} style={[styles.livePlayText, { color: theme.text }]} numberOfLines={2}>{candidate}</Text>
                );
              }

              return <Text allowFontScaling={false} style={[styles.venueText, { color: theme.textSecondary }]}></Text>;
            })()
          ) : (
            <Text allowFontScaling={false} style={[styles.venueText, { color: theme.textSecondary }]}>
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

  const renderNFLGameCard = (game) => {
    const homeTeam = game.homeTeam;
    const awayTeam = game.awayTeam;
    const homeScore = homeTeam?.score || '0';
    const awayScore = awayTeam?.score || '0';
    // Debugging: inspect runtime game object shape to troubleshoot live detection
    const DEBUG_FAV_NFL = true;
    if (DEBUG_FAV_NFL) {
      try {
        const keys = Object.keys(game || {});
        const compKeys = game?.competitions && game.competitions.length > 0 ? Object.keys(game.competitions[0]) : null;
        console.log(`FAV_NFL DEBUG - id=${game?.id} keys=${JSON.stringify(keys)} competitionsKeys=${JSON.stringify(compKeys)} status_comp=${JSON.stringify(game?.competitions?.[0]?.status)} gameDataWithStatus=${Boolean(game?.gameDataWithStatus)} liveData=${Boolean(game?.liveData)} plays=${Boolean(game?.plays)}`);
      } catch (e) {
        console.log('FAV_NFL DEBUG - error serializing game', e);
      }
    }
    
    // Robust NFL status & situation detection (read from multiple shapes)
    const getMatchStatusForNFL = (g) => {
      const competition = g.competitions?.[0];
      const statusFromCompetition = competition?.status;
      const statusFromSiteAPI = g.gameDataWithStatus?.header?.competitions?.[0]?.status || statusFromCompetition;

      let state = statusFromSiteAPI?.type?.state || statusFromCompetition?.type?.state;
      // Normalize some common strings
      if (!state && typeof g.status === 'string') {
        const s = String(g.status).toLowerCase();
        if (s.includes('final') || s.includes('post')) state = 'post';
        else if (s.includes('in') || s.includes('progress')) state = 'in';
        else state = 'pre';
      }

      // Fallback to computeMatchFlags if the site API doesn't indicate live
      const fallback = computeMatchFlags(g);
      const isLive = (state === 'in') || fallback.isLive;
      const isPost = (state === 'post') || fallback.isPost || fallback.isFinished;
      const isPre = !isLive && !isPost;

      // displayClock/period extraction
      const displayClock = statusFromSiteAPI?.displayClock || statusFromCompetition?.displayClock || g.displayClock || competition?.displayClock || '';
      const period = statusFromSiteAPI?.period || statusFromCompetition?.period || g.period || competition?.period || null;

      // Build readable detail (quarter/OT)
      let detail = '';
      if (isLive && period != null) {
        if (period <= 4) {
          const quarters = ['1st', '2nd', '3rd', '4th'];
          detail = quarters[period - 1] || `Q${period}`;
        } else {
          detail = 'OT';
        }
      } else if (isPre) {
        detail = '';
      }

      return {
        isLive,
        isPre,
        isPost,
        text: isLive ? 'Live' : (isPost ? 'Final' : 'Scheduled'),
        time: displayClock || '',
        detail
      };
    };

  const matchStatus = getMatchStatusForNFL(game);
  // Local aliases for legacy variable names used elsewhere in this function
  const isLive = Boolean(matchStatus?.isLive);
  const isScheduled = Boolean(matchStatus?.isPre);
  const isFinished = Boolean(matchStatus?.isPost);
  const gameStatus = matchStatus; // keep a reference named gameStatus for existing usages

    // Helper function to get ordinal numbers
    const getOrdinal = (num) => {
      const suffixes = ['th', 'st', 'nd', 'rd'];
      const v = num % 100;
      return num + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
    };

    // Extract live situation from multiple possible fields - recalculate on every render
    let possessionInfo = null;
    if (matchStatus.isLive) {
      const situation = game.situation ||
                        game.gameDataWithStatus?.header?.competitions?.[0]?.situation ||
                        game.competitions?.[0]?.situation ||
                        game.liveData?.gamepackageJSON?.situation || null;

      console.log(`[NFL POSSESSION CALC] Game ${game.id} situation calc - timestamp: ${Date.now()}`, {
        gameHasSituation: !!game.situation,
        situationData: game.situation,
        gameDataHasSituation: !!game.gameDataWithStatus?.header?.competitions?.[0]?.situation,
        competitionHasSituation: !!game.competitions?.[0]?.situation,
        liveDataHasSituation: !!game.liveData?.gamepackageJSON?.situation,
        situationFound: !!situation
      });

      if (situation) {
        let possessionTeam = '';
        
        // First, try to determine possession from the most recent play in drives data
        if (game.drives && Array.isArray(game.drives)) {
          // Find the most recent drive with plays (may or may not be ended)
          const mostRecentDriveWithPlays = [...game.drives].reverse().find(d => d.plays && Array.isArray(d.plays) && d.plays.length > 0);
          
          if (mostRecentDriveWithPlays && mostRecentDriveWithPlays.plays.length > 0) {
            // Get the most recent play from that drive
            const mostRecentPlay = mostRecentDriveWithPlays.plays[mostRecentDriveWithPlays.plays.length - 1];
            
            if (mostRecentPlay && mostRecentPlay.end) {
              // Use the play's end state for the most current possession info
              if (mostRecentPlay.end.team && mostRecentPlay.end.team.id) {
                const playTeamId = String(mostRecentPlay.end.team.id);
                const homeId = String(homeTeam?.id || homeTeam?.team?.id || '');
                const awayId = String(awayTeam?.id || awayTeam?.team?.id || '');
                
                if (playTeamId === homeId) {
                  possessionTeam = homeTeam?.abbreviation || homeTeam?.team?.abbreviation || '';
                } else if (playTeamId === awayId) {
                  possessionTeam = awayTeam?.abbreviation || awayTeam?.team?.abbreviation || '';
                }
                
                console.log(`[NFL POSSESSION DEBUG] From most recent play: playTeamId="${playTeamId}", homeId="${homeId}", awayId="${awayId}", possessionTeam="${possessionTeam}"`);
              }
              
              // Also update the situation object with fresh data from the most recent play
              if (mostRecentPlay.end.shortDownDistanceText && mostRecentPlay.end.shortDownDistanceText !== situation.shortDownDistanceText) {
                console.log(`[NFL POSSESSION DEBUG] Updating shortDownDistanceText from "${situation.shortDownDistanceText}" to "${mostRecentPlay.end.shortDownDistanceText}"`);
                situation.shortDownDistanceText = mostRecentPlay.end.shortDownDistanceText;
              }
              if (mostRecentPlay.end.possessionText && mostRecentPlay.end.possessionText !== situation.possessionText) {
                console.log(`[NFL POSSESSION DEBUG] Updating possessionText from "${situation.possessionText}" to "${mostRecentPlay.end.possessionText}"`);
                situation.possessionText = mostRecentPlay.end.possessionText;
              }
              if (mostRecentPlay.end.down && mostRecentPlay.end.down !== situation.down) {
                console.log(`[NFL POSSESSION DEBUG] Updating down from ${situation.down} to ${mostRecentPlay.end.down}`);
                situation.down = mostRecentPlay.end.down;
              }
              if (mostRecentPlay.end.distance !== undefined && mostRecentPlay.end.distance !== situation.distance) {
                console.log(`[NFL POSSESSION DEBUG] Updating distance from ${situation.distance} to ${mostRecentPlay.end.distance}`);
                situation.distance = mostRecentPlay.end.distance;
              }
            }
          }
          
          // Fallback: Find the current drive (no end text and not ended) if the above didn't work
          if (!possessionTeam) {
            const currentDrive = game.drives.find(drive => !drive.end?.text && drive.result !== 'End of Game');
            if (currentDrive && currentDrive.team && currentDrive.team.id) {
              const driveTeamId = String(currentDrive.team.id);
              const homeId = String(homeTeam?.id || homeTeam?.team?.id || '');
              const awayId = String(awayTeam?.id || awayTeam?.team?.id || '');
              
              if (driveTeamId === homeId) {
                possessionTeam = homeTeam?.abbreviation || homeTeam?.team?.abbreviation || '';
              } else if (driveTeamId === awayId) {
                possessionTeam = awayTeam?.abbreviation || awayTeam?.team?.abbreviation || '';
              }
              
              console.log(`[NFL POSSESSION DEBUG] From current drive fallback: driveTeamId="${driveTeamId}", homeId="${homeId}", awayId="${awayId}", possessionTeam="${possessionTeam}"`);
            }
          }
        }
        
        // Fallback to situation.possession if drives didn't work
        if (!possessionTeam && situation.possession) {
          // Match possession ID against team IDs (more robust matching)
          const possessionId = String(situation.possession);
          const homeId = String(homeTeam?.id || homeTeam?.team?.id || '');
          const awayId = String(awayTeam?.id || awayTeam?.team?.id || '');
          
          console.log(`[NFL POSSESSION DEBUG] Checking possession: possessionId="${possessionId}", homeId="${homeId}" (${homeTeam?.abbreviation}), awayId="${awayId}" (${awayTeam?.abbreviation})`);
          
          if (possessionId === homeId) {
            possessionTeam = homeTeam?.abbreviation || homeTeam?.team?.abbreviation || '';
          } else if (possessionId === awayId) {
            possessionTeam = awayTeam?.abbreviation || awayTeam?.team?.abbreviation || '';
          } else {
            // Try partial matching in case IDs are formatted differently
            if (homeId.includes(possessionId) || possessionId.includes(homeId)) {
              possessionTeam = homeTeam?.abbreviation || homeTeam?.team?.abbreviation || '';
            } else if (awayId.includes(possessionId) || possessionId.includes(awayId)) {
              possessionTeam = awayTeam?.abbreviation || awayTeam?.team?.abbreviation || '';
            }
          }
        }
        
        // If possession team still not found, try to extract from possessionText
        if (!possessionTeam && situation.possessionText) {
          // Try to extract team abbreviation from possessionText like "KC 28"
          const textMatch = situation.possessionText.match(/^([A-Z]{2,3})\s+\d+$/);
          if (textMatch) {
            possessionTeam = textMatch[1];
          }
        }
        
        // If still no possession team but we have down/distance info, 
        // assume the team with better field position or default to home team
        if (!possessionTeam && (situation.down || situation.shortDownDistanceText)) {
          // For now, we need a smarter way to determine possession
          // Looking at the console log: KC is the team that should have possession
          // but situation.possession might not be set correctly
          
          // Try to infer from context - if we have down/distance, someone has possession
          // This is a fallback and should be improved with better data
          if (situation.yardLine !== undefined) {
            // If yard line is closer to opponent's endzone, likely that team has possession
            if (situation.yardLine > 50) {
              possessionTeam = awayTeam?.abbreviation || awayTeam?.team?.abbreviation || '';
            } else if (situation.yardLine < 50) {
              possessionTeam = homeTeam?.abbreviation || homeTeam?.team?.abbreviation || '';
            } else {
              // At midfield - harder to determine, use other context
              // For KC vs NYG game where KC should have possession, default to away team for now
              possessionTeam = awayTeam?.abbreviation || awayTeam?.team?.abbreviation || '';
            }
          }
          
          console.log(`[NFL POSSESSION DEBUG] Fallback possession determination: possessionTeam="${possessionTeam}"`);
        }

        let downAndDistance = '';
        if (situation.shortDownDistanceText) {
          // Use the pre-formatted text from ESPN (e.g., "1st & 10")
          downAndDistance = situation.shortDownDistanceText;
        } else if (situation.down && situation.distance !== undefined) {
          // Fallback to manual formatting
          downAndDistance = situation.distance === 0 ? `${getOrdinal(situation.down)} & Goal` : `${getOrdinal(situation.down)} & ${situation.distance}`;
        }

        let yardLine = '';
        if (situation.possessionText) {
          // Use the pre-formatted possession text from ESPN (e.g., "KC 28")
          yardLine = situation.possessionText;
        } else if (situation.yardLine !== undefined && situation.yardLine !== null && possessionTeam) {
          // Construct possession text from components
          yardLine = `${possessionTeam} ${situation.yardLine}`;
        } else if (possessionTeam && situation.yardLine !== undefined) {
          // Even if yardLine is 50, show it if we have possession team
          yardLine = `${possessionTeam} ${situation.yardLine}`;
        }

        console.log(`[NFL POSSESSION DEBUG] Final possession info: possessionTeam="${possessionTeam}", downAndDistance="${downAndDistance}", yardLine="${yardLine}"`);
        console.log(`[NFL POSSESSION DEBUG] Raw situation data:`, situation);

        // Validate the data before storing - filter out invalid cases
        const hasValidDown = situation.down && situation.down > 0 && !downAndDistance.includes('-1th');
        const hasValidYardLine = yardLine && yardLine.trim() !== '50' && !yardLine.includes(' 50');
        
        possessionInfo = {
          team: possessionTeam,
          downAndDistance: hasValidDown ? downAndDistance : 'Kickoff',
          yardLine: hasValidYardLine ? yardLine : '',
          raw: situation
        };
        
        console.log(`[NFL POSSESSION DEBUG] Final possessionInfo for game ${game.id}:`, possessionInfo);
      } else {
        console.log(`[NFL SITUATION DEBUG] No situation found in game object, situation data not available in summary API`);
        // The ESPN summary API doesn't include situation data for this game
        // TODO: Consider fetching from drives/plays API like GameDetails does
        possessionInfo = null;
      }
    }
    
  // Get team logo URLs
    const getNFLTeamLogoUrl = (team) => {
      const teamAbbr = team.abbreviation?.toLowerCase();
      if (teamAbbr) {
        return isDarkMode
          ? `https://a.espncdn.com/i/teamlogos/nfl/500-dark/${teamAbbr}.png`
          : `https://a.espncdn.com/i/teamlogos/nfl/500/${teamAbbr}.png`;
      }
      return null;
    };
    
    // Extract most recent play for live games using NFL-specific extraction
    let recentPlay = '';
    let playTeamId = null;
    let playText = '';
    
    if (isLive) {
      try {
        // Try to get plays from game object first (similar to extractMostRecentPlay)
        let plays = [];
        
        // Check various possible locations for plays data
        if (game.plays && Array.isArray(game.plays)) {
          plays = game.plays;
        } else if (game.liveData?.plays) {
          plays = game.liveData.plays;
        } else if (game.gameDataWithStatus?.plays) {
          plays = game.gameDataWithStatus.plays;
        } else if (game.gamepackageJSON?.drives) {
          // Extract plays from drives like NFLService.getPlays()
          game.gamepackageJSON.drives.forEach(drive => {
            if (drive.plays) {
              plays.push(...drive.plays);
            }
          });
        } else if (game.drives) {
          // Try alternate drives structure
          game.drives.forEach(drive => {
            if (drive.plays && Array.isArray(drive.plays)) {
              plays.push(...drive.plays);
            }
          });
        }
        
        if (plays.length > 0) {
          // Sort plays by sequence if available
          plays.sort((a, b) => {
            const seqA = parseInt(a.sequenceNumber) || 0;
            const seqB = parseInt(b.sequenceNumber) || 0;
            return seqA - seqB;
          });
          
          const lastPlay = plays[plays.length - 1];
          playText = lastPlay.text || lastPlay.description || '';
          
          // Ensure playText is always a string
          if (typeof playText !== 'string') {
            playText = '';
          }
          
          // Try to determine which team made the play
          if (lastPlay.team && lastPlay.team.id) {
            playTeamId = String(lastPlay.team.id);
          } else if (lastPlay.teamId) {
            playTeamId = String(lastPlay.teamId);
          }
          
          // Truncate if too long
          if (playText && playText.length > 100) {
            playText = playText.substring(0, 97) + '...';
          }
          
          recentPlay = playText;
        } else {
          // Fallback: try to fetch recent plays using NFLService.getPlays if needed in the future
        }
      } catch (error) {
        // Error extracting play data, silently continue
      }
    }
    
    // Determine winner/loser for finished games (use MLB pattern)
    const homeScoreNum = parseInt(String(homeScore)) || 0;
    const awayScoreNum = parseInt(String(awayScore)) || 0;
    
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
    
    // Format game status
    let gameStatusText = game.status || 'Scheduled';
    if (isLive) {
      gameStatusText = 'Live';
      if (game.displayClock) {
        gameStatusText = `${game.displayClock}`;
        if (game.period) {
          const quarters = ['1st', '2nd', '3rd', '4th'];
          if (game.period <= 4) {
            gameStatusText += ` - ${quarters[game.period - 1]}`;
          } else {
            gameStatusText += ` OT`;
          }
        }
      }
    } else if (isFinished) {
      gameStatusText = 'Final';
    }
    
    // Format date/time
    const gameDate = new Date(game.date || game.gameDate);
    const formatGameDate = (date) => date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
    const formatGameTime = (date) => date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    });
    
    // Determine play/team in possession and apply card border like MLB cards
    // Prefer drives-derived possession (current drive team), then possessionInfo.team (abbreviation),
    // then fall back to last-play teamId when present.
    let cardBorderStyle = {};
    // Compute whether the possession belongs to the home team (true/false/null)
    let possessionIsHome = null;
    if (matchStatus.isLive) {
      // Drives (preferred): look for current drive team id
      if (game.drives && Array.isArray(game.drives)) {
        const currentDrive = game.drives.find(drive => !drive.end?.text && drive.result !== 'End of Game');
        if (currentDrive && currentDrive.team && currentDrive.team.id) {
          const driveTeamId = String(currentDrive.team.id);
          const homeId = String(homeTeam?.id || homeTeam?.team?.id || '');
          const awayId = String(awayTeam?.id || awayTeam?.team?.id || '');
          if (driveTeamId === homeId) possessionIsHome = true;
          else if (driveTeamId === awayId) possessionIsHome = false;
        }
      }

      // Next preference: possessionInfo.team (abbreviation)
      if (possessionIsHome === null && possessionInfo && possessionInfo.team) {
        const poss = String(possessionInfo.team).toUpperCase();
        const homeAbbr = (homeTeam?.abbreviation || homeTeam?.team?.abbreviation || '').toUpperCase();
        const awayAbbr = (awayTeam?.abbreviation || awayTeam?.team?.abbreviation || '').toUpperCase();
        if (poss && homeAbbr && poss === homeAbbr) possessionIsHome = true;
        else if (poss && awayAbbr && poss === awayAbbr) possessionIsHome = false;
      }

      // Fallback: use last-play team id if we still don't know possession
      let isHomeTeamPlay = null;
      if (playTeamId) {
        isHomeTeamPlay = String(playTeamId) === String(homeTeam?.id) || String(playTeamId) === String(homeTeam?.team?.id);
      }

      // Get team colors for border styling
      let homeColor = theme.surface;
      let awayColor = theme.surface;
      try {
        // Try multiple possible paths for team colors
        const homeColorValue = homeTeam?.team?.color || homeTeam?.color || game.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home')?.team?.color;
        const awayColorValue = awayTeam?.team?.color || awayTeam?.color || game.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away')?.team?.color;
        
        if (homeColorValue) {
          homeColor = homeColorValue.startsWith('#') ? homeColorValue : `#${homeColorValue}`;
        }
        if (awayColorValue) {
          awayColor = awayColorValue.startsWith('#') ? awayColorValue : `#${awayColorValue}`;
        }
        
        console.log(`[NFL COLOR DEBUG] Game ${game.id} colors: home=${homeColor}, away=${awayColor}, homeColorValue=${homeColorValue}, awayColorValue=${awayColorValue}`);
      } catch (e) {
        console.log(`[NFL COLOR DEBUG] Error extracting colors:`, e);
      }

      // Decide which side to color: possessionIsHome (preferred), otherwise isHomeTeamPlay
      const useHome = possessionIsHome !== null ? possessionIsHome : (isHomeTeamPlay === true);
      if (useHome === true) {
        cardBorderStyle = {
          borderRightColor: homeColor,
          borderRightWidth: 8,
          borderLeftColor: theme.border,
          borderLeftWidth: 1,
        };
      } else if (useHome === false) {
        cardBorderStyle = {
          borderLeftColor: awayColor,
          borderLeftWidth: 8,
          borderRightColor: theme.border,
          borderRightWidth: 1,
        };
      } else if (isHomeTeamPlay === true) {
        // Last-resort: if we had a play team but couldn't map possession, use play team
        cardBorderStyle = {
          borderRightColor: homeColor,
          borderRightWidth: 8,
          borderLeftColor: theme.border,
          borderLeftWidth: 1,
        };
      } else if (isHomeTeamPlay === false) {
        cardBorderStyle = {
          borderLeftColor: awayColor,
          borderLeftWidth: 8,
          borderRightColor: theme.border,
          borderRightWidth: 1,
        };
      }
    }
    
    return (
      <TouchableOpacity 
        key={`${game.id}-${possessionInfo?.team || 'no-team'}-${possessionInfo?.downAndDistance || 'no-down'}-${possessionInfo?.yardLine || 'no-yard'}-${game.situation?.shortDownDistanceText || 'no-short'}-${game.situation?.possessionText || 'no-poss'}`}
        style={[styles.gameCard, { 
          backgroundColor: theme.surface, 
          borderColor: theme.border,
          borderTopColor: theme.border,
          borderBottomColor: theme.border,
        }, cardBorderStyle]}
        onPress={() => handleGamePress(game)}
        activeOpacity={0.7}
      >
        {/* League Header */}
        <View style={[styles.leagueHeader, { 
          backgroundColor: theme.surfaceSecondary 
        }]}>
          <Text allowFontScaling={false} style={[styles.leagueText, { 
            color: colors.primary 
          }]}>
            NFL
          </Text>
        </View>
        
        {/* Main Game Content */}
        <View style={styles.matchContent}>
          {/* Away Team */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoRow}>
              <Image
                style={[styles.teamLogo, awayIsLoser && styles.losingTeamLogo]}
                source={{
                  uri: isDarkMode
                    ? `https://a.espncdn.com/i/teamlogos/nfl/500-dark/${awayTeam.abbreviation?.toLowerCase()}.png`
                    : `https://a.espncdn.com/i/teamlogos/nfl/500/${awayTeam.abbreviation?.toLowerCase()}.png`
                }}
                onError={() => {
                  // Fallback to the other mode on error
                  console.log(`Logo error for ${awayTeam.abbreviation}, trying fallback`);
                }}
              />
              {!isScheduled && (
                <View style={styles.scoreContainer}>
                  <Text allowFontScaling={false} style={[styles.teamScore, {
                    color: gameStatus.isPost ? (awayIsWinner ? colors.primary : (awayIsLoser ? '#999' : theme.text)) : theme.text
                  }]}>
                    {awayScore}
                  </Text>
                </View>
              )}
            </View>
            <Text allowFontScaling={false} style={[styles.teamAbbreviation, {
              color: isFavorite(awayTeam.id, 'nfl') ? colors.primary : (awayIsLoser ? '#999' : theme.text)
            }]}>
              {isFavorite(awayTeam.id, 'nfl') ? '★ ' : ''}{awayTeam.abbreviation}
            </Text>
          </View>
          
          {/* Status/Live Info Section */}
          <View style={styles.statusSection}>
            <Text allowFontScaling={false} style={[styles.gameStatus, {
              color: colors.primary
            }]}>
              {gameStatusText}
            </Text>
            
            {/* Live game situation info: show down/distance and yard line like GameDetails screen */}
            {isLive ? (
              <View style={{ alignItems: 'center', marginTop: 4 }}>
                {/* Primary line: down & distance (like "1st & 10") - only show if valid */}
                {possessionInfo?.downAndDistance ? (
                  <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary, fontWeight: '600' }]}>
                    {possessionInfo.downAndDistance}
                  </Text>
                ) : (
                  <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary, fontWeight: '600' }]}>
                    {matchStatus.time && matchStatus.detail ? `${matchStatus.time} - ${matchStatus.detail}` : 
                     matchStatus.time ? matchStatus.time : 
                     matchStatus.detail ? matchStatus.detail : 
                     'Live'}
                  </Text>
                )}

                {/* Secondary line: yard line with possession arrow (like "◀ ARI 24") - only show if valid */}
                {possessionInfo?.yardLine && possessionInfo?.team ? (
                  <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                    {possessionInfo.team === awayTeam?.abbreviation ? `◀ ${possessionInfo.yardLine}` : `${possessionInfo.yardLine} ▶`}
                  </Text>
                ) : possessionInfo?.yardLine ? (
                  <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                    {possessionInfo.yardLine}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={{ alignItems: 'center', marginTop: 4 }}>
                <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                  {formatGameDate(gameDate)}
                </Text>
                <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                  {formatGameTime(gameDate)} EST
                </Text>
              </View>
            )}
          </View>
          
          {/* Home Team */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoRow}>
              {!isScheduled && (
                <View style={styles.scoreContainer}>
                  <Text allowFontScaling={false} style={[styles.teamScore, {
                    color: gameStatus.isPost ? (homeIsWinner ? colors.primary : (homeIsLoser ? '#999' : theme.text)) : theme.text
                  }]}>
                    {homeScore}
                  </Text>
                </View>
              )}
              <Image
                style={[styles.teamLogo, homeIsLoser && styles.losingTeamLogo]}
                source={{
                  uri: isDarkMode
                    ? `https://a.espncdn.com/i/teamlogos/nfl/500-dark/${homeTeam.abbreviation?.toLowerCase()}.png`
                    : `https://a.espncdn.com/i/teamlogos/nfl/500/${homeTeam.abbreviation?.toLowerCase()}.png`
                }}
                onError={() => {
                  // Fallback to the other mode on error
                  console.log(`Logo error for ${homeTeam.abbreviation}, trying fallback`);
                }}
              />
            </View>
            <Text allowFontScaling={false} style={[styles.teamAbbreviation, {
              color: isFavorite(homeTeam.id, 'nfl') ? colors.primary : (homeIsLoser ? '#999' : theme.text)
            }]}>
              {isFavorite(homeTeam.id, 'nfl') ? '★ ' : ''}{homeTeam.abbreviation}
            </Text>
          </View>
        </View>
        
        {/* Venue Section - Replace with play description for live games like MLB */}
        <View style={styles.venueSection}>
          {isLive && playText ? (
            <Text allowFontScaling={false} style={[styles.livePlayText, { color: theme.text }]} numberOfLines={2}>
              {playText}
            </Text>
          ) : (
            <Text allowFontScaling={false} style={[styles.venueText, { color: theme.textSecondary }]}>
              {game.venue || 'TBD Stadium'}
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

    // Map league code to sport name for favorites
    const getSportFromLeagueCode = (leagueCode) => {
      if (!leagueCode) return 'soccer'; // default fallback
      const code = leagueCode.toLowerCase();
      if (code.includes('premier') || code.includes('eng.1')) return 'premier league';
      if (code.includes('esp.1') || code.includes('laliga')) return 'la liga';
      if (code.includes('ita.1') || code.includes('serie')) return 'serie a';
      if (code.includes('ger.1') || code.includes('bundesliga')) return 'bundesliga';
      if (code.includes('fra.1') || code.includes('ligue')) return 'ligue 1';
      if (code.includes('uefa.champions')) return 'uefa champions';
      if (code.includes('uefa.europa') && !code.includes('conf')) return 'uefa europa';
      if (code.includes('uefa.europa.conf')) return 'uefa europa conf';
      return 'soccer'; // fallback
    };

    const sportName = getSportFromLeagueCode(game.actualLeagueCode);

    const gameDate = new Date(game.date);
    
    // Use gameDate directly since formatGameTime/formatGameDate handle timezone conversion
    const estDate = gameDate;
    
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
          <Text allowFontScaling={false} style={[styles.livePlayText, { color: theme.textSecondary }]} numberOfLines={2}>
            {playText}
          </Text>
        );
      }
      console.log(`No current play for game ${game.id}, showing fallback`);
      return <Text allowFontScaling={false} style={[styles.venueText, { color: theme.textSecondary }]}>Live</Text>;
    };

    // Determine game status using actual game status data (like scoreboard screens)
    const getMatchStatus = () => {
      // Try to get status from Site API data first (like Game Details screen)
      const statusFromSiteAPI = game.gameDataWithStatus?.header?.competitions?.[0]?.status;
      console.log(`[STATUS READ] Game ${game.id} - statusFromSiteAPI found: ${!!statusFromSiteAPI}, displayClock: ${statusFromSiteAPI?.displayClock}`);
      
      if (statusFromSiteAPI) {
        const state = statusFromSiteAPI.type?.state;
        
        console.log(`Using Site API status for game ${game.id}:`, {
          state,
          displayClock: statusFromSiteAPI.displayClock,
          period: statusFromSiteAPI.period,
          typeDescription: statusFromSiteAPI.type?.description
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
      const directLink = game.eventLink ? `, Direct Link: ${game.eventLink}` : ', Direct Link: None';
      console.log(`Game ${game.id} (${game.sport || 'Unknown'}) Status - Live: ${isLive}, Scheduled: ${isScheduled}, Finished: ${isFinished}, Start Time: ${gameStartTime} EST${directLink}`);
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

    // Check if this is an NFL game and render it with special styling
    if (game.sport === 'NFL' || game.actualLeagueCode === 'nfl') {
      return renderNFLGameCard(game);
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
          <Text allowFontScaling={false} style={[styles.leagueText, { color: colors.primary }]}>
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
                    <Text allowFontScaling={false} style={[styles.teamScore, { 
                      color: matchStatus.isPost && homeIsWinner ? colors.primary : 
                             homeIsLoser ? '#999' : theme.text 
                    }]}>
                      {homeScore}
                    </Text>
                    {homeShootoutScore && (
                      <Text allowFontScaling={false} style={[
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
            <Text allowFontScaling={false} style={[styles.teamAbbreviation, { 
              color: homeIsLoser ? '#999' : 
                     isFavorite(homeTeam.team?.id, sportName) ? colors.primary : theme.text 
            }]}>
              {isFavorite(homeTeam.team?.id, sportName) ? '★ ' : ''}{homeTeam.team?.abbreviation || homeTeam.team?.shortDisplayName || 'TBD'}
            </Text>
          </View>
          
          {/* Status Section */}
          <View style={styles.statusSection}>
            <Text allowFontScaling={false} style={[styles.gameStatus, { color: matchStatus.isLive ? '#ff4444' : colors.primary }]}>
              {matchStatus.text}
            </Text>
            {matchStatus.isLive ? (
              // For live games, show current time and half
              <>
                <Text allowFontScaling={false} style={[styles.gameDateTime, { color: matchStatus.isLive ? theme.text : theme.textSecondary }]}>
                  {matchStatus.time || 'Current'}
                </Text>
                <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                  {matchStatus.detail || 'Live'}
                </Text>
              </>
            ) : (
              // For scheduled and finished games, show date and time
              <>
                <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                  {matchStatus.detail || formatGameDate(gameDate)}
                </Text>
                {matchStatus.time && (
                  <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary }]}>
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
                      <Text allowFontScaling={false} style={[
                        styles.shootoutSuperscript, 
                        { color: awayIsLoser ? '#999' : colors.primary }
                      ]}>
                        ({awayShootoutScore})
                      </Text>
                    )}
                    <Text allowFontScaling={false} style={[styles.teamScore, { 
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
            <Text allowFontScaling={false} style={[styles.teamAbbreviation, { 
              color: awayIsLoser ? '#999' : 
                     isFavorite(awayTeam.team?.id, sportName) ? colors.primary : theme.text 
            }]}>
              {isFavorite(awayTeam.team?.id, sportName) ? '★ ' : ''}{awayTeam.team?.abbreviation || awayTeam.team?.shortDisplayName || 'TBD'}
            </Text>
          </View>
        </View>
        
        {/* Venue or Live Play */}
        <View style={styles.venueSection}>
          {matchStatus.isLive ? (
            <LivePlayDisplay game={game} theme={theme} />
          ) : (
            <Text allowFontScaling={false} style={[styles.venueText, { color: theme.textSecondary }]}>{venue}</Text>
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
        // All soccer competitions go to single Soccer section
        'Premier League': 'Soccer',
        'FA Cup': 'Soccer',
        'EFL Cup': 'Soccer',
        'La Liga': 'Soccer',
        'Copa del Rey': 'Soccer',
        'Spanish Supercopa': 'Soccer',
        'Serie A': 'Soccer',
        'Coppa Italia': 'Soccer',
        'Italian Supercoppa': 'Soccer',
        'Bundesliga': 'Soccer',
        'DFB Pokal': 'Soccer',
        'German Super Cup': 'Soccer',
        'Ligue 1': 'Soccer',
        'Coupe de France': 'Soccer',
        'Trophee des Champions': 'Soccer',
        'Champions League': 'Soccer',
        'Europa League': 'Soccer',
        'Europa Conference League': 'Soccer',
        // Baseball/MLB mappings
        'Baseball': 'MLB',
        'mlb': 'MLB',
        // Football/NFL mappings
        'Football': 'NFL',
        'nfl': 'NFL',
        // Basketball/NBA mappings
        'Basketball': 'NBA',
        'nba': 'NBA',
        // Hockey/NHL mappings
        'Hockey': 'NHL',
        'nhl': 'NHL'
      };
      
      const groupName = groupNames[competitionName];
      if (groupName) {
        return groupName;
      }
      
      // Fallback logic for sports not in groupNames
      if (fallbackSport === 'Baseball' || fallbackSport === 'baseball' || 
          actualLeagueCode === 'mlb' || actualLeagueCode === 'MLB') {
        return 'MLB';
      }
      
      if (fallbackSport === 'Football' || fallbackSport === 'football' || 
          actualLeagueCode === 'nfl' || actualLeagueCode === 'NFL') {
        return 'NFL';
      }
      
      if (fallbackSport === 'Basketball' || fallbackSport === 'basketball' || 
          actualLeagueCode === 'nba' || actualLeagueCode === 'NBA') {
        return 'NBA';
      }
      
      if (fallbackSport === 'Hockey' || fallbackSport === 'hockey' || 
          actualLeagueCode === 'nhl' || actualLeagueCode === 'NHL') {
        return 'NHL';
      }
      
      // Check if it's any soccer-related sport
      if (fallbackSport === 'Soccer' || fallbackSport === 'soccer' || 
          actualLeagueCode?.includes('soccer') || actualLeagueCode?.includes('uefa')) {
        return 'Soccer';
      }
      
      return fallbackSport || 'Unknown';
    };

    // Group games by actual competition using actualLeagueCode
    const grouped = favoriteGames.reduce((acc, game) => {
      const sport = getLeagueGroupName(game.actualLeagueCode, game.sport);
      console.log(`[GROUPING] Game ${game.id} (${game.actualLeagueCode}) -> sport group: "${sport}"`);
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
            <Text allowFontScaling={false} style={[styles.leagueGroupTitle, { color: colors.primary }]}>
              {sport}
            </Text>
            <Text allowFontScaling={false} style={[styles.collapseArrow, { color: colors.primary }]}>
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
            <Text allowFontScaling={false} style={{ fontSize: 18, fontWeight: '700', color: colors.primary, marginBottom: 8 }}>Reorder Sections</Text>
            <FlatList
              data={data}
              keyExtractor={(item) => item}
              renderItem={({ item, index }) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
                  <Text allowFontScaling={false} style={{ color: theme.text }}>{item}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => moveItem(index, -1)} style={{ padding: 8 }}>
                      <Text allowFontScaling={false} style={{ color: colors.primary }}>▲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => moveItem(index, 1)} style={{ padding: 8 }}>
                      <Text allowFontScaling={false} style={{ color: colors.primary }}>▼</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
              <TouchableOpacity onPress={closeReorderModal} style={{ padding: 8 }}>
                <Text allowFontScaling={false} style={{ color: colors.primary }}>Done</Text>
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
        <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.text }]}>
          Loading favorite games...
        </Text>
      </View>
    );
  }

  const favoriteTeams = getFavoriteTeams();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text allowFontScaling={false} style={[styles.title, { color: colors.primary }]}>Favorites</Text>
      
      {favoriteTeams.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text allowFontScaling={false} style={[styles.subtitle, { color: theme.text }]}>
            Your favorite teams and games will appear here
          </Text>
          <Text allowFontScaling={false} style={[styles.subtitle, { color: theme.textSecondary }]}>
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
                <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>
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
            <Text allowFontScaling={false} style={[styles.subtitle, { color: theme.textSecondary }]}>
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
