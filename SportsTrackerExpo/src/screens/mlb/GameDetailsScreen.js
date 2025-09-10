import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Modal,
  Dimensions
} from 'react-native';
import { WebView } from 'react-native-webview';
import { MLBService } from '../../services/MLBService';
import { useTheme } from '../../context/ThemeContext';

const MLBGameDetailsScreen = ({ route, navigation }) => {
  const { gameId, sport } = route?.params || {};
  const { theme, colors, getTeamLogoUrl, isDarkMode } = useTheme();
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updateInterval, setUpdateInterval] = useState(null);
  const [lastUpdateHash, setLastUpdateHash] = useState('');
  const [lastPlaysHash, setLastPlaysHash] = useState('');
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [activeTab, setActiveTab] = useState('stats');
  const [playsData, setPlaysData] = useState(null);
  const [teamStatsData, setTeamStatsData] = useState(null);
  const [loadingPlays, setLoadingPlays] = useState(false);
  const [loadingTeamStats, setLoadingTeamStats] = useState(false);
  const [openPlays, setOpenPlays] = useState(new Set());
  const [isIncrementalUpdate, setIsIncrementalUpdate] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerModalVisible, setPlayerModalVisible] = useState(false);
  const [playerStats, setPlayerStats] = useState(null);
  const [loadingPlayerStats, setLoadingPlayerStats] = useState(false);
  const [awayRoster, setAwayRoster] = useState(null);
  const [homeRoster, setHomeRoster] = useState(null);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [seasonStats, setSeasonStats] = useState({ away: null, home: null });
  const [topHitters, setTopHitters] = useState({ away: [], home: [] });
  const [probablePitcherStats, setProbablePitcherStats] = useState({ away: null, home: null });
  const [streamModalVisible, setStreamModalVisible] = useState(false);
  const [currentStreamType, setCurrentStreamType] = useState('alpha1');
  const [availableStreams, setAvailableStreams] = useState({});
  const [streamUrl, setStreamUrl] = useState('');
  const [isStreamLoading, setIsStreamLoading] = useState(true);
  const scrollViewRef = useRef(null);
  const playsScrollViewRef = useRef(null);
  const stickyHeaderOpacity = useRef(new Animated.Value(0)).current;

  // Stream API functions
  const STREAM_API_BASE = 'https://streamed.pk/api';
  let liveMatchesCache = null;
  let cacheTimestamp = 0;
  const CACHE_DURATION = 30000; // 30 seconds cache

  const fetchLiveMatches = async () => {
    try {
      const now = Date.now();
      if (liveMatchesCache && (now - cacheTimestamp) < CACHE_DURATION) {
        return liveMatchesCache;
      }

      const response = await fetch(`${STREAM_API_BASE}/matches/live`);
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const allMatches = await response.json();
      console.log(`Found ${allMatches.length} total live matches`);

      // Filter matches by baseball
      const matches = allMatches.filter(match => {
        const matchSport = match.sport || match.category;
        return matchSport === 'baseball';
      });
      console.log(`Filtered to ${matches.length} MLB matches`);
      
      liveMatchesCache = matches;
      cacheTimestamp = now;
      
      return matches;
    } catch (error) {
      console.error('Error fetching live matches:', error);
      return null;
    }
  };

  const fetchStreamsForSource = async (source, sourceId) => {
    try {
      const response = await fetch(`${STREAM_API_BASE}/stream/${source}/${sourceId}`);
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error fetching streams for ${source}:`, error);
      return [];
    }
  };

  const normalizeTeamName = (teamName) => {
    const nameMap = {
      "Arizona Diamondbacks": "arizona-diamondbacks",
      "Atlanta Braves": "atlanta-braves", 
      "Baltimore Orioles": "baltimore-orioles",
      "Boston Red Sox": "boston-red-sox",
      "Chicago White Sox": "chicago-white-sox",
      "Chicago Cubs": "chicago-cubs",
      "Cincinnati Reds": "cincinnati-reds",
      "Cleveland Guardians": "cleveland-guardians",
      "Colorado Rockies": "colorado-rockies",
      "Detroit Tigers": "detroit-tigers",
      "Houston Astros": "houston-astros",
      "Kansas City Royals": "kansas-city-royals",
      "Los Angeles Angels": "los-angeles-angels",
      "Los Angeles Dodgers": "los-angeles-dodgers",
      "Miami Marlins": "miami-marlins",
      "Milwaukee Brewers": "milwaukee-brewers",
      "Minnesota Twins": "minnesota-twins",
      "New York Yankees": "new-york-yankees",
      "New York Mets": "new-york-mets",
      "Athletics": "athletics",
      "Philadelphia Phillies": "philadelphia-phillies",
      "Pittsburgh Pirates": "pittsburgh-pirates",
      "San Diego Padres": "san-diego-padres",
      "San Francisco Giants": "san-francisco-giants",
      "Seattle Mariners": "seattle-mariners",
      "St. Louis Cardinals": "st-louis-cardinals",
      "Tampa Bay Rays": "tampa-bay-rays",
      "Texas Rangers": "texas-rangers",
      "Toronto Blue Jays": "toronto-blue-jays",
      "Washington Nationals": "washington-nationals",
      "American League All-Stars": "american-league-all-stars",
      "National League All-Stars": "national-league-all-stars"
    };
    
    if (nameMap[teamName]) {
      return nameMap[teamName];
    }
    
    return teamName.toLowerCase()
      .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u')
      .replace(/ü/g, 'u').replace(/ñ/g, 'n').replace(/ç/g, 'c').replace(/ß/g, 'ss')
      .replace(/ë/g, 'e').replace(/ï/g, 'i').replace(/ö/g, 'o').replace(/ä/g, 'a')
      .replace(/å/g, 'a').replace(/ø/g, 'o')
      .replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  };

  const findMatchStreams = async (homeTeamName, awayTeamName) => {
    try {
      console.log(`Finding streams for: ${awayTeamName} vs ${homeTeamName}`);

      const liveMatches = await fetchLiveMatches();
      if (!liveMatches || !Array.isArray(liveMatches) || liveMatches.length === 0) {
        console.log('No live matches data available');
        return {};
      }

      // Try to find our match
      const homeNormalized = normalizeTeamName(homeTeamName).toLowerCase();
      const awayNormalized = normalizeTeamName(awayTeamName).toLowerCase();

      console.log(`Normalized team names: {homeNormalized: '${homeNormalized}', awayNormalized: '${awayNormalized}'}`);

      // Check if both teams have the same first word (city name) - this causes confusion
      const homeFirstWord = homeNormalized.split('-')[0];
      const awayFirstWord = awayNormalized.split('-')[0];
      const hasSameCity = homeFirstWord === awayFirstWord;

      console.log(`Team analysis: Home first word: "${homeFirstWord}", Away first word: "${awayFirstWord}", Same city: ${hasSameCity}`);

      let bestMatch = null;
      let bestScore = 0;

      // Quick pre-filter to reduce processing
      const quickMatches = liveMatches.slice(0, Math.min(liveMatches.length, 100)).filter(match => {
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
      const matchesToProcess = quickMatches.length > 0 ? quickMatches : liveMatches.slice(0, Math.min(liveMatches.length, 100));

      console.log(`Processing ${matchesToProcess.length} matches (${quickMatches.length > 0 ? 'pre-filtered' : 'full set'})`);

      // Debug: Show first few matches to understand API format
      if (liveMatches.length > 0) {
        console.log('Sample matches from API:');
        for (let i = 0; i < Math.min(5, liveMatches.length); i++) {
          const match = liveMatches[i];
          console.log(`  ${i+1}. Title: "${match.title}"`);
          if (match.teams) {
            console.log(`     Home: ${match.teams.home?.name}, Away: ${match.teams.away?.name}`);
          }
          if (match.sources) {
            console.log(`     Sources: ${match.sources.map(s => s.source).join(', ')}`);
          }
        }
      }

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
              const homeParts = homeNormalized.split('-').filter(word => word.length > 2);
              const awayParts = awayNormalized.split('-').filter(word => word.length > 2);

              homeParts.forEach(part => {
                if (titleWords.some(word => word.includes(part) || part.includes(word))) score += 0.4;
              });
              awayParts.forEach(part => {
                if (titleWords.some(word => word.includes(part) || part.includes(word))) score += 0.4;
              });
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
                const homeParts = homeNormalized.split('-').filter(word => word.length > 2);
                const awayParts = awayNormalized.split('-').filter(word => word.length > 2);

                homeParts.forEach(part => {
                  if (homeApiName.includes(part)) score += 0.6;
                });
                awayParts.forEach(part => {
                  if (awayApiName.includes(part)) score += 0.6;
                });
              }
            }
            return score;
          },
          // Strategy 3: MLB-specific abbreviations and common names
          () => {
            const abbreviations = {
              'arizona': ['arizona', 'diamondbacks', 'arizona-diamondbacks'],
              'atlanta': ['atlanta', 'braves', 'atlanta-braves'],
              'baltimore': ['baltimore', 'orioles', 'baltimore-orioles'],
              'boston': ['boston', 'red-sox', 'boston-red-sox'],
              'chicago': ['chicago', 'white-sox', 'cubs', 'chicago-white-sox', 'chicago-cubs'],
              'cincinnati': ['cincinnati', 'reds', 'cincinnati-reds'],
              'cleveland': ['cleveland', 'guardians', 'cleveland-guardians'],
              'colorado': ['colorado', 'rockies', 'colorado-rockies'],
              'detroit': ['detroit', 'tigers', 'detroit-tigers'],
              'houston': ['houston', 'astros', 'houston-astros'],
              'kansas': ['kansas', 'royals', 'kansas-city-royals'],
              'los-angeles': ['los-angeles', 'angels', 'dodgers', 'los-angeles-angels', 'los-angeles-dodgers'],
              'miami': ['miami', 'marlins', 'miami-marlins'],
              'milwaukee': ['milwaukee', 'brewers', 'milwaukee-brewers'],
              'minnesota': ['minnesota', 'twins', 'minnesota-twins'],
              'new-york': ['new-york', 'yankees', 'mets', 'new-york-yankees', 'new-york-mets'],
              'oakland': ['oakland', 'athletics', 'oakland-athletics'],
              'philadelphia': ['philadelphia', 'phillies', 'philadelphia-phillies'],
              'pittsburgh': ['pittsburgh', 'pirates', 'pittsburgh-pirates'],
              'san-diego': ['san-diego', 'padres', 'san-diego-padres'],
              'san-francisco': ['san-francisco', 'giants', 'san-francisco-giants'],
              'seattle': ['seattle', 'mariners', 'seattle-mariners'],
              'st-louis': ['st-louis', 'cardinals', 'st-louis-cardinals'],
              'tampa': ['tampa', 'rays', 'tampa-bay-rays'],
              'texas': ['texas', 'rangers', 'texas-rangers'],
              'toronto': ['toronto', 'blue-jays', 'toronto-blue-jays'],
              'washington': ['washington', 'nationals', 'washington-nationals']
            };

            let score = 0;
            const titleWords = matchTitle.split(/[\s\-]+/);

            // Check home team abbreviations
            const homeParts = homeNormalized.split('-');
            homeParts.forEach(part => {
              if (abbreviations[part]) {
                abbreviations[part].forEach(abbr => {
                  if (titleWords.some(word => word.includes(abbr) || abbr.includes(word))) score += 0.3;
                });
              }
            });

            // Check away team abbreviations
            const awayParts = awayNormalized.split('-');
            awayParts.forEach(part => {
              if (abbreviations[part]) {
                abbreviations[part].forEach(abbr => {
                  if (titleWords.some(word => word.includes(abbr) || abbr.includes(word))) score += 0.3;
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

          // Early exit if we find a very good match (score >= 1.0 for rough matching)
          if (bestScore >= 1.0) {
            console.log(`Found excellent match with score ${bestScore}, stopping search early`);
            break;
          }
        }
      }

      if (!bestMatch || bestScore < 0.3) {
        console.log(`No good matching live match found in API (best score: ${bestScore.toFixed(2)})`);
        console.log(`Searched for: ${homeNormalized} vs ${awayNormalized}`);
        console.log(`Processed: ${matchesToProcess.length} matches out of ${liveMatches.length} total`);
        return {};
      }

      console.log(`Found matching match: ${bestMatch.title} (score: ${bestScore.toFixed(2)})`);

      // Collect all streams from all sources
      const allStreams = {};
      for (const source of bestMatch.sources) {
        try {
          const sourceStreams = await fetchStreamsForSource(source.source, source.id);
          
          if (sourceStreams && sourceStreams.length > 0) {
            sourceStreams.forEach((stream, index) => {
              const streamKey = `${source.source}${index + 1}`;
              allStreams[streamKey] = {
                url: stream.embedUrl || stream.url,
                embedUrl: stream.embedUrl || stream.url,
                source: source.source,
                title: stream.title || `${source.source} Stream ${index + 1}`
              };
            });
          }
        } catch (error) {
          console.error(`Error fetching streams for ${source.source}:`, error);
        }
      }

      console.log(`Final streams found:`, allStreams);
      return allStreams;
    } catch (error) {
      console.error('Error in findMatchStreams:', error);
      return {};
    }
  };

  const generateStreamUrl = (awayTeamName, homeTeamName, streamType = 'alpha1') => {
    const normalizedAway = normalizeTeamName(awayTeamName);
    const normalizedHome = normalizeTeamName(homeTeamName);
    
    const streamUrls = {
      alpha1: `https://weakstreams.com/mlb-live-streams/${normalizedAway}-vs-${normalizedHome}-live-stream`,
      alpha2: `https://weakstreams.com/mlb-live-streams/${normalizedHome}-vs-${normalizedAway}-live-stream`,
      bravo: `https://sportsurge.club/mlb/${normalizedAway}-vs-${normalizedHome}`,
      charlie: `https://sportshd.me/mlb/${normalizedAway}-${normalizedHome}`
    };
    
    return streamUrls[streamType] || streamUrls.alpha1;
  };

  useEffect(() => {
    console.log('MLBGameDetailsScreen: Main useEffect triggered, gameId:', gameId);
    
    if (!gameId) {
      Alert.alert('Error', 'Game ID not provided');
      navigation.goBack();
      return;
    }
    
    loadGameDetails();
  }, [gameId]);

  // Set up live updates after gameData is loaded
  useEffect(() => {
    if (!gameData) return;
    
    const isLiveGame = gameData?.gameData?.status?.statusCode === 'I'; // In progress
    console.log('MLBGameDetailsScreen: Setting up live updates, isLive:', isLiveGame);
    
    if (isLiveGame) {
      const interval = setInterval(() => {
        console.log('MLBGameDetailsScreen: Live update tick');
        loadGameDetails(true);
      }, 2000); // Update every 2 seconds for live games
      
      setUpdateInterval(interval);
      
      return () => {
        console.log('MLBGameDetailsScreen: Clearing live update interval');
        clearInterval(interval);
      };
    }
  }, [gameData]);

  // Clear cache when component unmounts or gameId changes
  useEffect(() => {
    return () => {
      MLBService.clearCache?.();
    };
  }, [gameId]);

  // Refresh plays data when active tab is plays and game data changes
  useEffect(() => {
    if (gameData && activeTab === 'plays') {
      // Always refresh plays when switching to plays tab or when game data changes while on plays tab
      loadPlaysData();
    }
  }, [gameData, activeTab]);

  // Load scheduled game data when game data is loaded and game is scheduled, pre-game, or warmup
  useEffect(() => {
    const status = gameData?.gameData?.status;
    const isScheduled = status?.statusCode === 'S' || 
                       status?.detailedState === 'Pre-Game' || 
                       status?.detailedState === 'Warmup';
    
    if (gameData && isScheduled) {
      loadScheduledGameData();
    }
  }, [gameData]);

  // Monitor for live updates specifically for plays
  useEffect(() => {
    if (gameData && activeTab === 'plays') {
      // Create a more detailed hash just for plays updates
      const currentPlaysCount = gameData.liveData?.plays?.allPlays?.length || 0;
      const currentPlayEvents = gameData.liveData?.plays?.currentPlay?.playEvents?.length || 0;
      const currentPlayResult = gameData.liveData?.plays?.currentPlay?.result?.description || '';
      const lastPlayId = gameData.liveData?.plays?.allPlays?.[gameData.liveData?.plays?.allPlays?.length - 1]?.about?.atBatIndex;
      
      const playsHash = JSON.stringify({
        playsCount: currentPlaysCount,
        currentPlayEvents: currentPlayEvents,
        currentPlayResult: currentPlayResult,
        lastPlayId: lastPlayId
      });
      
      if (playsHash !== lastPlaysHash && lastPlaysHash !== '') {
        console.log('Plays data changed, updating incrementally...');
        
        // Check if we have more plays than before (new plays added)
        const existingPlaysCount = playsData?.allPlays?.length || 0;
        if (currentPlaysCount > existingPlaysCount) {
          // New plays added - update incrementally
          setIsIncrementalUpdate(true);
          updatePlaysDataIncremental(gameData.liveData?.plays);
        } else {
          // Play events changed for existing play - refresh all
          setIsIncrementalUpdate(false);
          loadPlaysData();
        }
      }
      setLastPlaysHash(playsHash);
    }
  }, [gameData, activeTab, lastPlaysHash, playsData]);

  const createDataHash = (data) => {
    if (!data) return '';
    
    // Create a hash based on key game state data
    const hashData = {
      score: data.liveData?.linescore?.teams,
      inning: data.liveData?.linescore?.currentInning,
      inningState: data.liveData?.linescore?.inningState,
      outs: data.liveData?.linescore?.outs,
      balls: data.liveData?.linescore?.balls,
      strikes: data.liveData?.linescore?.strikes,
      status: data.gameData?.status?.detailedState,
      playsCount: data.liveData?.plays?.allPlays?.length || 0,
      currentPlay: data.liveData?.plays?.currentPlay?.playEvents?.length || 0,
      currentPlayResult: data.liveData?.plays?.currentPlay?.result?.description || '',
      lastPlayTimestamp: data.liveData?.plays?.allPlays?.[data.liveData?.plays?.allPlays?.length - 1]?.about?.startTime
    };
    
    return JSON.stringify(hashData);
  };

  const loadGameDetails = async (silentUpdate = false) => {
    try {
      if (!gameId) {
        console.error('MLBGameDetailsScreen: No gameId provided');
        return;
      }

      if (!silentUpdate) {
        setLoading(true);
      }

      console.log('MLBGameDetailsScreen: Loading game details for gameId:', gameId);
      const data = await MLBService.getGameDetails(gameId);
      
      // Check for changes
      const newHash = createDataHash(data);
      if (silentUpdate && newHash === lastUpdateHash) {
        return; // No changes, skip update
      }
      
      setLastUpdateHash(newHash);
      setGameData(data);
      
    } catch (error) {
      console.error('Error loading game details:', error);
      if (!silentUpdate) {
        Alert.alert('Error', 'Failed to load game details');
      }
    } finally {
      if (!silentUpdate) {
        setLoading(false);
      }
    }
  };

  const loadPlaysData = async () => {
    if (!gameId || loadingPlays) return;
    
    try {
      setIsIncrementalUpdate(false);
      setLoadingPlays(true);
      const plays = await MLBService.getPlayByPlay(gameId);
      setPlaysData(plays);
    } catch (error) {
      console.error('Error loading plays:', error);
      Alert.alert('Error', 'Failed to load plays data');
    } finally {
      setLoadingPlays(false);
    }
  };

  const updatePlaysDataIncremental = async (newPlaysData) => {
    if (!newPlaysData || !playsData) {
      // If we don't have existing data, load all plays
      loadPlaysData();
      return;
    }

    const newAllPlays = newPlaysData.allPlays || [];
    const existingAllPlays = playsData.allPlays || [];
    
    // Check if there are actually new plays
    if (newAllPlays.length <= existingAllPlays.length) {
      // No new plays, just update the current play and other metadata without touching allPlays
      setPlaysData(prevData => ({
        ...prevData,
        currentPlay: newPlaysData.currentPlay,
        scoringPlays: newPlaysData.scoringPlays,
        playsByInning: newPlaysData.playsByInning
      }));
      return;
    }

    // Get only the new plays (plays that weren't in the previous data)
    const newPlays = newAllPlays.slice(existingAllPlays.length);
    console.log(`Adding ${newPlays.length} new plays incrementally`);

    // Use functional update to append new plays to existing array without replacing the entire reference
    setPlaysData(prevData => ({
      ...newPlaysData,
      allPlays: [...prevData.allPlays, ...newPlays]
    }));

    // Reset incremental update flag after a short delay
    setTimeout(() => {
      setIsIncrementalUpdate(false);
    }, 100);
  };

  const loadTeamStats = async () => {
    if (!gameId || loadingTeamStats) return;
    
    try {
      setLoadingTeamStats(true);
      const stats = await MLBService.getTeamStats(gameId);
      setTeamStatsData(stats);
    } catch (error) {
      console.error('Error loading team stats:', error);
      Alert.alert('Error', 'Failed to load team stats');
    } finally {
      setLoadingTeamStats(false);
    }
  };

  const loadScheduledGameData = async () => {
    const status = gameData?.gameData?.status;
    const isScheduled = status?.statusCode === 'S' || 
                       status?.detailedState === 'Pre-Game' || 
                       status?.detailedState === 'Warmup';
    
    if (!gameData || !isScheduled) return;

    const awayTeamId = gameData.gameData?.teams?.away?.id;
    const homeTeamId = gameData.gameData?.teams?.home?.id;
    
    // Try to get probable pitchers from different possible locations
    const awayPitcher = gameData.gameData?.probablePitchers?.away || 
                       gameData.liveData?.boxscore?.teams?.away?.probablePitcher ||
                       gameData.gameData?.teams?.away?.probablePitcher;
    const homePitcher = gameData.gameData?.probablePitchers?.home || 
                       gameData.liveData?.boxscore?.teams?.home?.probablePitcher ||
                       gameData.gameData?.teams?.home?.probablePitcher;

    if (!awayTeamId || !homeTeamId) return;

    try {
      setLoadingRoster(true);
      
      // Load rosters
      const [awayRosterData, homeRosterData] = await Promise.all([
        MLBService.getTeamRoster(awayTeamId),
        MLBService.getTeamRoster(homeTeamId)
      ]);

      setAwayRoster(awayRosterData);
      setHomeRoster(homeRosterData);

      // Load season stats
      const [awaySeasonStats, homeSeasonStats] = await Promise.all([
        MLBService.getTeamSeasonStats(awayTeamId),
        MLBService.getTeamSeasonStats(homeTeamId)
      ]);

      setSeasonStats({ away: awaySeasonStats, home: homeSeasonStats });

      // Load top hitters
      const [awayTopHitters, homeTopHitters] = await Promise.all([
        MLBService.getTopTeamHitters(awayTeamId),
        MLBService.getTopTeamHitters(homeTeamId)
      ]);

      setTopHitters({ away: awayTopHitters, home: homeTopHitters });

      // Load probable pitcher stats if available
      if (awayPitcher?.id || homePitcher?.id) {
        const [awayPitcherStats, homePitcherStats] = await Promise.all([
          awayPitcher?.id ? MLBService.getPlayerSeasonStats(awayPitcher.id) : Promise.resolve(null),
          homePitcher?.id ? MLBService.getPlayerSeasonStats(homePitcher.id) : Promise.resolve(null)
        ]);

        setProbablePitcherStats({ away: awayPitcherStats, home: homePitcherStats });
      }

    } catch (error) {
      console.error('Error loading scheduled game data:', error);
    } finally {
      setLoadingRoster(false);
    }
  };

  const formatInning = (inning, inningState) => {
    if (!inning) return '';
    const ordinal = MLBService.getOrdinalSuffix(inning);
    return inningState === 'Top' ? `Top ${ordinal}` : `Bot ${ordinal}`;
  };

  const handlePlayerPress = async (player, team) => {
    setSelectedPlayer({
      ...player,
      team: team
    });
    setPlayerModalVisible(true);
    setLoadingPlayerStats(true);

    try {
      console.log('Fetching game stats for player ID:', player.person?.id, 'in game:', gameId);
      const gameStats = await MLBService.getPlayerGameStats(gameId, player.person?.id);
      console.log('Game stats received:', gameStats);
      
      if (gameStats) {
        setPlayerStats(gameStats);
      } else {
        console.log('No valid stats data received');
        setPlayerStats(null);
      }
    } catch (error) {
      console.error('Error loading player stats:', error);
      setPlayerStats(null);
    } finally {
      setLoadingPlayerStats(false);
    }
  };

  const closePlayerModal = () => {
    setPlayerModalVisible(false);
    setSelectedPlayer(null);
    setPlayerStats(null);
  };

  const handleScroll = (event) => {
    const offsetY = event.nativeEvent.contentOffset.y;

    // Define the transition range - moved earlier
    const fadeStartY = 100; // Start fading in when scrolled past this point
    const fadeEndY = 150;   // Fully visible at this point

    // Calculate opacity based on scroll position within the transition range
    let opacity = 0;
    if (offsetY >= fadeStartY) {
      if (offsetY >= fadeEndY) {
        opacity = 1; // Fully visible
      } else {
        // Gradual transition between fadeStartY and fadeEndY
        opacity = (offsetY - fadeStartY) / (fadeEndY - fadeStartY);
      }
    }

    // Update state for conditional padding
    const shouldShow = opacity > 0;
    if (shouldShow !== showStickyHeader) {
      setShowStickyHeader(shouldShow);
    }

    // Smoothly animate to the calculated opacity
    Animated.timing(stickyHeaderOpacity, {
      toValue: opacity,
      duration: 0, // Immediate response to scroll
      useNativeDriver: true,
    }).start();
  };

  const renderStickyHeader = () => {
    if (!showStickyHeader || !gameData) return null;

    const awayTeam = gameData.gameData?.teams?.away;
    const homeTeam = gameData.gameData?.teams?.home;
    const linescore = gameData.liveData?.linescore;
    const status = gameData.gameData?.status;

    const awayScore = linescore?.teams?.away?.runs || 0;
    const homeScore = linescore?.teams?.home?.runs || 0;
    const isGameFinal = status?.statusCode === 'F';

    const awayIsLosing = isGameFinal && awayScore < homeScore;
    const homeIsLosing = isGameFinal && homeScore < awayScore;
    const getStickyScoreColor = (isLosing) => isLosing ? theme.textSecondary : colors.primary;

    return (
      <Animated.View
        style={[
          styles.stickyHeader,
          { backgroundColor: theme.surface },
          {
            opacity: stickyHeaderOpacity,
            transform: [{
              translateY: stickyHeaderOpacity.interpolate({
                inputRange: [0, 1],
                outputRange: [-20, 0], // Smaller, more subtle slide effect
              })
            }]
          }
        ]}
        pointerEvents={showStickyHeader ? 'auto' : 'none'}
      >
        {/* Away Team */}
        <View style={styles.stickyTeamAway}>
          <Image
            source={{ uri: getTeamLogoUrl('mlb', awayTeam?.abbreviation) }}
            style={styles.stickyTeamLogo}
            defaultSource={{ uri: 'https://via.placeholder.com/28x28?text=MLB' }}
          />
          <Text style={[styles.stickyTeamScore, { color: getStickyScoreColor(awayIsLosing) }]}>{awayScore}</Text>
        </View>

        {/* Game Status */}
        <View style={styles.stickyStatus}>
          {status?.statusCode === 'F' ? (
            <Text style={[styles.stickyStatusText, { color: colors.primary }]}>Final</Text>
          ) : status?.statusCode === 'I' ? (
            <>
              <Text style={[styles.stickyStatusText, { color: colors.primary }]}>
                {formatInning(linescore?.currentInning, linescore?.inningState)}
              </Text>
              <Text style={[styles.stickyClock, { color: theme.textSecondary }]}>
                {linescore?.balls || 0}-{linescore?.strikes || 0}, {linescore?.outs || 0} out{(linescore?.outs || 0) !== 1 ? 's' : ''}
              </Text>
            </>
          ) : (
            <Text style={[styles.stickyStatusText, { color: colors.primary }]}>{status?.detailedState || 'Scheduled'}</Text>
          )}
        </View>

        {/* Home Team */}
        <View style={styles.stickyTeamHome}>
          <Text style={[styles.stickyTeamScore, { color: getStickyScoreColor(homeIsLosing) }]}>{homeScore}</Text>
          <Image
            source={{ uri: getTeamLogoUrl('mlb', homeTeam?.abbreviation) }}
            style={styles.stickyTeamLogo}
            defaultSource={{ uri: 'https://via.placeholder.com/28x28?text=MLB' }}
          />
        </View>
      </Animated.View>
    );
  };

  const renderTabNavigation = () => {
    const status = gameData?.gameData?.status;
    // Include Pre-Game and Warmup in scheduled logic
    const isScheduled = status?.statusCode === 'S' || 
                       status?.detailedState === 'Pre-Game' || 
                       status?.detailedState === 'Warmup';
    
    const tabs = isScheduled 
      ? [
          { key: 'stats', label: 'Stats' },
          { key: 'away', label: 'Away' },
          { key: 'home', label: 'Home' }
        ]
      : [
          { key: 'stats', label: 'Stats' },
          { key: 'away', label: 'Away' },
          { key: 'home', label: 'Home' },
          { key: 'plays', label: 'Plays' }
        ];

    return (
      <View style={[styles.tabContainer, { backgroundColor: theme.surface }]}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tabButton,
              { backgroundColor: activeTab === tab.key ? colors.primary : theme.surfaceSecondary },
              tab.key !== 'plays' && { borderRightColor: theme.border }
            ]}
            onPress={() => {
              setActiveTab(tab.key);
              if (tab.key === 'plays') {
                if (!playsData) {
                  loadPlaysData();
                }
              } else if ((tab.key === 'away' || tab.key === 'home') && !teamStatsData) {
                loadTeamStats();
              }
            }}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === tab.key ? '#fff' : theme.text }
            ]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const openStreamModal = async () => {
    const awayTeam = gameData?.gameData?.teams?.away;
    const homeTeam = gameData?.gameData?.teams?.home;
    
    if (!awayTeam || !homeTeam) {
      Alert.alert('Error', 'Team information not available');
      return;
    }

    setStreamModalVisible(true);
    setIsStreamLoading(true);
    
    // Fetch available streams
    const streams = await findMatchStreams(homeTeam.name, awayTeam.name);
    setAvailableStreams(streams);
    
    // Generate initial stream URL - use first available stream
    let initialUrl = '';
    let initialStreamType = '';
    
    const streamKeys = Object.keys(streams);
    if (streamKeys.length > 0) {
      initialStreamType = streamKeys[0];
      const streamData = streams[initialStreamType];
      initialUrl = streamData.embedUrl || streamData.url || streamData;
      setCurrentStreamType(initialStreamType);
    } else {
      // Fallback to manual URL construction
      initialStreamType = 'alpha1';
      initialUrl = generateStreamUrl(awayTeam.name, homeTeam.name, initialStreamType);
      setCurrentStreamType(initialStreamType);
    }
    
    setStreamUrl(initialUrl);
    setIsStreamLoading(false);
  };

  const switchStream = (streamType) => {
    setCurrentStreamType(streamType);
    setIsStreamLoading(true);
    
    let newUrl = '';
    if (availableStreams[streamType]) {
      newUrl = availableStreams[streamType].embedUrl || availableStreams[streamType];
    } else {
      const awayTeam = gameData?.gameData?.teams?.away;
      const homeTeam = gameData?.gameData?.teams?.home;
      newUrl = generateStreamUrl(awayTeam?.name, homeTeam?.name, streamType);
    }
    
    setStreamUrl(newUrl);
    setTimeout(() => setIsStreamLoading(false), 1000);
  };

  const closeStreamModal = () => {
    setStreamModalVisible(false);
    setStreamUrl('');
    setCurrentStreamType('alpha1');
    setAvailableStreams({});
  };

  const renderGameHeader = () => {
    if (!gameData) return null;

    const awayTeam = gameData.gameData?.teams?.away;
    const homeTeam = gameData.gameData?.teams?.home;
    const linescore = gameData.liveData?.linescore;
    const status = gameData.gameData?.status;

    const awayScore = linescore?.teams?.away?.runs || 0;
    const homeScore = linescore?.teams?.home?.runs || 0;
    const isGameFinal = status?.statusCode === 'F';
    
    // Theme-aware color functions similar to ScoreboardScreen
    const getScoreColor = (isLosing) => isLosing ? theme.textSecondary : colors.primary;
    const getNameColor = (isLosing) => isLosing ? theme.textSecondary : theme.text;
    
    const awayIsLosing = isGameFinal && awayScore < homeScore;
    const homeIsLosing = isGameFinal && homeScore < awayScore;

    return (
      <TouchableOpacity style={[styles.gameHeader, { backgroundColor: theme.surface }]} onPress={openStreamModal} activeOpacity={0.8}>
        <View style={styles.teamContainer}>
          {/* Away Team */}
          <View style={styles.team}>
            <Text style={[styles.teamScore, { color: getScoreColor(awayIsLosing) }]}>{awayScore}</Text>
            <Image 
              source={{ uri: getTeamLogoUrl('mlb', awayTeam?.abbreviation) }} 
              style={styles.teamLogo}
              defaultSource={{ uri: 'https://via.placeholder.com/50x50?text=MLB' }}
            />
            <View style={styles.teamNameContainer}>
              <Text style={[styles.teamName, { color: getNameColor(awayIsLosing) }]}>{awayTeam?.abbreviation || 'AWAY'}</Text>
            </View>
          </View>

          {/* Game Status */}
          <View style={styles.vsContainer}>
            <Text style={[styles.vsText, { color: theme.textSecondary }]}>vs</Text>
            {status?.statusCode === 'F' ? (
              <Text style={[styles.gameStatus, { color: colors.primary }]}>Final</Text>
            ) : status?.statusCode === 'I' ? (
              <>
                <Text style={[styles.gameStatus, { color: colors.primary }]}>
                  {formatInning(linescore?.currentInning, linescore?.inningState)}
                </Text>
                <Text style={[styles.gameClock, { color: theme.textSecondary }]}>
                  {linescore?.balls || 0}-{linescore?.strikes || 0}, {linescore?.outs || 0} out{(linescore?.outs || 0) !== 1 ? 's' : ''}
                </Text>
                {renderBases()}
              </>
            ) : (
              <Text style={[styles.gameStatus, { color: colors.primary }]}>{status?.detailedState || 'Scheduled'}</Text>
            )}
          </View>

          {/* Home Team */}
          <View style={styles.team}>
            <Text style={[styles.teamScore, { color: getScoreColor(homeIsLosing) }]}>{homeScore}</Text>
            <Image 
              source={{ uri: getTeamLogoUrl('mlb', homeTeam?.abbreviation) }} 
              style={styles.teamLogo}
              defaultSource={{ uri: 'https://via.placeholder.com/50x50?text=MLB' }}
            />
            <View style={styles.teamNameContainer}>
              <Text style={[styles.teamName, { color: getNameColor(homeIsLosing) }]}>{homeTeam?.abbreviation || 'HOME'}</Text>
            </View>
          </View>
        </View>
        
        <View style={styles.gameInfo}>
          <Text style={[styles.venue, { color: theme.text }]}>{gameData.gameData?.venue?.name || ''}</Text>
          {gameData.gameData?.datetime?.originalDate && (
            <Text style={[styles.date, { color: theme.textSecondary }]}>
              {new Date(gameData.gameData.datetime.originalDate).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </Text>
          )}
          <Text style={[styles.streamHint, { color: colors.primary }]}>Tap to view streams</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderBases = () => {
    if (!gameData?.liveData?.linescore?.offense) return null;

    const offense = gameData.liveData.linescore.offense;
    const hasFirst = !!offense.first;
    const hasSecond = !!offense.second;
    const hasThird = !!offense.third;

    return (
      <View style={styles.basesContainer}>
        <View style={styles.basesDisplay}>
          <View style={[
            styles.base, 
            styles.secondBase, 
            { backgroundColor: theme.border },
            hasSecond && { backgroundColor: colors.primary }
          ]} />
          <View style={styles.basesRow}>
            <View style={[
              styles.base, 
              styles.thirdBase, 
              { backgroundColor: theme.border },
              hasThird && { backgroundColor: colors.primary }
            ]} />
            <View style={[
              styles.base, 
              styles.firstBase, 
              { backgroundColor: theme.border },
              hasFirst && { backgroundColor: colors.primary }
            ]} />
          </View>
        </View>
      </View>
    );
  };

  const renderLineScore = () => {
    if (!gameData?.liveData?.linescore) return null;

    const status = gameData?.gameData?.status;
    // Don't show line score for scheduled, pre-game, or warmup games
    const isPreGame = status?.statusCode === 'S' || 
                     status?.detailedState === 'Pre-Game' || 
                     status?.detailedState === 'Warmup';
    
    if (isPreGame) return null;

    const linescore = gameData.liveData.linescore;
    const innings = linescore.innings || [];
    const awayTeam = gameData.gameData?.teams?.away;
    const homeTeam = gameData.gameData?.teams?.home;

    if (innings.length === 0) return null;

    return (
      <View style={[styles.lineScoreContainer, { 
        backgroundColor: theme.surface,
        shadowColor: isDarkMode ? '#ffffff' : '#000000'
      }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Line Score</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.lineScoreTable}>
            {/* Header Row */}
            <View style={[styles.lineScoreRow, { borderBottomColor: theme.border }]}>
              <View style={[styles.lineScoreCell, styles.teamCell]}>
                <Text style={[styles.lineScoreHeaderText, { color: theme.text }]}>Team</Text>
              </View>
              {innings.map((inning, index) => (
                <View key={index} style={styles.lineScoreCell}>
                  <Text style={[styles.lineScoreHeaderText, { color: theme.text }]}>{index + 1}</Text>
                </View>
              ))}
              <View style={styles.lineScoreCell}>
                <Text style={[styles.lineScoreHeaderText, { color: theme.text }]}>R</Text>
              </View>
              <View style={styles.lineScoreCell}>
                <Text style={[styles.lineScoreHeaderText, { color: theme.text }]}>H</Text>
              </View>
              <View style={styles.lineScoreCell}>
                <Text style={[styles.lineScoreHeaderText, { color: theme.text }]}>E</Text>
              </View>
            </View>

            {/* Away Team Row */}
            <View style={[styles.lineScoreRow, { borderBottomColor: theme.border }]}>
              <View style={[styles.lineScoreCell, styles.teamCell]}>
                <View style={styles.lineScoreTeamContainer}>
                  <Image
                    source={{ uri: getTeamLogoUrl('mlb', awayTeam?.abbreviation) }}
                    style={styles.lineScoreTeamLogo}
                  />
                  <Text style={[styles.lineScoreTeamText, { color: colors.primary }]}>{awayTeam?.abbreviation || 'AWAY'}</Text>
                </View>
              </View>
              {innings.map((inning, index) => (
                <View key={index} style={styles.lineScoreCell}>
                  <Text style={[styles.lineScoreText, { color: theme.textSecondary }]}>{inning.away?.runs || '0'}</Text>
                </View>
              ))}
              <View style={styles.lineScoreCell}>
                <Text style={[styles.lineScoreText, { color: colors.primary }, styles.lineScoreTotalText]}>
                  {linescore.teams?.away?.runs || 0}
                </Text>
              </View>
              <View style={styles.lineScoreCell}>
                <Text style={[styles.lineScoreText, { color: theme.textSecondary }]}>{linescore.teams?.away?.hits || 0}</Text>
              </View>
              <View style={styles.lineScoreCell}>
                <Text style={[styles.lineScoreText, { color: theme.textSecondary }]}>{linescore.teams?.away?.errors || 0}</Text>
              </View>
            </View>

            {/* Home Team Row */}
            <View style={[styles.lineScoreRow, { borderBottomColor: theme.border }]}>
              <View style={[styles.lineScoreCell, styles.teamCell]}>
                <View style={styles.lineScoreTeamContainer}>
                  <Image
                    source={{ uri: getTeamLogoUrl('mlb', homeTeam?.abbreviation) }}
                    style={styles.lineScoreTeamLogo}
                  />
                  <Text style={[styles.lineScoreTeamText, { color: colors.primary }]}>{homeTeam?.abbreviation || 'HOME'}</Text>
                </View>
              </View>
              {innings.map((inning, index) => {
                const inningNumber = index + 1;
                const isBottomInning = inning.home !== undefined;
                const awayScore = linescore?.teams?.away?.runs || 0;
                const homeScore = linescore?.teams?.home?.runs || 0;
                const isGameFinal = gameData?.gameData?.status?.statusCode === 'F';
                
                // Show "X" if home team is winning and didn't need to bat in bottom of inning
                const shouldShowX = isBottomInning && 
                                  homeScore > awayScore && 
                                  inningNumber >= 9 && 
                                  (inning.home?.runs === undefined || inning.home?.runs === null) &&
                                  isGameFinal;
                
                return (
                  <View key={index} style={styles.lineScoreCell}>
                    <Text style={[styles.lineScoreText, { color: theme.textSecondary }]}>
                      {shouldShowX ? 'X' : (inning.home?.runs || '0')}
                    </Text>
                  </View>
                );
              })}
              <View style={styles.lineScoreCell}>
                <Text style={[styles.lineScoreText, { color: colors.primary }, styles.lineScoreTotalText]}>
                  {linescore.teams?.home?.runs || 0}
                </Text>
              </View>
              <View style={styles.lineScoreCell}>
                <Text style={[styles.lineScoreText, { color: theme.textSecondary }]}>{linescore.teams?.home?.hits || 0}</Text>
              </View>
              <View style={styles.lineScoreCell}>
                <Text style={[styles.lineScoreText, { color: theme.textSecondary }]}>{linescore.teams?.home?.errors || 0}</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderCurrentPlay = () => {
    if (!gameData?.liveData?.plays?.currentPlay) return null;

    const currentPlay = gameData.liveData.plays.currentPlay;
    const status = gameData.gameData?.status;

    if (status?.statusCode !== 'I') return null; // Only show for in-progress games

    return (
      <View style={[styles.currentPlayContainer, { backgroundColor: theme.surface }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Current Situation</Text>
        <View style={styles.currentPlayContent}>
          {currentPlay.result?.description && (
            <Text style={[styles.currentPlayText, { color: theme.text }]}>{currentPlay.result.description}</Text>
          )}
          {currentPlay.about?.inning && (
            <Text style={[styles.currentPlayDetails, { color: theme.textSecondary }]}>
              {formatInning(currentPlay.about.inning, currentPlay.about.halfInning)}
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderStatsContent = () => {
    const status = gameData?.gameData?.status;
    // Include Pre-Game and Warmup in scheduled logic
    const isScheduled = status?.statusCode === 'S' || 
                       status?.detailedState === 'Pre-Game' || 
                       status?.detailedState === 'Warmup';
    
    if (isScheduled) {
      return (
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          {renderLineScore()}
          {renderProbablePitchers()}
          {renderTopHitters()}
          {renderSeasonStats()}
        </View>
      );
    }

    return (
      <View style={[styles.section, { backgroundColor: theme.surface }]}>
        {renderLineScore()}
        {renderMomentumChart()}
        {renderTeamStats()}
      </View>
    );
  };

  const renderTeamContent = (teamType) => {
    if (!gameData) return null;

    const team = teamType === 'away' ? gameData.gameData?.teams?.away : gameData.gameData?.teams?.home;
    const teamStats = teamType === 'away' ? gameData.liveData?.boxscore?.teams?.away : gameData.liveData?.boxscore?.teams?.home;
    const status = gameData?.gameData?.status;
    // Include Pre-Game and Warmup in scheduled logic
    const isScheduled = status?.statusCode === 'S' || 
                       status?.detailedState === 'Pre-Game' || 
                       status?.detailedState === 'Warmup';

    if (isScheduled) {
      return (
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <View style={styles.teamRosterHeader}>
            <Image 
              source={{ uri: getTeamLogoUrl('mlb', team?.abbreviation) }} 
              style={styles.teamRosterLogo}
              defaultSource={{ uri: 'https://via.placeholder.com/24x24?text=MLB' }}
            />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{team?.name || `${teamType} Team`} Roster</Text>
          </View>
          {renderTeamRoster(team)}
        </View>
      );
    }

    return (
      <View style={[styles.section, { backgroundColor: theme.surface }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{team?.name || `${teamType} Team`} Box Score</Text>
        {renderTeamBoxScore(teamStats, team)}
      </View>
    );
  };

  const renderTeamBoxScore = (teamStats, team) => {
    if (!teamStats) return null;

    const batters = teamStats.batters || [];
    const pitchers = teamStats.pitchers || [];

    return (
      <View style={styles.teamBoxScoreContainer}>
        <View style={styles.teamBoxScoreHeader}>
          <Image 
            source={{ uri: getTeamLogoUrl('mlb', team?.abbreviation) }} 
            style={styles.teamBoxScoreLogo}
            defaultSource={{ uri: 'https://via.placeholder.com/30x30?text=MLB' }}
          />
          <Text style={styles.sectionTitle}>{team?.name || 'Team'}</Text>
        </View>

        {/* Batting Stats */}
        <View style={[styles.statCategoryContainer, { backgroundColor: theme.surface }]}>
          <Text style={[styles.statCategoryTitle, { color: colors.primary }]}>Batting</Text>
          <View style={styles.statTableHeader}>
            <Text style={styles.statTableHeaderPlayer}>Player</Text>
            <Text style={styles.statTableHeaderStat}>AB</Text>
            <Text style={styles.statTableHeaderStat}>R</Text>
            <Text style={styles.statTableHeaderStat}>H</Text>
            <Text style={styles.statTableHeaderStat}>RBI</Text>
            <Text style={styles.statTableHeaderStat}>AVG</Text>
          </View>
          {batters.slice(0, 9).map((batterId, index) => {
            const player = teamStats.players?.[`ID${batterId}`];
            if (!player) return null;
            
            const stats = player.stats?.batting || {};
            return (
              <TouchableOpacity 
                key={batterId} 
                style={styles.statTableRow}
                onPress={() => handlePlayerPress(player, team)}
              >
                <View style={styles.statTablePlayerCell}>
                  <Text style={styles.statTablePlayerName}>
                    {player.person?.fullName || 'Unknown Player'}
                  </Text>
                  <Text style={styles.statTablePlayerNumber}>
                    #{player.jerseyNumber || '--'} {player.position?.abbreviation || ''}
                  </Text>
                </View>
                <Text style={styles.statTableStatCell}>{stats.atBats || 0}</Text>
                <Text style={styles.statTableStatCell}>{stats.runs || 0}</Text>
                <Text style={styles.statTableStatCell}>{stats.hits || 0}</Text>
                <Text style={styles.statTableStatCell}>{stats.rbi || 0}</Text>
                <Text style={styles.statTableStatCell}>{player.seasonStats?.batting?.avg || '.000'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Pitching Stats */}
        <View style={[styles.statCategoryContainer, { backgroundColor: theme.surface }]}>
          <Text style={[styles.statCategoryTitle, { color: colors.primary }]}>Pitching</Text>
          <View style={styles.statTableHeader}>
            <Text style={styles.statTableHeaderPlayer}>Player</Text>
            <Text style={styles.statTableHeaderStat}>IP</Text>
            <Text style={styles.statTableHeaderStat}>H</Text>
            <Text style={styles.statTableHeaderStat}>R</Text>
            <Text style={styles.statTableHeaderStat}>ER</Text>
            <Text style={styles.statTableHeaderStat}>ERA</Text>
          </View>
          {pitchers.map((pitcherId, index) => {
            const player = teamStats.players?.[`ID${pitcherId}`];
            if (!player) return null;
            
            const stats = player.stats?.pitching || {};
            return (
              <TouchableOpacity 
                key={pitcherId} 
                style={styles.statTableRow}
                onPress={() => handlePlayerPress(player, team)}
              >
                <View style={styles.statTablePlayerCell}>
                  <Text style={styles.statTablePlayerName}>
                    {player.person?.fullName || 'Unknown Player'}
                  </Text>
                  <Text style={styles.statTablePlayerNumber}>
                    #{player.jerseyNumber || '--'} {player.position?.abbreviation || ''}
                  </Text>
                </View>
                <Text style={styles.statTableStatCell}>{stats.inningsPitched || '0.0'}</Text>
                <Text style={styles.statTableStatCell}>{stats.hits || 0}</Text>
                <Text style={styles.statTableStatCell}>{stats.runs || 0}</Text>
                <Text style={styles.statTableStatCell}>{stats.earnedRuns || 0}</Text>
                <Text style={styles.statTableStatCell}>{player.seasonStats?.pitching?.era || '0.00'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderTeamStats = () => {
    if (!gameData?.liveData?.boxscore?.teams) return null;

    const awayTeam = gameData.gameData?.teams?.away;
    const homeTeam = gameData.gameData?.teams?.home;
    const awayStats = gameData.liveData.boxscore.teams.away?.teamStats?.batting || {};
    const homeStats = gameData.liveData.boxscore.teams.home?.teamStats?.batting || {};

    const awayColor = MLBService.getTeamColor(awayTeam?.name || awayTeam?.team?.name);
    const homeColor = MLBService.getTeamColor(homeTeam?.name || homeTeam?.team?.name);

    // Helper function to render stats row with bars
    const renderStatsRow = (label, awayValue, homeValue) => {
      const awayNum = typeof awayValue === 'number' ? awayValue : parseFloat(awayValue) || 0;
      const homeNum = typeof homeValue === 'number' ? homeValue : parseFloat(homeValue) || 0;
      const total = awayNum + homeNum;
      const awayPercent = total > 0 ? (awayNum / total) * 100 : 50;
      const homePercent = total > 0 ? (homeNum / total) * 100 : 50;

      return (
        <View key={label} style={{ marginBottom: 28 }}>
          <View style={styles.statsRow}>
            <Text style={[styles.statsValue, { color: theme.text }]}>{awayValue}</Text>
            <View style={styles.statsBarContainer}>
              <View style={[styles.statsBar, { 
                flexDirection: 'row', 
                overflow: 'hidden', 
                borderRadius: 10,
                backgroundColor: theme.surface
              }]}>
                <View
                  style={[
                    styles.statsBarFill,
                    { 
                      width: `${awayPercent}%`, 
                      backgroundColor: awayColor, 
                      height: '100%',
                      borderTopLeftRadius: 10,
                      borderBottomLeftRadius: 10,
                      borderTopRightRadius: 0,
                      borderBottomRightRadius: 0
                    }
                  ]}
                />
                <View
                  style={[
                    styles.statsBarFill,
                    { 
                      width: `${homePercent}%`, 
                      backgroundColor: homeColor, 
                      height: '100%',
                      borderTopLeftRadius: 0,
                      borderBottomLeftRadius: 0,
                      borderTopRightRadius: 10,
                      borderBottomRightRadius: 10
                    }
                  ]}
                />
              </View>
            </View>
            <Text style={[styles.statsValue, { color: theme.text }]}>{homeValue}</Text>
          </View>
          <View style={{ alignItems: 'center', marginTop: -25 }}>
            <Text style={[styles.statsLabel, { color: theme.textSecondary }]}>{label}</Text>
          </View>
        </View>
      );
    };

    return (
      <View style={[styles.teamStatsContainer, { 
        backgroundColor: theme.surface,
        shadowColor: isDarkMode ? '#ffffff' : '#000000'
      }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Team Statistics</Text>

        {/* Team Headers */}
        <View style={styles.statsTeams}>
          <View style={styles.statsTeam}>
            <Image
              source={{ uri: getTeamLogoUrl('mlb', awayTeam?.abbreviation) }}
              style={styles.statsTeamLogo}
              defaultSource={{ uri: 'https://via.placeholder.com/30x30?text=MLB' }}
            />
            <Text style={[styles.statsTeamName, { color: theme.text }]}>{awayTeam?.name || 'Away Team'}</Text>
          </View>
          <View style={styles.statsTeam}>
            <Image
              source={{ uri: getTeamLogoUrl('mlb', homeTeam?.abbreviation) }}
              style={styles.statsTeamLogo}
              defaultSource={{ uri: 'https://via.placeholder.com/30x30?text=MLB' }}
            />
            <Text style={[styles.statsTeamName, { color: theme.text }]}>{homeTeam?.name || 'Home Team'}</Text>
          </View>
        </View>

        {/* Stats Rows */}
        <View style={styles.statsSection}>
          {renderStatsRow('Hits', awayStats.hits || 0, homeStats.hits || 0)}
          {renderStatsRow('At Bats', awayStats.atBats || 0, homeStats.atBats || 0)}
          {renderStatsRow('Batting Avg', parseFloat(awayStats.avg || 0).toFixed(3), parseFloat(homeStats.avg || 0).toFixed(3))}
          {renderStatsRow('OPS', parseFloat(awayStats.ops || 0).toFixed(3), parseFloat(homeStats.ops || 0).toFixed(3))}
          {renderStatsRow('Strikeouts', awayStats.strikeOuts || 0, homeStats.strikeOuts || 0)}
          {renderStatsRow('Walks', awayStats.baseOnBalls || 0, homeStats.baseOnBalls || 0)}
          {renderStatsRow('Left on Base', awayStats.leftOnBase || 0, homeStats.leftOnBase || 0)}
          {renderStatsRow('Home Runs', awayStats.homeRuns || 0, homeStats.homeRuns || 0)}
          {renderStatsRow('Stolen Bases', awayStats.stolenBases || 0, homeStats.stolenBases || 0)}
        </View>
      </View>
    );
  };

  const renderPlaysContent = () => {
    console.log('renderPlaysContent called, loadingPlays:', loadingPlays, 'isIncrementalUpdate:', isIncrementalUpdate);
    
    // Only show loading if it's not an incremental update
    if (loadingPlays && !isIncrementalUpdate) {
      console.log('Showing loading spinner');
      return (
        <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading Plays...</Text>
        </View>
      );
    }

    if (!playsData) {
      return (
        <View style={styles.placeholderContainer}>
          <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>No plays data available</Text>
        </View>
      );
    }

    console.log('Rendering plays section with', playsData.allPlays?.length, 'plays');
    return (
      <View style={[styles.section, { backgroundColor: theme.surface }]}>
        {renderPlayByPlay()}
      </View>
    );
  };

  const renderMomentumChart = () => {
    if (!gameData?.liveData?.linescore?.innings) return null;

    const awayTeam = gameData.gameData?.teams?.away;
    const homeTeam = gameData.gameData?.teams?.home;
    const innings = gameData.liveData.linescore.innings;
    
    // Get team colors from the team data or use defaults
    const awayColor = MLBService.getTeamColor(awayTeam?.name || awayTeam?.team?.name);
    const homeColor = MLBService.getTeamColor(homeTeam?.name || homeTeam?.team?.name);

    // Calculate momentum for each inning
    let momentumPoints = [];
    let cumulativeAwayRuns = 0;
    let cumulativeHomeRuns = 0;
    let cumulativeAwayHits = 0;
    let cumulativeHomeHits = 0;

    // Starting at balanced (50%)
    momentumPoints.push(50);

    innings.forEach((inning, index) => {
      const awayRuns = inning.away?.runs || 0;
      const homeRuns = inning.home?.runs || 0;
      const awayHits = inning.away?.hits || 0;
      const homeHits = inning.home?.hits || 0;

      cumulativeAwayRuns += awayRuns;
      cumulativeHomeRuns += homeRuns;
      cumulativeAwayHits += awayHits;
      cumulativeHomeHits += homeHits;

      // Calculate momentum based on runs and hits
      // Runs are weighted more heavily than hits
      const runDiff = cumulativeHomeRuns - cumulativeAwayRuns;
      const hitDiff = cumulativeHomeHits - cumulativeAwayHits;

      // Momentum calculation: runs worth 3x hits, with diminishing returns
      const momentumScore = (runDiff * 3) + (hitDiff * 1);

      // Convert to percentage (0-100, where 50 is balanced)
      // Use sigmoid-like function for smooth transitions
      let momentum = 50 + (momentumScore * 5);

      // Add some recent inning bias (what happened this inning affects momentum more)
      const recentRunDiff = homeRuns - awayRuns;
      const recentHitDiff = homeHits - awayHits;
      const recentMomentum = (recentRunDiff * 2) + (recentHitDiff * 0.5);
      momentum += recentMomentum * 3;

      // Cap between 10-90% for visual appeal
      momentum = Math.max(10, Math.min(90, momentum));

      momentumPoints.push(momentum);
    });

    // Ensure we have at least 9 innings for proper display
    const totalInnings = Math.max(9, innings.length);

    // Calculate individual inning data for both teams
    let inningData = [];

    for (let i = 0; i < totalInnings; i++) {
      if (i < innings.length) {
        const inning = innings[i];
        const awayRuns = inning.away?.runs || 0;
        const homeRuns = inning.home?.runs || 0;
        const awayHits = inning.away?.hits || 0;
        const homeHits = inning.home?.hits || 0;

        // Calculate combined activity for each team (runs worth more than hits)
        const awayActivity = (awayRuns * 3) + awayHits;
        const homeActivity = (homeRuns * 3) + homeHits;

        inningData.push({
          inning: i + 1,
          awayRuns: awayRuns,
          homeRuns: homeRuns,
          awayHits: awayHits,
          homeHits: homeHits,
          awayActivity: awayActivity,
          homeActivity: homeActivity
        });
      } else {
        // For innings beyond current game, show no activity
        inningData.push({
          inning: i + 1,
          awayRuns: 0,
          homeRuns: 0,
          awayHits: 0,
          homeHits: 0,
          awayActivity: 0,
          homeActivity: 0
        });
      }
    }

    // Find max activity for scaling bars
    const maxActivity = Math.max(...inningData.map(d => Math.max(d.awayActivity, d.homeActivity)), 1);

    return (
      <View style={[styles.momentumContainer, { backgroundColor: theme.surface }]}>
        <View style={[styles.momentumChartWhite, { 
          backgroundColor: theme.surface,
          shadowColor: isDarkMode ? '#ffffff' : '#000000'
        }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Momentum</Text>
          <View style={styles.teamLabels}>
            <View style={[styles.teamLabelContainer, styles.awayTeamLabel]}>
              <Image
                source={{ uri: getTeamLogoUrl('mlb', awayTeam?.abbreviation) }}
                style={styles.momentumTeamLogoAway}
              />
              <Text style={[styles.teamLabel, { color: theme.text }]}>
                {awayTeam?.abbreviation || 'AWAY'}
              </Text>
            </View>
            <View style={[styles.teamLabelContainer, styles.homeTeamLabel]}>
              <Text style={[styles.teamLabel, { color: theme.text }]}>
                {homeTeam?.abbreviation || 'HOME'}
              </Text>
              <Image
                source={{ uri: getTeamLogoUrl('mlb', homeTeam?.abbreviation) }}
                style={styles.momentumTeamLogoHome}
              />
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.inningBarsContainer}>
              {inningData.map((data, index) => {
                const awayBarHeight = data.awayActivity > 0 ? Math.max(8, (data.awayActivity / maxActivity) * 40) : 0;
                const homeBarHeight = data.homeActivity > 0 ? Math.max(8, (data.homeActivity / maxActivity) * 40) : 0;

                return (
                  <View key={index} style={styles.inningBar}>
                    {/* Inning label at center */}
                    <View style={styles.inningLabelContainer}>
                      <Text style={[styles.inningLabel, { color: theme.textSecondary }]}>
                        {data.inning}{data.inning === 1 ? 'st' : data.inning === 2 ? 'nd' : data.inning === 3 ? 'rd' : 'th'}
                      </Text>
                    </View>

                    {/* Away team bar (extends upward from center) */}
                    {data.awayActivity > 0 && (
                      <View style={[
                        styles.awayBarContainer,
                        { height: awayBarHeight }
                      ]}>
                        <View
                          style={[
                            styles.activityBar,
                            styles.awayBar,
                            { height: awayBarHeight, backgroundColor: awayColor }
                          ]}
                        />
                        {(data.awayRuns > 0 || data.awayHits > 0) && (
                          <Text style={[styles.barText, { position: 'absolute', top: -25, color: theme.text }]}>
                            {data.awayRuns}R {data.awayHits}H
                          </Text>
                        )}
                      </View>
                    )}

                    {/* Home team bar (extends downward from center) */}
                    {data.homeActivity > 0 && (
                      <View style={[
                        styles.homeBarContainer,
                        { height: homeBarHeight }
                      ]}>
                        <View
                          style={[
                            styles.activityBar,
                            styles.homeBar,
                            { height: homeBarHeight, backgroundColor: homeColor }
                          ]}
                        />
                        {(data.homeRuns > 0 || data.homeHits > 0) && (
                          <Text style={[styles.barText, { position: 'absolute', bottom: -20, color: theme.text }]}>
                            {data.homeRuns}R {data.homeHits}H
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    );
  };

  const renderPlayByPlay = () => {
    if (!playsData?.allPlays) return null;

    console.log('renderPlayByPlay called with', playsData.allPlays.length, 'plays');
    
    // Show all plays, not just scoring plays - reverse to show most recent first
    const allPlays = [...playsData.allPlays].reverse();

    return (
      <View style={styles.playsContainer}>
        <Text style={styles.sectionTitle}>Play-by-Play</Text>
        <ScrollView 
          ref={playsScrollViewRef}
          style={styles.playsScrollView}
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
            autoscrollToTopThreshold: 10
          }}
        >
          {allPlays.map((play, index) => {
            // Use a more unique key that includes multiple identifiers
            const playKey = `${play.about?.atBatIndex || 'unknown'}-${play.about?.playIndex || 0}-${play.about?.startTime || index}-${index}`;
            return renderPlayItem(play, playKey, index);
          })}
        </ScrollView>
      </View>
    );
  };

  const renderPlayItem = (play, playKey, index) => {
    const isOpen = openPlays.has(playKey);
    const inning = play.about?.inning || 0;
    const halfInning = play.about?.halfInning || 'top';
    const isTopInning = halfInning.toLowerCase() === 'top';
    const team = isTopInning ? gameData.gameData?.teams?.away : gameData.gameData?.teams?.home;
    
    // Check if this is a scoring play - only when runs are actually scored
    const isScoringPlay = (play.result?.rbi && play.result.rbi > 0) || 
                         (play.result?.description?.toLowerCase().includes('scores')) ||
                         (play.result?.description?.toLowerCase().includes('home run')) ||
                         (play.result?.description?.toLowerCase().includes(' run')) ||
                         (play.result?.eventType === 'home_run') ||
                         (play.result?.event?.toLowerCase().includes('home run')) ||
                         (play.about?.isScoringPlay === true);
    
    const teamColor = MLBService.getTeamColor(team?.name || '');
    const cardStyle = isScoringPlay ? 
      [styles.playCard, { backgroundColor: teamColor }] : 
      styles.playCard;
    
    const textColor = isScoringPlay ? '#fff' : '#333';

    return (
      <View key={playKey} style={cardStyle}>
        <TouchableOpacity
          style={styles.playHeader}
          onPress={() => {
            const newOpenPlays = new Set(openPlays);
            if (isOpen) {
              newOpenPlays.delete(playKey);
            } else {
              newOpenPlays.add(playKey);
            }
            setOpenPlays(newOpenPlays);
          }}
        >
          <View style={styles.playInfo}>
            <Image
              source={{ uri: getTeamLogoUrl('mlb', team?.abbreviation) }}
              style={styles.playTeamLogo}
              defaultSource={{ uri: 'https://via.placeholder.com/24x24?text=MLB' }}
            />
            <View style={styles.playSummary}>
              <Text style={[styles.playTeamName, { color: textColor }]}>{team?.abbreviation || 'TEAM'}</Text>
              <Text style={[styles.playResult, { color: textColor }]}>{play.result?.description || `${play.matchup?.batter.fullName} vs ${play.matchup?.pitcher.fullName}`}</Text>
            </View>
          </View>
          <View style={styles.playScoreSection}>
            <Text style={[styles.playInning, { color: textColor }]}>
              {isTopInning ? 'Top' : 'Bot'} {MLBService.getOrdinalSuffix(inning)}
            </Text>
            <Text style={[styles.playScore, { color: textColor }]}>
              {play.result?.awayScore || 0}-{play.result?.homeScore || 0}
            </Text>
            {renderPlayBasesSmall(play)}
          </View>
          <Text style={[styles.toggleIcon, isOpen && styles.toggleIconOpen, { color: textColor }]}>
            {isOpen ? '▼' : '▶'}
          </Text>
        </TouchableOpacity>

        {isOpen && (
          <View style={styles.playDetails}>
            {renderPlayPitches(play)}
          </View>
        )}
      </View>
    );
  };

  const renderPlayPitches = (play) => {
    const pitches = play.playEvents?.filter(event => event.isPitch) || [];

    if (pitches.length === 0) {
      return (
        <View style={styles.pitchSequenceBox}>
          <Text style={styles.pitchSequenceTitle}>At-Bat Result</Text>
          <Text style={styles.pitchDescription}>{play.result?.description}</Text>
        </View>
      );
    }

    return (
      <View style={styles.pitchSequenceBox}>
        <Text style={styles.pitchSequenceTitle}>At-Bat Pitches ({pitches.length} pitches)</Text>
        {pitches.map((pitch, index) => (
          <View key={index} style={styles.pitchRow}>
            <View style={styles.pitchNumber}>
              <Text style={styles.pitchNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.pitchInfo}>
              <View style={styles.pitchMainInfo}>
                <Text style={styles.pitchTypeText}>
                  {pitch.details?.type?.description || pitch.pitchData?.type?.description || 'Unknown'}
                </Text>
                {pitch.pitchData?.startSpeed && (
                  <Text style={styles.pitchSpeedText}>
                    {Math.round(pitch.pitchData.startSpeed)} mph
                  </Text>
                )}
                <Text style={styles.pitchCountText}>
                  ({pitch.count?.balls || 0}-{pitch.count?.strikes || 0})
                </Text>
              </View>
              <Text style={styles.pitchActionText}>
                {pitch.details?.description || 'Pitch thrown'}
              </Text>
            </View>
          </View>
        ))}
        {renderPitchVisualization(pitches, play)}
      </View>
    );
  };

  const renderPitchVisualization = (pitches, play) => {
    // Handle both single pitch and array of pitches for backward compatibility
    const pitchArray = Array.isArray(pitches) ? pitches : [pitches];
    
    if (!pitchArray || pitchArray.length === 0) {
      return null;
    }

    // Get batter and pitcher from the play's matchup data
    const batter = play?.matchup?.batter || {};
    const pitcher = play?.matchup?.pitcher || {};

    // Generate headshot URLs using MLB's official format
    const batterHeadshot = batter.id ? 
      `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${batter.id}/headshot/67/current` : null;
    const pitcherHeadshot = pitcher.id ? 
      `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${pitcher.id}/headshot/67/current` : null;

    return (
      <View style={styles.pitchVisualization}>
        {/* Batter Section */}
        <View style={styles.pitchPlayerSection}>
          {batterHeadshot && (
            <View style={styles.pitchPlayerInfo}>
              <Image
                source={{ uri: batterHeadshot }}
                style={styles.pitchPlayerHeadshot}
                defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=B' }}
              />
              <Text style={styles.pitchPlayerName}>
                {batter.fullName ? 
                  `${batter.fullName.split(' ')[0][0]}. ${batter.fullName.split(' ').pop()}` : 
                  'Batter'}
              </Text>
              <Text style={styles.pitchPlayerRole}>Batter</Text>
            </View>
          )}
        </View>

        {/* Strike Zone Visualization */}
        <View style={styles.strikeZoneContainer}>
          <View style={styles.strikeZoneOutline} />
          {pitchArray.map((pitch, index) => {
            // Try multiple coordinate sources
            let pitchData = null;
            
            if (pitch.pitchData?.coordinates) {
              pitchData = pitch.pitchData;
            } else if (pitch.coordinates) {
              pitchData = { coordinates: pitch.coordinates };
            } else if (pitch.pitchData?.pX !== undefined && pitch.pitchData?.pZ !== undefined) {
              pitchData = { coordinates: { pX: pitch.pitchData.pX, pZ: pitch.pitchData.pZ } };
            } else if (pitch.pitchNumber?.pX !== undefined && pitch.pitchNumber?.pZ !== undefined) {
              pitchData = { coordinates: { pX: pitch.pitchNumber.pX, pZ: pitch.pitchNumber.pZ } };
            } else if (pitch.pX !== undefined && pitch.pZ !== undefined) {
              pitchData = { coordinates: { pX: pitch.pX, pZ: pitch.pZ } };
            }
            
            if (!pitchData?.coordinates || (pitchData.coordinates.pX === undefined || pitchData.coordinates.pZ === undefined)) {
              return null;
            }

            // Convert plate coordinates to percentage - exact web algorithm
            const xPercent = ((pitchData.coordinates.pX + 2.0) / 4.0) * 100;
            const yPercent = pitchData.strikeZoneTop && pitchData.strikeZoneBottom ? 
              ((pitchData.strikeZoneTop - pitchData.coordinates.pZ) / 
               (pitchData.strikeZoneTop - pitchData.strikeZoneBottom)) * 60 + 20 : 50;

            // Constrain to visualization area
            const finalXPercent = Math.max(5, Math.min(95, xPercent));
            const finalYPercent = Math.max(5, Math.min(95, yPercent));

            // Convert percentages to pixel positions for React Native (120px container)
            const finalX = (finalXPercent / 100) * 120 - 6; // Center the 12px dot
            const finalY = (finalYPercent / 100) * 120 - 6; // Center the 12px dot

            // Determine pitch color based on call
            let pitchColor = '#4CAF50'; // Green for balls
            if (pitch.details?.isStrike) {
              pitchColor = '#f44336'; // Red for strikes
            } else if (pitch.details?.isInPlay) {
              pitchColor = '#2196F3'; // Blue for in play
            }

            return (
              <View
                key={index}
                style={[
                  styles.pitchLocation,
                  { 
                    backgroundColor: pitchColor,
                    left: finalX,
                    top: finalY,
                    position: 'absolute',
                    zIndex: 10,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }
                ]}
              >
                <Text style={styles.pitchNumberOnBall}>{index + 1}</Text>
              </View>
            );
          })}
        </View>

        {/* Pitcher Section */}
        <View style={styles.pitchPlayerSection}>
          {pitcherHeadshot && (
            <View style={styles.pitchPlayerInfo}>
              <Image
                source={{ uri: pitcherHeadshot }}
                style={styles.pitchPlayerHeadshot}
                defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=P' }}
              />
              <Text style={styles.pitchPlayerName}>
                {pitcher.fullName ? 
                  `${pitcher.fullName.split(' ')[0][0]}. ${pitcher.fullName.split(' ').pop()}` : 
                  'Pitcher'}
              </Text>
              <Text style={styles.pitchPlayerRole}>Pitcher</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderPlayBasesSmall = (play) => {
    const hasFirst = !!play.matchup?.postOnFirst;
    const hasSecond = !!play.matchup?.postOnSecond;
    const hasThird = !!play.matchup?.postOnThird;

    return (
      <View style={styles.playBasesSmall}>
        {/* Second base (top) */}
        <View style={[styles.playBaseSmall, styles.secondBaseSmall, hasSecond && [styles.occupiedBaseSmall, { backgroundColor: colors.primary }]]} />
        {/* First and Third base row */}
        <View style={styles.playBasesRowSmall}>
          <View style={[styles.playBaseSmall, styles.thirdBaseSmall, hasThird && [styles.occupiedBaseSmall, { backgroundColor: colors.primary }]]} />
          <View style={[styles.playBaseSmall, styles.firstBaseSmall, hasFirst && [styles.occupiedBaseSmall, { backgroundColor: colors.primary }]]} />
        </View>
      </View>
    );
  };

  const renderPlayBases = (play) => {
    if (!play.matchup?.postOnFirst && !play.matchup?.postOnSecond && !play.matchup?.postOnThird) {
      return null;
    }

    const hasFirst = !!play.matchup?.postOnFirst;
    const hasSecond = !!play.matchup?.postOnSecond;
    const hasThird = !!play.matchup?.postOnThird;

    return (
      <View style={styles.playBasesContainer}>
        <Text style={styles.basesTitle}>Bases After Play</Text>
        <View style={styles.playBasesDisplay}>
          <View style={styles.playBasesRow}>
            <View style={[styles.playBase, styles.thirdBase, hasThird && [styles.occupiedBase, { backgroundColor: colors.primary }]]} />
            <View style={[styles.playBase, styles.firstBase, hasFirst && [styles.occupiedBase, { backgroundColor: colors.primary }]]} />
          </View>
          <View style={[styles.playBase, styles.secondBase, hasSecond && [styles.occupiedBase, { backgroundColor: colors.primary }]]} />
        </View>
      </View>
    );
  };

  const renderProbablePitchers = () => {
    if (!gameData?.gameData?.teams) return null;

    const awayTeam = gameData.gameData.teams.away;
    const homeTeam = gameData.gameData.teams.home;
    
    // Try to get probable pitchers from different possible locations
    const awayPitcher = gameData.gameData.probablePitchers?.away || 
                       gameData.liveData?.boxscore?.teams?.away?.probablePitcher ||
                       awayTeam.probablePitcher;
    const homePitcher = gameData.gameData.probablePitchers?.home || 
                       gameData.liveData?.boxscore?.teams?.home?.probablePitcher ||
                       homeTeam.probablePitcher;

    return (
      <View style={[styles.section, { backgroundColor: theme.surface }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Probable Pitchers</Text>
        <View style={styles.probablePitchersContainer}>
          {/* Away Pitcher */}
          <View style={styles.pitcherCard}>
            <View style={styles.pitcherHeader}>
              <Image
                source={{ uri: MLBService.getLogoUrl(awayTeam?.name || '', awayTeam?.abbreviation) }}
                style={styles.pitcherTeamLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/24x24?text=MLB' }}
              />
              <Text style={styles.pitcherTeamName}>{awayTeam?.teamName || awayTeam?.name}</Text>
            </View>
            {awayPitcher ? (
              <View style={styles.pitcherInfo}>
                <Image
                  source={{ uri: MLBService.getHeadshotUrl(awayPitcher.id) }}
                  style={styles.pitcherHeadshot}
                  defaultSource={{ uri: 'https://via.placeholder.com/60x60?text=P' }}
                />
                <Text style={styles.pitcherName}>{awayPitcher.fullName}</Text>
                {probablePitcherStats.away?.pitching ? (
                  <View style={styles.pitcherStatsContainer}>
                    <Text style={styles.pitcherStats}>
                      {probablePitcherStats.away.pitching.wins || 0}-{probablePitcherStats.away.pitching.losses || 0}
                    </Text>
                    <Text style={styles.pitcherStats}>
                      {probablePitcherStats.away.pitching.era || '0.00'} ERA
                    </Text>
                    <Text style={styles.pitcherStats}>
                      {probablePitcherStats.away.pitching.whip || '0.00'} WHIP
                    </Text>
                    <Text style={styles.pitcherStats}>
                      {probablePitcherStats.away.pitching.strikeOuts || 0} K
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.pitcherStats}>Loading stats...</Text>
                )}
              </View>
            ) : (
              <Text style={styles.noPitcher}>TBD</Text>
            )}
          </View>

          {/* Home Pitcher */}
          <View style={styles.pitcherCard}>
            <View style={styles.pitcherHeader}>
              <Image
                source={{ uri: MLBService.getLogoUrl(homeTeam?.name || '', homeTeam?.abbreviation) }}
                style={styles.pitcherTeamLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/24x24?text=MLB' }}
              />
              <Text style={styles.pitcherTeamName}>{homeTeam?.teamName || homeTeam?.name}</Text>
            </View>
            {homePitcher ? (
              <View style={styles.pitcherInfo}>
                <Image
                  source={{ uri: MLBService.getHeadshotUrl(homePitcher.id) }}
                  style={styles.pitcherHeadshot}
                  defaultSource={{ uri: 'https://via.placeholder.com/60x60?text=P' }}
                />
                <Text style={styles.pitcherName}>{homePitcher.fullName}</Text>
                {probablePitcherStats.home?.pitching ? (
                  <View style={styles.pitcherStatsContainer}>
                    <Text style={styles.pitcherStats}>
                      {probablePitcherStats.home.pitching.wins || 0}-{probablePitcherStats.home.pitching.losses || 0}
                    </Text>
                    <Text style={styles.pitcherStats}>
                      {probablePitcherStats.home.pitching.era || '0.00'} ERA
                    </Text>
                    <Text style={styles.pitcherStats}>
                      {probablePitcherStats.home.pitching.whip || '0.00'} WHIP
                    </Text>
                    <Text style={styles.pitcherStats}>
                      {probablePitcherStats.home.pitching.strikeOuts || 0} K
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.pitcherStats}>Loading stats...</Text>
                )}
              </View>
            ) : (
              <Text style={styles.noPitcher}>TBD</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderTopHitters = () => {
    if (!gameData?.gameData?.teams) return null;

    const awayTeam = gameData.gameData.teams.away;
    const homeTeam = gameData.gameData.teams.home;

    return (
      <View style={[styles.section, { backgroundColor: theme.surface }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Top Hitters</Text>
        <View style={styles.topHittersContainer}>
          {/* Away Team */}
          <View style={styles.topHittersTeam}>
            <View style={styles.topHittersHeader}>
              <Image
                source={{ uri: getTeamLogoUrl('mlb', awayTeam?.abbreviation) }}
                style={styles.topHittersTeamLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/24x24?text=MLB' }}
              />
              <Text style={styles.topHittersTeamName}>{awayTeam?.teamName || awayTeam?.name}</Text>
            </View>
            {topHitters.away && topHitters.away.length > 0 ? (
              topHitters.away.slice(0, 3).map((hitter, index) => (
                <View key={hitter.player?.id || index} style={styles.topHitterRow}>
                  <View style={styles.topHitterLeft}>
                    <Text style={styles.topHitterPosition}>{hitter.position?.abbreviation || 'N/A'}</Text>
                    <Image
                      source={{ uri: MLBService.getHeadshotUrl(hitter.player?.id) }}
                      style={styles.topHitterHeadshot}
                      defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=P' }}
                    />
                    <View style={styles.topHitterInfo}>
                      <Text style={styles.topHitterName}>{hitter.player?.fullName}</Text>
                      <View style={styles.topHitterStatsRow}>
                        <View style={styles.topHitterStatItem}>
                          <Text style={styles.topHitterStatValue}>
                            {hitter.stat?.avg || '.000'}
                          </Text>
                          <Text style={styles.topHitterStatLabel}>AVG</Text>
                        </View>
                        <View style={styles.topHitterStatItem}>
                          <Text style={styles.topHitterStatValue}>
                            {hitter.stat?.ops || '.000'}
                          </Text>
                          <Text style={styles.topHitterStatLabel}>OPS</Text>
                        </View>
                        <View style={styles.topHitterStatItem}>
                          <Text style={styles.topHitterStatValue}>
                            {hitter.stat?.homeRuns || 0}
                          </Text>
                          <Text style={styles.topHitterStatLabel}>HR</Text>
                        </View>
                        <View style={styles.topHitterStatItem}>
                          <Text style={styles.topHitterStatValue}>
                            {hitter.stat?.rbi || 0}
                          </Text>
                          <Text style={styles.topHitterStatLabel}>RBI</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.loadingHitters}>Loading...</Text>
            )}
          </View>

          {/* Home Team */}
          <View style={styles.topHittersTeam}>
            <View style={styles.topHittersHeader}>
              <Image
                source={{ uri: getTeamLogoUrl('mlb', homeTeam?.abbreviation) }}
                style={styles.topHittersTeamLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/24x24?text=MLB' }}
              />
              <Text style={styles.topHittersTeamName}>{homeTeam?.teamName || homeTeam?.name}</Text>
            </View>
            {topHitters.home && topHitters.home.length > 0 ? (
              topHitters.home.slice(0, 3).map((hitter, index) => (
                <View key={hitter.player?.id || index} style={styles.topHitterRow}>
                  <View style={styles.topHitterLeft}>
                    <Text style={styles.topHitterPosition}>{hitter.position?.abbreviation || 'N/A'}</Text>
                    <Image
                      source={{ uri: MLBService.getHeadshotUrl(hitter.player?.id) }}
                      style={styles.topHitterHeadshot}
                      defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=P' }}
                    />
                    <View style={styles.topHitterInfo}>
                      <Text style={styles.topHitterName}>{hitter.player?.fullName}</Text>
                      <View style={styles.topHitterStatsRow}>
                        <View style={styles.topHitterStatItem}>
                          <Text style={styles.topHitterStatValue}>
                            {hitter.stat?.avg || '.000'}
                          </Text>
                          <Text style={styles.topHitterStatLabel}>AVG</Text>
                        </View>
                        <View style={styles.topHitterStatItem}>
                          <Text style={styles.topHitterStatValue}>
                            {hitter.stat?.ops || '.000'}
                          </Text>
                          <Text style={styles.topHitterStatLabel}>OPS</Text>
                        </View>
                        <View style={styles.topHitterStatItem}>
                          <Text style={styles.topHitterStatValue}>
                            {hitter.stat?.homeRuns || 0}
                          </Text>
                          <Text style={styles.topHitterStatLabel}>HR</Text>
                        </View>
                        <View style={styles.topHitterStatItem}>
                          <Text style={styles.topHitterStatValue}>
                            {hitter.stat?.rbi || 0}
                          </Text>
                          <Text style={styles.topHitterStatLabel}>RBI</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.loadingHitters}>Loading...</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderSeasonStats = () => {
    if (!gameData?.gameData?.teams) return null;

    const awayTeam = gameData.gameData.teams.away;
    const homeTeam = gameData.gameData.teams.home;
    const awayStats = seasonStats.away;
    const homeStats = seasonStats.home;

    if (!awayStats || !homeStats) {
      return (
        <View style={styles.teamStatsContainer}>
          <Text style={styles.sectionTitle}>Season Statistics</Text>
          <View style={styles.seasonStatsContainer}>
            <Text style={styles.placeholderText}>Loading season statistics...</Text>
          </View>
        </View>
      );
    }

    const awayColor = MLBService.getTeamColor(awayTeam?.name || awayTeam?.team?.name);
    const homeColor = MLBService.getTeamColor(homeTeam?.name || homeTeam?.team?.name);

    // Helper function to render stats row with bars
    const renderStatsRow = (label, awayValue, homeValue) => {
      const awayNum = typeof awayValue === 'number' ? awayValue : parseFloat(awayValue) || 0;
      const homeNum = typeof homeValue === 'number' ? homeValue : parseFloat(homeValue) || 0;
      const total = awayNum + homeNum;
      const awayPercent = total > 0 ? (awayNum / total) * 100 : 50;
      const homePercent = total > 0 ? (homeNum / total) * 100 : 50;

      return (
        <View key={label} style={{ marginBottom: 28 }}>
          <View style={styles.statsRow}>
            <Text style={styles.statsValue}>{awayValue}</Text>
            <View style={styles.statsBarContainer}>
              <View style={[styles.statsBar, { 
                flexDirection: 'row', 
                overflow: 'hidden', 
                borderRadius: 10,
                backgroundColor: theme.surface
              }]}>
                <View
                  style={[
                    styles.statsBarFill,
                    { 
                      width: `${awayPercent}%`, 
                      backgroundColor: awayColor, 
                      height: '100%',
                      borderTopLeftRadius: 10,
                      borderBottomLeftRadius: 10,
                      borderTopRightRadius: 0,
                      borderBottomRightRadius: 0
                    }
                  ]}
                />
                <View
                  style={[
                    styles.statsBarFill,
                    { 
                      width: `${homePercent}%`, 
                      backgroundColor: homeColor, 
                      height: '100%',
                      borderTopLeftRadius: 0,
                      borderBottomLeftRadius: 0,
                      borderTopRightRadius: 10,
                      borderBottomRightRadius: 10
                    }
                  ]}
                />
              </View>
            </View>
            <Text style={styles.statsValue}>{homeValue}</Text>
          </View>
          <View style={{ alignItems: 'center', marginTop: -25 }}>
            <Text style={styles.statsLabel}>{label}</Text>
          </View>
        </View>
      );
    };

    return (
      <View style={styles.teamStatsContainer}>
        <Text style={styles.sectionTitle}>Season Statistics</Text>

        {/* Team Headers */}
        <View style={styles.statsTeams}>
          <View style={styles.statsTeam}>
            <Image
              source={{ uri: MLBService.getLogoUrl(awayTeam?.name || '', awayTeam?.abbreviation) }}
              style={styles.statsTeamLogo}
              defaultSource={{ uri: 'https://via.placeholder.com/30x30?text=MLB' }}
            />
            <Text style={styles.statsTeamName}>{awayTeam?.name || 'Away Team'}</Text>
          </View>
          <View style={styles.statsTeam}>
            <Image
              source={{ uri: MLBService.getLogoUrl(homeTeam?.name || '', homeTeam?.abbreviation) }}
              style={styles.statsTeamLogo}
              defaultSource={{ uri: 'https://via.placeholder.com/30x30?text=MLB' }}
            />
            <Text style={styles.statsTeamName}>{homeTeam?.name || 'Home Team'}</Text>
          </View>
        </View>

        {/* Stats Rows */}
        <View style={styles.statsSection}>
          {renderStatsRow('Runs Per Game', parseFloat((awayStats.hitting?.runs || 0) / (awayStats.hitting?.gamesPlayed || 1)).toFixed(3), parseFloat((homeStats.hitting?.runs || 0) / (homeStats.hitting?.gamesPlayed || 1)).toFixed(3))}
          {renderStatsRow('Hits Per Game', parseFloat((awayStats.hitting?.hits || 0) / (awayStats.hitting?.gamesPlayed || 1)).toFixed(3), parseFloat((homeStats.hitting?.hits || 0) / (homeStats.hitting?.gamesPlayed || 1)).toFixed(3))}
          {renderStatsRow('Batting Avg', parseFloat(awayStats.hitting?.avg || 0).toFixed(3), parseFloat(homeStats.hitting?.avg || 0).toFixed(3))}
          {renderStatsRow('OPS', parseFloat(awayStats.hitting?.ops || 0).toFixed(3), parseFloat(homeStats.hitting?.ops || 0).toFixed(3))}
          {renderStatsRow('Home Runs', awayStats.hitting?.homeRuns || 0, homeStats.hitting?.homeRuns || 0)}
          {renderStatsRow('Stolen Base %', awayStats.hitting?.stolenBasePercentage || 0, homeStats.hitting?.stolenBasePercentage || 0)}
          {renderStatsRow('ERA', parseFloat(awayStats.pitching?.era || 0).toFixed(2), parseFloat(homeStats.pitching?.era || 0).toFixed(2))}
          {renderStatsRow('WHIP', parseFloat(awayStats.pitching?.whip || 0).toFixed(2), parseFloat(homeStats.pitching?.whip || 0).toFixed(2))}
          {renderStatsRow('Strike %', awayStats.pitching?.strikePercentage || 0, homeStats.pitching?.strikePercentage || 0)}
        </View>
      </View>
    );
  };

  const renderTeamRoster = (team) => {
    if (!team) return null;

    const teamType = team.id === gameData?.gameData?.teams?.away?.id ? 'away' : 'home';
    const roster = teamType === 'away' ? awayRoster : homeRoster;

    if (loadingRoster || !roster) {
      return (
        <View style={styles.rosterContainer}>
          <ActivityIndicator size="large" color="#002D72" />
          <Text style={styles.placeholderText}>Loading roster...</Text>
        </View>
      );
    }

    // Group players by position
    const pitchers = roster.filter(player => player.position?.abbreviation === 'P');
    const catchers = roster.filter(player => player.position?.abbreviation === 'C');
    const infielders = roster.filter(player => ['1B', '2B', '3B', 'SS'].includes(player.position?.abbreviation));
    const outfielders = roster.filter(player => ['LF', 'CF', 'RF', 'OF'].includes(player.position?.abbreviation));
    const others = roster.filter(player => !['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF'].includes(player.position?.abbreviation));

    const renderPlayerSection = (title, players) => {
      if (players.length === 0) return null;

      return (
        <View style={styles.rosterSection}>
          <Text style={styles.rosterSectionTitle}>{title}</Text>
          <View style={styles.rosterTableContainer}>
            <View style={styles.rosterTableHeader}>
              <Text style={styles.rosterTableHeaderPlayer}>Player</Text>
              <Text style={styles.rosterTableHeaderStatus}>Status</Text>
            </View>
            {players.map((player) => (
              <View key={player.person.id} style={styles.rosterTableRow}>
                <View style={styles.rosterTablePlayerCell}>
                  <Text style={styles.rosterTablePlayerName}>
                    {player.person.fullName}
                  </Text>
                  <Text style={styles.rosterTablePlayerDetails}>
                    <Text style={styles.rosterTablePlayerNumber}>#{player.jerseyNumber || '--'}</Text>
                    {' • '}
                    {player.position?.abbreviation || 'N/A'}
                  </Text>
                </View>
                <View style={styles.rosterTableStatusCell}>
                  <Text style={[
                    styles.rosterTableStatusText,
                    player.status?.code === 'A' ? styles.activeStatus : styles.inactiveStatus
                  ]}>
                    {player.status?.code === 'A' ? 'Active' : player.status?.description || 'Inactive'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      );
    };

    return (
      <ScrollView style={styles.rosterContainer}>
        {renderPlayerSection('Pitchers', pitchers)}
        {renderPlayerSection('Catchers', catchers)}
        {renderPlayerSection('Infielders', infielders)}
        {renderPlayerSection('Outfielders', outfielders)}
        {others.length > 0 && renderPlayerSection('Others', others)}
      </ScrollView>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'stats':
        return renderStatsContent();
      case 'away':
        return renderTeamContent('away');
      case 'home':
        return renderTeamContent('home');
      case 'plays':
        return renderPlaysContent();
      default:
        return renderStatsContent();
    }
  };

  const renderPlayerGameStats = (stats, player) => {
    if (!stats) return null;

    const isPitcher = player.position?.abbreviation === 'P' || player.allPositions?.some(pos => pos.abbreviation === 'P');
    const battingStats = stats.batting || {};
    const pitchingStats = stats.pitching || {};

    // Format game date properly
    const formatGameDate = (dateStr) => {
      const date = new Date(dateStr);
      const day = date.getDate();
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const year = date.getFullYear();
      return `${day} ${month} ${year}`;
    };

    const gameDate = gameData?.gameData?.datetime?.originalDate 
      ? formatGameDate(gameData.gameData.datetime.originalDate)
      : formatGameDate(new Date());

    return (
      <View>
        {/* Game Info */}
        <View style={styles.gameStatsHeader}>
          <Text style={styles.gameStatsTitle}>Game Statistics</Text>
          <Text style={styles.gameStatsDate}>{gameDate}</Text>
        </View>

        {/* Batting Stats */}
        {Object.keys(battingStats).length > 0 && (
          <View style={[styles.statCategoryContainer, { backgroundColor: theme.surface }]}>
            <Text style={[styles.statCategoryTitle, { color: colors.primary }]}>⚾ Batting</Text>
            
            {/* First row: 3 stats */}
            <View style={styles.statGridRow}>
              <View style={styles.statBox}>
                <Text style={[styles.statBoxValue, { color: theme.text }]}>{battingStats.hits || 0}/{battingStats.atBats || 0}</Text>
                <Text style={styles.statBoxLabel}>H/AB</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statBoxValue, { color: theme.text }]}>{battingStats.runs || 0}</Text>
                <Text style={styles.statBoxLabel}>R</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statBoxValue, { color: theme.text }]}>{battingStats.rbi || 0}</Text>
                <Text style={styles.statBoxLabel}>RBI</Text>
              </View>
            </View>
            
            {/* Second row: 3 stats */}
            <View style={styles.statGridRow}>
              <View style={styles.statBox}>
                <Text style={styles.statBoxValue}>{battingStats.homeRuns || 0}</Text>
                <Text style={styles.statBoxLabel}>HR</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statBoxValue}>{battingStats.baseOnBalls || 0}</Text>
                <Text style={styles.statBoxLabel}>BB</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statBoxValue}>{battingStats.strikeOuts || 0}</Text>
                <Text style={styles.statBoxLabel}>SO</Text>
              </View>
            </View>
            
            {/* Third row: 3 stats */}
            <View style={styles.statGridRow}>
              <View style={styles.statBox}>
                <Text style={styles.statBoxValue}>{(battingStats.singles || 0) + (battingStats.doubles || 0) + (battingStats.triples || 0) + (battingStats.homeRuns || 0)}</Text>
                <Text style={styles.statBoxLabel}>TB</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statBoxValue}>{battingStats.stolenBases || 0}</Text>
                <Text style={styles.statBoxLabel}>SB</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statBoxValue}>{battingStats.leftOnBase || 0}</Text>
                <Text style={styles.statBoxLabel}>LOB</Text>
              </View>
            </View>
          </View>
        )}

        {/* Pitching Stats */}
        {Object.keys(pitchingStats).length > 0 && (
          <View style={[styles.statCategoryContainer, { backgroundColor: theme.surface }]}>
            <Text style={[styles.statCategoryTitle, { color: colors.primary }]}>🥎 Pitching</Text>
            
            {/* First row: 3 stats */}
            <View style={styles.statGridRow}>
              <View style={styles.statBox}>
                <Text style={styles.statBoxValue}>{pitchingStats.inningsPitched || '0.0'}</Text>
                <Text style={styles.statBoxLabel}>IP</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statBoxValue}>{pitchingStats.hits || 0}</Text>
                <Text style={styles.statBoxLabel}>H</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statBoxValue}>{pitchingStats.runs || 0}</Text>
                <Text style={styles.statBoxLabel}>R</Text>
              </View>
            </View>
            
            {/* Second row: 3 stats */}
            <View style={styles.statGridRow}>
              <View style={styles.statBox}>
                <Text style={styles.statBoxValue}>{pitchingStats.earnedRuns || 0}</Text>
                <Text style={styles.statBoxLabel}>ER</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statBoxValue}>{pitchingStats.baseOnBalls || 0}</Text>
                <Text style={styles.statBoxLabel}>BB</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statBoxValue}>{pitchingStats.strikeOuts || 0}</Text>
                <Text style={styles.statBoxLabel}>K</Text>
              </View>
            </View>
            
            {/* Third row: 3 stats (P and ST separated) */}
            <View style={styles.statGridRow}>
              <View style={styles.statBox}>
                <Text style={styles.statBoxValue}>{pitchingStats.numberOfPitches || 0}</Text>
                <Text style={styles.statBoxLabel}>P</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statBoxValue}>{pitchingStats.strikes || 0}</Text>
                <Text style={styles.statBoxLabel}>ST</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statBoxValue}>{pitchingStats.strikePercentage || '0.00'}</Text>
                <Text style={styles.statBoxLabel}>K%</Text>
              </View>
            </View>
          </View>
        )}

        {/* No Stats Message */}
        {Object.keys(battingStats).length === 0 && Object.keys(pitchingStats).length === 0 && (
          <View style={styles.noStatsContainer}>
            <Text style={styles.noStatsText}>No statistics available for this game</Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading Game Details...</Text>
      </View>
    );
  }

  if (!gameData) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.textSecondary }]}>Game data not available</Text>
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => loadGameDetails()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {renderGameHeader()}
        {renderTabNavigation()}
        {renderTabContent()}
      </ScrollView>
      {renderStickyHeader()}
      
      {/* Player Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={playerModalVisible}
        onRequestClose={closePlayerModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            {/* Close Button */}
            <TouchableOpacity style={styles.modalCloseButton} onPress={closePlayerModal}>
              <Text style={styles.modalCloseText}>×</Text>
            </TouchableOpacity>

            {selectedPlayer && (
              <>
                {/* Player Header */}
                <View style={styles.playerHeader}>
                  <Image 
                    source={{ 
                      uri: MLBService.getHeadshotUrl(selectedPlayer.person?.id) 
                    }}
                    style={styles.playerHeadshot}
                    defaultSource={{ uri: 'https://via.placeholder.com/80x80?text=Player' }}
                  />
                  <View style={styles.playerInfo}>
                    <Text style={[styles.playerName, { color: theme.text }]}>
                      {selectedPlayer.person?.fullName || 'Unknown Player'}
                    </Text>
                    <Text style={[styles.playerDetails, { color: theme.textSecondary }]}>
                      #{selectedPlayer.jerseyNumber || 'N/A'} • {selectedPlayer.position?.abbreviation || 'N/A'}
                    </Text>
                    <View style={styles.playerTeamInfo}>
                      <Image 
                        source={{ uri: MLBService.getLogoUrl(selectedPlayer.team?.name || '', selectedPlayer.team?.abbreviation) }}
                        style={styles.playerTeamLogo}
                        defaultSource={{ uri: 'https://via.placeholder.com/20x20?text=MLB' }}
                      />
                      <Text style={[styles.playerTeamName, { color: colors.primary }]}>
                        {selectedPlayer.team?.name || 'Unknown Team'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Player Stats */}
                <View style={styles.playerStatsContainer}>
                  {loadingPlayerStats ? (
                    <View style={styles.playerStatsLoading}>
                      <ActivityIndicator size="large" color="#002D72" />
                      <Text style={styles.loadingText}>Loading player stats...</Text>
                    </View>
                  ) : playerStats ? (
                    <ScrollView style={styles.playerStatsContent}>
                      {renderPlayerGameStats(playerStats, selectedPlayer)}
                    </ScrollView>
                  ) : (
                    <Text style={styles.noStatsText}>Unable to load player statistics</Text>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Stream Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={streamModalVisible}
        onRequestClose={closeStreamModal}
      >
        <View style={styles.streamModalOverlay}>
          <View style={[styles.streamModalContainer, { backgroundColor: theme.surface }]}>
            {/* Modal Header */}
            <View style={[styles.streamModalHeader, { backgroundColor: theme.surfaceSecondary, borderBottomColor: theme.border }]}>
              <Text style={[styles.streamModalTitle, { color: colors.primary }]}>Live Stream</Text>
              <TouchableOpacity style={[styles.streamCloseButton, { backgroundColor: theme.surfaceSecondary }]} onPress={closeStreamModal}>
                <Text style={[styles.streamCloseText, { color: colors.primary }]}>×</Text>
              </TouchableOpacity>
            </View>

            {/* Stream Buttons */}
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={[styles.streamButtonsContainer, { backgroundColor: theme.surfaceSecondary, borderBottomColor: theme.border }]}
              contentContainerStyle={styles.streamButtonsContent}
            >
              {Object.keys(availableStreams).slice(0, 5).map((streamKey, index) => {
                // Extract source name and capitalize it
                const sourceName = streamKey.replace(/\d+$/, ''); // Remove numbers at the end
                const capitalizedName = sourceName.charAt(0).toUpperCase() + sourceName.slice(1);
                
                return (
                  <TouchableOpacity
                    key={streamKey}
                    style={[
                      styles.streamButton,
                      { backgroundColor: currentStreamType === streamKey ? colors.primary : theme.surfaceSecondary },
                      { borderColor: theme.border }
                    ]}
                    onPress={() => switchStream(streamKey)}
                  >
                    <Text style={[
                      styles.streamButtonText,
                      { color: currentStreamType === streamKey ? '#fff' : colors.primary }
                    ]}>
                      {capitalizedName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* WebView Container */}
            <View style={styles.webViewContainer}>
              {isStreamLoading && (
                <View style={styles.streamLoadingOverlay}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.streamLoadingText, { color: '#fff' }]}>Loading stream...</Text>
                </View>
              )}
              {streamUrl ? (
                <WebView
                  source={{ uri: streamUrl }}
                  style={styles.webView}
                  onLoadStart={() => setIsStreamLoading(true)}
                  onLoadEnd={() => setIsStreamLoading(false)}
                  onError={() => setIsStreamLoading(false)}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  allowsInlineMediaPlaybook={true}
                  mediaPlaybackRequiresUserAction={false}
                  userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                  injectedJavaScriptBeforeContentLoaded={`
                    // Early ad blocking - runs before page content loads
                    (function() {
                      // Block video ads immediately
                      const originalPlay = HTMLVideoElement.prototype.play;
                      HTMLVideoElement.prototype.play = function() {
                        // Check if this video looks like an ad
                        const src = this.src || this.currentSrc || '';
                        const adKeywords = ['ad', 'advertisement', 'commercial', 'sponsor', 'promo'];
                        const isAd = adKeywords.some(keyword => src.toLowerCase().includes(keyword));
                        
                        if (isAd) {
                          console.log('Blocked video ad:', src);
                          return Promise.resolve();
                        }
                        
                        return originalPlay.call(this);
                      };

                      // Block ad domains immediately
                      const adDomains = [
                        'googleads', 'doubleclick', 'googlesyndication', 'adsystem',
                        'amazon-adsystem', 'facebook.com/tr', 'google-analytics',
                        'googletagmanager', 'ads.yahoo', 'outbrain', 'taboola',
                        'criteo', 'pubmatic', 'rubiconproject', 'openx', 'media.net'
                      ];

                      // Override document.createElement early
                      const originalCreateElement = document.createElement;
                      document.createElement = function(tagName) {
                        const element = originalCreateElement.call(this, tagName);
                        
                        if (tagName.toLowerCase() === 'script' || tagName.toLowerCase() === 'iframe') {
                          const originalSetSrc = Object.getOwnPropertyDescriptor(
                            tagName.toLowerCase() === 'script' ? HTMLScriptElement.prototype : HTMLIFrameElement.prototype, 
                            'src'
                          ).set;
                          
                          Object.defineProperty(element, 'src', {
                            set: function(value) {
                              if (value && adDomains.some(domain => value.includes(domain))) {
                                console.log('Blocked early ad element:', value);
                                return;
                              }
                              originalSetSrc.call(this, value);
                            }
                          });
                        }
                        
                        return element;
                      };

                      // Block fetch early
                      if (window.fetch) {
                        const originalFetch = window.fetch;
                        window.fetch = function(...args) {
                          const url = args[0];
                          if (typeof url === 'string' && adDomains.some(domain => url.includes(domain))) {
                            console.log('Blocked early fetch:', url);
                            return Promise.reject(new Error('Ad blocked'));
                          }
                          return originalFetch.apply(this, args);
                        };
                      }

                      true;
                    })();
                  `}
                  injectedJavaScript={`
                    // Enhanced Ad blocking script with video ad focus
                    (function() {
                      console.log('Advanced ad blocker loaded');
                      
                      // Comprehensive ad domain list
                      const adDomains = [
                        'googleads.g.doubleclick.net', 'googlesyndication.com', 'google-analytics.com',
                        'googletagmanager.com', 'facebook.com/tr', 'ads.yahoo.com', 'adsystem.com',
                        'adskeeper.co.uk', 'adnxs.com', 'amazon-adsystem.com', 'media.net',
                        'outbrain.com', 'taboola.com', 'criteo.com', 'pubmatic.com', 'rubiconproject.com',
                        'openx.net', 'adsrvr.org', 'turn.com', 'bidswitch.net', 'rlcdn.com',
                        'casalemedia.com', 'contextweb.com', 'serving-sys.com', 'adform.net',
                        'adsafeprotected.com', 'moatads.com', 'scorecardresearch.com', 'quantserve.com',
                        'ads.', 'ad.', 'adsv', 'advertising', 'advertisement'
                      ];

                      // Video ad blocking
                      function blockVideoAds() {
                        const videos = document.querySelectorAll('video');
                        videos.forEach(video => {
                          // Skip videos that are clearly ads
                          const src = video.src || video.currentSrc || '';
                          const adKeywords = ['ad', 'advertisement', 'commercial', 'sponsor', 'promo', 'preroll'];
                          const isAd = adKeywords.some(keyword => src.toLowerCase().includes(keyword));
                          
                          if (isAd) {
                            video.pause();
                            video.currentTime = video.duration || 999;
                            video.style.display = 'none';
                            console.log('Blocked video ad');
                            return;
                          }

                          // Auto-skip ads by fast-forwarding
                          video.addEventListener('loadedmetadata', function() {
                            if (this.duration && this.duration < 60) { // Likely an ad if under 60 seconds
                              this.currentTime = this.duration;
                              console.log('Auto-skipped short video (likely ad)');
                            }
                          });

                          // Skip to end if video contains ad indicators
                          if (video.poster && adKeywords.some(keyword => video.poster.toLowerCase().includes(keyword))) {
                            video.currentTime = video.duration || 999;
                            console.log('Skipped video with ad poster');
                          }
                        });
                      }

                      // Enhanced element removal
                      const adSelectors = [
                        // Basic ad selectors
                        '[id*="ad"]', '[class*="ad"]', '[id*="Ad"]', '[class*="Ad"]',
                        '[id*="banner"]', '[class*="banner"]', '[id*="Banner"]', '[class*="Banner"]',
                        '[id*="popup"]', '[class*="popup"]', '[id*="Popup"]', '[class*="Popup"]',
                        '[id*="overlay"]', '[class*="overlay"]', '[id*="Overlay"]', '[class*="Overlay"]',
                        '[id*="modal"]', '[class*="modal"]', '[id*="Modal"]', '[class*="Modal"]',
                        
                        // Video ad specific
                        '[id*="preroll"]', '[class*="preroll"]', '[id*="commercial"]', '[class*="commercial"]',
                        '[id*="sponsor"]', '[class*="sponsor"]', '[id*="promo"]', '[class*="promo"]',
                        
                        // Common ad containers
                        '.advertisement', '.ads', '.ad-container', '.banner-ad', '.popup-ad',
                        '.video-ad', '.preroll-ad', '.overlay-ad', '.sponsored-content',
                        
                        // Iframes
                        'iframe[src*="ads"]', 'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]',
                        'iframe[src*="amazon-adsystem"]', 'iframe[src*="facebook.com/tr"]',
                        
                        // Data attributes
                        '[data-ad]', '[data-ads]', '[data-advertisement]', '[data-google-av-cxn]',
                        '[data-google-av-cpm]', '[data-google-av-adk]'
                      ];

                      // Aggressive ad removal
                      function removeAds() {
                        let removedCount = 0;
                        
                        // Remove by selectors
                        adSelectors.forEach(selector => {
                          try {
                            const elements = document.querySelectorAll(selector);
                            elements.forEach(el => {
                              if (el && el.remove) {
                                el.style.display = 'none !important';
                                el.style.visibility = 'hidden !important';
                                el.style.opacity = '0 !important';
                                el.remove();
                                removedCount++;
                              }
                            });
                          } catch (e) {}
                        });

                        // Remove high z-index overlays
                        try {
                          const allElements = document.querySelectorAll('*');
                          allElements.forEach(el => {
                            const style = window.getComputedStyle(el);
                            const zIndex = parseInt(style.zIndex);
                            if (zIndex > 1000 && style.position === 'fixed') {
                              const rect = el.getBoundingClientRect();
                              // If it covers a large area, it's probably an overlay ad
                              if (rect.width > window.innerWidth * 0.5 && rect.height > window.innerHeight * 0.5) {
                                el.style.display = 'none !important';
                                el.remove();
                                removedCount++;
                              }
                            }
                          });
                        } catch (e) {}

                        if (removedCount > 0) {
                          console.log('Removed', removedCount, 'ad elements');
                        }

                        // Block video ads
                        blockVideoAds();
                      }

                      // Enhanced network blocking
                      const originalFetch = window.fetch;
                      window.fetch = function(...args) {
                        const url = args[0];
                        if (typeof url === 'string') {
                          for (const domain of adDomains) {
                            if (url.includes(domain)) {
                              console.log('Blocked fetch ad request:', url);
                              return Promise.reject(new Error('Ad blocked'));
                            }
                          }
                        }
                        return originalFetch.apply(this, args);
                      };

                      const originalOpen = XMLHttpRequest.prototype.open;
                      XMLHttpRequest.prototype.open = function(method, url, ...args) {
                        if (typeof url === 'string') {
                          for (const domain of adDomains) {
                            if (url.includes(domain)) {
                              console.log('Blocked XHR ad request:', url);
                              return;
                            }
                          }
                        }
                        return originalOpen.call(this, method, url, ...args);
                      };

                      // Block createElement for dynamic ads
                      const originalCreateElement = document.createElement;
                      document.createElement = function(tagName) {
                        const element = originalCreateElement.call(this, tagName);
                        
                        if (tagName.toLowerCase() === 'script') {
                          const originalSetSrc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src').set;
                          Object.defineProperty(element, 'src', {
                            set: function(value) {
                              if (value && adDomains.some(domain => value.includes(domain))) {
                                console.log('Blocked script:', value);
                                return;
                              }
                              originalSetSrc.call(this, value);
                            }
                          });
                        }
                        
                        return element;
                      };

                      // Enhanced CSS blocking
                      const style = document.createElement('style');
                      style.textContent = \`
                        [id*="ad"], [class*="ad"], [id*="Ad"], [class*="Ad"],
                        [id*="banner"], [class*="banner"], [id*="Banner"], [class*="Banner"],
                        [id*="popup"], [class*="popup"], [id*="Popup"], [class*="Popup"],
                        [id*="overlay"], [class*="overlay"], [id*="Overlay"], [class*="Overlay"],
                        [id*="modal"], [class*="modal"], [id*="Modal"], [class*="Modal"],
                        [id*="preroll"], [class*="preroll"], [id*="commercial"], [class*="commercial"],
                        [id*="sponsor"], [class*="sponsor"], [id*="promo"], [class*="promo"],
                        .advertisement, .ads, .ad-container, .banner-ad, .popup-ad,
                        .video-ad, .preroll-ad, .overlay-ad, .sponsored-content,
                        [data-ad], [data-ads], [data-advertisement],
                        iframe[src*="ads"], iframe[src*="doubleclick"], iframe[src*="googlesyndication"] {
                          display: none !important;
                          visibility: hidden !important;
                          opacity: 0 !important;
                          position: absolute !important;
                          left: -9999px !important;
                          top: -9999px !important;
                          width: 0 !important;
                          height: 0 !important;
                          pointer-events: none !important;
                        }
                        
                        /* Hide video controls during ads */
                        video[src*="ad"], video[src*="advertisement"], video[src*="commercial"] {
                          display: none !important;
                        }
                      \`;
                      
                      const addStyle = () => {
                        if (document.head) {
                          document.head.appendChild(style);
                        } else {
                          setTimeout(addStyle, 10);
                        }
                      };
                      addStyle();

                      // Popup and redirect blocking
                      window.open = function() {
                        console.log('Blocked popup');
                        return null;
                      };

                      // Block common ad events
                      ['click', 'mousedown', 'mouseup', 'touchstart', 'touchend'].forEach(eventType => {
                        document.addEventListener(eventType, function(e) {
                          const target = e.target;
                          if (target && (
                            target.className.toLowerCase().includes('ad') ||
                            target.id.toLowerCase().includes('ad') ||
                            target.href && adDomains.some(domain => target.href.includes(domain))
                          )) {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('Blocked ad click');
                          }
                        }, true);
                      });

                      // Initial cleanup
                      removeAds();
                      
                      // Continuous cleanup - more aggressive timing
                      document.addEventListener('DOMContentLoaded', removeAds);
                      setInterval(removeAds, 500); // Run every 500ms
                      
                      // Watch for DOM mutations to catch dynamic ads
                      if (window.MutationObserver) {
                        const observer = new MutationObserver(function(mutations) {
                          let shouldRemove = false;
                          mutations.forEach(function(mutation) {
                            if (mutation.addedNodes.length > 0) {
                              shouldRemove = true;
                            }
                          });
                          if (shouldRemove) {
                            setTimeout(removeAds, 100);
                          }
                        });
                        
                        observer.observe(document.body || document.documentElement, {
                          childList: true,
                          subtree: true
                        });
                      }

                      console.log('Advanced ad blocker fully loaded');
                      true;
                    })();
                  `}
                  onMessage={(event) => {
                    // Handle messages from injected JavaScript if needed
                    console.log('WebView message:', event.nativeEvent.data);
                  }}
                />
              ) : (
                <View style={styles.noStreamContainer}>
                  <Text style={[styles.noStreamText, { color: '#fff' }]}>No stream URL available</Text>
                </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  stickyTeamAway: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-start',
  },
  stickyTeamHome: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  stickyTeamLogo: {
    width: 28,
    height: 28,
    marginHorizontal: 8,
  },
  stickyTeamScore: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#002D72',
    minWidth: 35,
    textAlign: 'center',
  },
  losingStickyTeamScore: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#999',
    minWidth: 35,
    textAlign: 'center',
  },
  stickyStatus: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  stickyStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#002D72',
    textAlign: 'center',
  },
  stickyClock: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 2,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#002D72',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  gameHeader: {
    backgroundColor: 'white',
    padding: 20,
    marginBottom: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  teamContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  team: {
    alignItems: 'center',
    flex: 1,
  },
  teamLogo: {
    width: 50,
    height: 50,
    marginVertical: 8,
  },
  teamNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
    gap: 5,
  },
  teamName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  losingTeamName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textAlign: 'center',
  },
  teamScore: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#002D72',
    marginBottom: 5,
  },
  losingTeamScore: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#999',
    marginBottom: 5,
  },
  vsContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  vsText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 5,
  },
  gameStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: '#002D72',
    marginBottom: 2,
  },
  gameClock: {
    fontSize: 12,
    color: '#666',
  },
  gameInfo: {
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 15,
  },
  venue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 5,
  },
  date: {
    fontSize: 12,
    color: '#666',
  },
  basesContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  basesDisplay: {
    alignItems: 'center',
  },
  basesRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  base: {
    width: 8,
    height: 8,
    backgroundColor: '#ddd',
    transform: [{ rotate: '45deg' }],
    margin: 1,
  },
  firstBase: {
    marginLeft: 12,
  },
  secondBase: {
    marginBottom: 2,
  },
  thirdBase: {
    marginRight: 12,
  },
  occupiedBase: {
    backgroundColor: '#002D72',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  section: {
    padding: 20,
    marginBottom: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonBorder: {
    borderRightWidth: 1,
    borderRightColor: '#e9ecef',
  },
  activeTabButton: {
    backgroundColor: '#002D72',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  activeTabText: {
    color: 'white',
  },
  teamBoxScoreContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
  },
  teamBoxScoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  teamBoxScoreLogo: {
    width: 30,
    height: 30,
    marginRight: 12,
  },
  teamRosterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  teamRosterLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  statCategoryContainer: {
    backgroundColor: 'white',
    borderRadius: 6,
    padding: 10,
    marginBottom: 15,
  },
  statCategoryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#002D72',
    marginBottom: 10,
    textAlign: 'center',
  },
  statTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#e9ecef',
    paddingVertical: 8,
    paddingHorizontal: 5,
    borderRadius: 4,
    marginBottom: 5,
  },
  statTableHeaderPlayer: {
    flex: 2,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#495057',
  },
  statTableHeaderStat: {
    flex: 1,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#495057',
    textAlign: 'center',
  },
  statTableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    alignItems: 'center',
  },
  statTablePlayerCell: {
    flex: 2,
    justifyContent: 'center',
  },
  statTablePlayerName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  statTablePlayerNumber: {
    fontSize: 11,
    color: '#666',
  },
  statTableStatCell: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    textAlign: 'center',
  },
  placeholderContainer: {
    padding: 40,
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  momentumContainer: {
    marginTop: 20,
    marginBottom: -5,
  },
  momentumChart: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  momentumChartWhite: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  teamLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  teamLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  awayTeamLabel: {
    textAlign: 'left',
  },
  homeTeamLabel: {
    textAlign: 'right',
  },
  teamLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  momentumTeamLogoAway: {
    width: 18,
    height: 18,
    marginRight: 6,
  },
  momentumTeamLogoHome: {
    width: 18,
    height: 18,
    marginLeft: 6,
  },
  inningBarsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inningBar: {
    alignItems: 'center',
    marginHorizontal: 4,
    minWidth: 45,
    height: 160, // Increased to accommodate repositioned away bars
    position: 'relative',
    justifyContent: 'center',
  },
  awayBarContainer: {
    position: 'absolute',
    bottom: 85, // Position from center upward - increased for more spacing
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  homeBarContainer: {
    position: 'absolute',
    top: 80, // Position from center downward (140/2 = 70)
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  activityBar: {
    width: 40,
    borderRadius: 4,
    marginVertical: 4,
  },
  awayBar: {
    backgroundColor: '#A71930',
  },
  homeBar: {
    backgroundColor: '#002D62',
  },
  barText: {
    color: '#333',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 2,
  },
  inningLabel: {
    color: '#666',
    fontSize: 11,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  inningLabelContainer: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    transform: [{ translateY: -10 }],
  },
  teamStatsContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  statsTeams: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statsTeam: {
    flex: 1,
    alignItems: 'center',
  },
  statsTeamLogo: {
    width: 30,
    height: 30,
    marginBottom: 4,
  },
  statsTeamName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  statsSection: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    padding: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 8,
  },
  statsValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    width: 60,
    textAlign: 'center',
  },
  statsBarContainer: {
    flex: 1,
    flexDirection: 'row',
    height: 20,
    marginHorizontal: 12,
  },
  statsBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  statsBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  awayBarFill: {
    alignSelf: 'flex-start',
  },
  homeBarFill: {
    alignSelf: 'flex-end',
  },
  statsLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    flex: 1,
  },
  playsContainer: {
    marginTop: 10,
  },
  playsScrollView: {
    maxHeight: 600,
  },
  playCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  playHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  playInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  playTeamLogo: {
    width: 24,
    height: 24,
    marginRight: 10,
  },
  playSummary: {
    flex: 1,
  },
  playTeamName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#002D72',
    marginBottom: 2,
  },
  playResult: {
    fontSize: 14,
    color: '#333',
  },
  playScoreSection: {
    alignItems: 'center',
    marginRight: 10,
  },
  playBasesSmall: {
    marginTop: 4,
    alignItems: 'center',
    width: 24,
    height: 20,
    position: 'relative',
  },
  playBasesRowSmall: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 20,
    marginTop: 2,
  },
  playBaseSmall: {
    width: 4,
    height: 4,
    backgroundColor: '#ddd',
    transform: [{ rotate: '45deg' }],
    borderRadius: 0.5,
  },
  thirdBaseSmall: {
    // Position for third base (left side of bottom row)
  },
  firstBaseSmall: {
    // Position for first base (right side of bottom row)  
  },
  secondBaseSmall: {
    // Position for second base (center, above the row)
    alignSelf: 'center',
    marginBottom: 2,
  },
  occupiedBaseSmall: {
    backgroundColor: '#002D72',
    shadowColor: '#002D72',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 1,
    elevation: 2,
  },
  playInning: {
    fontSize: 10,
    color: '#666',
    marginBottom: 2,
  },
  playScore: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#002D72',
  },
  toggleIcon: {
    fontSize: 12,
    color: '#666',
  },
  toggleIconOpen: {
    transform: [{ rotate: '90deg' }],
  },
  playDetails: {
    padding: 15,
    backgroundColor: '#f8f9fa',
  },
  pitchSequence: {
    marginTop: 10,
  },
  pitchSequenceBox: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 15,
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pitchSequenceTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#002D72',
    marginBottom: 15,
    textAlign: 'center',
  },
  pitchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  pitchNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#002D72',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  pitchNumberText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  pitchInfo: {
    flex: 1,
  },
  pitchMainInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  pitchTypeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#002D72',
    marginRight: 8,
  },
  pitchSpeedText: {
    fontSize: 12,
    color: '#666',
    fontWeight: 'bold',
    marginRight: 8,
  },
  pitchCountText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  pitchActionText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
  },
  pitchContainer: {
    padding: 10,
    backgroundColor: 'white',
    borderRadius: 6,
    marginBottom: 8,
  },
  pitchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pitchCount: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#002D72',
  },
  pitchSpeed: {
    fontSize: 12,
    color: '#666',
    fontWeight: 'bold',
  },
  pitchDescription: {
    fontSize: 13,
    color: '#333',
    marginBottom: 4,
  },
  pitchType: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
  },
  pitchVisualization: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  pitchPlayerSection: {
    width: 60,
    alignItems: 'center',
  },
  pitchPlayerInfo: {
    alignItems: 'center',
  },
  pitchPlayerHeadshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 4,
    borderWidth: 2,
    borderColor: '#002D72',
  },
  pitchPlayerName: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#002D72',
    textAlign: 'center',
  },
  pitchPlayerRole: {
    fontSize: 8,
    color: '#666',
    textAlign: 'center',
    marginTop: 1,
  },
  strikeZoneContainer: {
    width: 120,
    height: 120,
    position: 'relative',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#333',
    marginHorizontal: 10,
  },
  strikeZoneOutline: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderWidth: 2,
    borderColor: '#777',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 2,
    top: '50%',
    left: '50%',
    marginLeft: -30,
    marginTop: -30,
  },
  pitchLocation: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fff',
    zIndex: 2,
  },
  pitchNumberOnBall: {
    color: 'white',
    fontSize: 8,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  pitchData: {
    flex: 1,
  },
  pitchDataText: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
  },
  playBasesContainer: {
    marginTop: 15,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  basesTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#002D72',
    marginBottom: 8,
    textAlign: 'center',
  },
  playBasesDisplay: {
    alignItems: 'center',
  },
  playBasesRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  playBase: {
    width: 12,
    height: 12,
    backgroundColor: '#ddd',
    transform: [{ rotate: '45deg' }],
    margin: 2,
  },
  occupiedBase: {
    backgroundColor: '#002D72',
  },
  lineScoreContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  lineScoreTable: {
    minWidth: '100%',
  },
  lineScoreRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 8,
  },
  lineScoreCell: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamCell: {
    width: 60,
  },
  lineScoreHeaderText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  lineScoreTeamText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#002D72',
  },
  lineScoreText: {
    fontSize: 12,
    color: '#666',
  },
  lineScoreTotalText: {
    fontWeight: 'bold',
  },
  currentPlayContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  currentPlayContent: {
    alignItems: 'center',
  },
  currentPlayText: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  currentPlayDetails: {
    fontSize: 12,
    color: '#666',
  },
  lineScoreContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  lineScoreTable: {
    minWidth: '100%',
  },
  lineScoreRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 8,
  },
  lineScoreCell: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamCell: {
    width: 60,
  },
  lineScoreHeaderText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  lineScoreTeamText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#002D72',
  },
  lineScoreText: {
    fontSize: 12,
    color: '#666',
  },
  lineScoreTotalText: {
    fontWeight: 'bold',
  },
  currentPlayContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  currentPlayContent: {
    alignItems: 'center',
  },
  lineScoreTeamContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineScoreTeamLogo: {
    width: 16,
    height: 16,
    marginRight: 4,
  },
  teamLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  momentumTeamLogo: {
    width: 16,
    height: 16,
    marginRight: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    width: '100%',
    maxHeight: '80%',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalCloseButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  modalCloseText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  playerHeadshot: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginRight: 15,
    backgroundColor: '#f0f0f0',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  playerDetails: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  playerTeamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerTeamLogo: {
    width: 20,
    height: 20,
    marginRight: 6,
  },
  playerTeamName: {
    fontSize: 14,
    color: '#002D72',
    fontWeight: '600',
  },
  playerStatsContainer: {
    maxHeight: 400,
    marginTop: 10,
  },
  playerStatsLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  playerStatsContent: {
    paddingBottom: 10,
  },
  gameStatsHeader: {
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  gameStatsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#002D72',
    marginBottom: 4,
  },
  gameStatsDate: {
    fontSize: 14,
    color: '#666',
  },
  playerStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  playerStatLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  playerStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'right',
  },
  statGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  statBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    width: '30%',
    minHeight: 70,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  statBoxValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  statBoxLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  noStatsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  noStatsText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    padding: 40,
  },
  streamHint: {
    fontSize: 12,
    color: '#007AFF',
    textAlign: 'center',
    marginTop: 5,
    fontStyle: 'italic',
  },
  // Stream Modal Styles
  streamModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  streamModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '95%',
    maxWidth: 800,
    height: '85%',
    maxHeight: 600,
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
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  streamModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#002D72',
  },
  streamCloseButton: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    backgroundColor: '#e9ecef',
    justifyContent: 'center',
    alignItems: 'center',
  },
  streamCloseText: {
    fontSize: 20,
    color: '#002D72',
    fontWeight: 'bold',
  },
  streamButtonsContainer: {
    paddingVertical: 12,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
    maxHeight: 60,
  },
  streamButtonsContent: {
    paddingHorizontal: 10,
    gap: 10,
    alignItems: 'center',
  },
  streamButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#e9ecef',
    minWidth: 80,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dee2e6',
    marginHorizontal: 5,
  },
  activeStreamButton: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  streamButtonText: {
    fontSize: 12,
    color: '#002D72',
    fontWeight: '500',
  },
  activeStreamButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  webViewContainer: {
    flex: 1,
    position: 'relative',
  },
  webView: {
    flex: 1,
  },
  streamLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  streamLoadingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
  },
  noStreamContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  noStreamText: {
    color: '#fff',
    fontSize: 16,
  },
  probablePitchersContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  pitcherCard: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
  },
  pitcherHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  pitcherTeamLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  pitcherTeamName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#002D72',
  },
  pitcherInfo: {
    alignItems: 'center',
  },
  pitcherHeadshot: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 8,
  },
  pitcherName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 4,
  },
  pitcherStatsContainer: {
    alignItems: 'center',
  },
  pitcherStats: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 2,
  },
  noPitcher: {
    fontSize: 16,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 20,
  },
  topHittersContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 15,
  },
  topHittersTeams: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
  },
  topHittersTeam: {
    flex: 1,
  },
  topHittersTeamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    justifyContent: 'center',
  },
  topHittersTeamLogo: {
    width: 20,
    height: 20,
    marginRight: 6,
  },
  topHittersTeamName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#002D72',
  },
  topHitterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  topHitterHeadshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 8,
  },
  topHitterInfo: {
    flex: 1,
  },
  topHitterName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  topHitterStats: {
    fontSize: 10,
    color: '#666',
    marginBottom: 1,
  },
  loadingHitters: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    padding: 20,
  },
  seasonStatsContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
  },
  rosterContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 15,
  },
  rosterSection: {
    marginBottom: 20,
  },
  rosterSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#002D72',
    marginBottom: 10,
  },
  rosterTableContainer: {
    backgroundColor: 'white',
    borderRadius: 6,
    overflow: 'hidden',
  },
  rosterTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#e9ecef',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  rosterTableHeaderPlayer: {
    flex: 3,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#495057',
  },
  rosterTableHeaderStatus: {
    flex: 1,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#495057',
    textAlign: 'center',
  },
  rosterTableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    alignItems: 'center',
  },
  rosterTablePlayerCell: {
    flex: 3,
  },
  rosterTablePlayerName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  rosterTablePlayerDetails: {
    fontSize: 12,
    color: '#666',
  },
  rosterTablePlayerNumber: {
    color: '#666',
    fontWeight: '500',
  },
  rosterTableStatusCell: {
    flex: 1,
    alignItems: 'center',
  },
  rosterTableStatusText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  activeStatus: {
    backgroundColor: '#d4edda',
    color: '#155724',
  },
  inactiveStatus: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
  },
  // Stat bars for season statistics
  statValueContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  statBarContainer: {
    flex: 1,
    height: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  statBar: {
    height: '100%',
    borderRadius: 2,
  },
  statAwayBar: {
    backgroundColor: '#007bff',
  },
  statHomeBar: {
    backgroundColor: '#28a745',
  },
  statBetterValue: {
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  // Updated top hitters row layout
  topHitterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    marginVertical: 2,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  topHitterLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topHitterPosition: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
    marginRight: 4,
    minWidth: 28,
  },
  topHitterHeadshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 8,
  },
  topHitterInfo: {
    flex: 1,
  },
  topHitterName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  topHitterStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  topHitterStatItem: {
    alignItems: 'center',
    minWidth: 35,
  },
  topHitterStatValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#002D72',
  },
  topHitterStatLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 1,
  },
  topHittersContainer: {
    gap: 20,
  },
  topHittersTeam: {
    marginBottom: 8,
  },
  topHittersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  topHittersTeamLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  topHittersTeamName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  topHittersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  topHittersTeamLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  topHittersTeamName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
});

export default MLBGameDetailsScreen;
