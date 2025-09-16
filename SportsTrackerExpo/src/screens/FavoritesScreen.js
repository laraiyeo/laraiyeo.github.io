import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useFavorites } from '../context/FavoritesContext';
import { ChampionsLeagueServiceEnhanced } from '../services/soccer/ChampionsLeagueServiceEnhanced';

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

const FavoritesScreen = ({ navigation }) => {
  const { theme, colors, isDarkMode } = useTheme();
  const { getFavoriteTeams, isFavorite, favorites, getTeamCurrentGame } = useFavorites();
  const [favoriteGames, setFavoriteGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [favoritesHash, setFavoritesHash] = useState('');
  const [isUpdatingFavorites, setIsUpdatingFavorites] = useState(false);
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const [updateInterval, setUpdateInterval] = useState(null);
  const [liveGamesInterval, setLiveGamesInterval] = useState(null);

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
        
        // Debug logging
        console.log(`Game ${game.id}:`, {
          statusType: statusType,
          statusFromSiteAPI: !!statusFromSiteAPI,
          date: game.date,
          gameDataWithStatus: !!game.gameDataWithStatus
        });
        
        if (statusType === 'in') {
          return 'Live'; // Live games have highest priority
        } else if (statusType === 'pre') {
          return 'Scheduled';
        } else if (statusType === 'post') {
          return 'Final';
        }
        
        // Fallback to date-based logic if no status available
        const gameDate = new Date(game.date);
        const now = new Date();
        const threeHoursAgo = new Date(now.getTime() - (3 * 60 * 60 * 1000));
        
        console.log(`Fallback logic for game ${game.id}: gameDate=${gameDate}, now=${now}, using fallback`);
        
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
      
      console.log(`Comparing games: Game ${a.id} (${statusA}) vs Game ${b.id} (${statusB})`);
      
      // Priority: Live > Scheduled > Final
      const statusPriority = { 'Live': 1, 'Scheduled': 2, 'Final': 3 };
      
      if (statusPriority[statusA] !== statusPriority[statusB]) {
        console.log(`Different statuses: ${statusA} (${statusPriority[statusA]}) vs ${statusB} (${statusPriority[statusB]}), returning ${statusPriority[statusA] - statusPriority[statusB]}`);
        return statusPriority[statusA] - statusPriority[statusB];
      }
      
      // If same status, sort by time (earlier first for scheduled/live, later first for final)
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      
      if (statusA === 'Final') {
        return timeB - timeA; // Most recent final games first
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

  useEffect(() => {
    fetchFavoriteGames();
  }, []);

  // Also refresh when favorites list changes
  useEffect(() => {
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

  // Track screen focus and set up live game refresh
  useFocusEffect(
    React.useCallback(() => {
      console.log('FavoritesScreen: Screen focused - starting data fetch');
      setIsScreenFocused(true);
      fetchFavoriteGames(true); // Refresh data when screen is focused
      
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
      };
    }, [])
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

    // Check if we have any live games
    const hasLiveGames = favoriteGames.some(game => {
      const statusFromSiteAPI = game.gameDataWithStatus?.header?.competitions?.[0]?.status;
      return statusFromSiteAPI?.type?.state === 'in';
    });

    if (hasLiveGames && isScreenFocused) {
      console.log('FavoritesScreen: Live games detected - setting up continuous refresh');
      // Set up continuous refresh for live games (every 30 seconds)
      const interval = setInterval(() => {
        console.log('FavoritesScreen: Auto-refresh triggered for live games');
        fetchFavoriteGames(true);
      }, 30000); // 30 seconds

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
      console.log('Favorites auto-refresh triggered - forcing refresh');
      fetchFavoriteGames(true); // Force refresh on interval
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(refreshInterval);
  }, []);

  // Set up separate interval for live games plays updates (every 20 seconds)
  useEffect(() => {
    const playsInterval = setInterval(() => {
      // Use a callback to get current favoriteGames to avoid dependency issues
      setFavoriteGames(currentGames => {
        const liveGames = currentGames.filter(game => {
          const status = game.status || game.header?.competitions?.[0]?.status;
          return status?.type?.state === 'in';
        });

        if (liveGames.length > 0) {
          console.log('Live plays auto-update triggered for', liveGames.length, 'games');
          updateLiveGamesPlays();
        }
        
        return currentGames; // Return unchanged to prevent unnecessary re-render
      });
    }, 20 * 1000); // 20 seconds

    setLiveGamesInterval(playsInterval);
    
    return () => {
      clearInterval(playsInterval);
      setLiveGamesInterval(null);
    };
  }, []); // Remove favoriteGames dependency to prevent interval recreation

  const fetchFavoriteGames = async (forceRefresh = false) => {
    try {
      const now = Date.now();

      // Reduce debounce time to 2 seconds for better responsiveness
      if (!forceRefresh && lastFetchTime && (now - lastFetchTime) < 2000) {
        console.log('Skipping fetch - too soon since last fetch (5s cooldown)');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      console.log('Fetching favorite games...', new Date().toISOString(), forceRefresh ? '(forced)' : '');
      setLastFetchTime(now);
      
      const favoriteTeams = getFavoriteTeams();
      console.log('Fetching games for teams:', favoriteTeams.map(t => `${t.displayName} (${t.sport})`));
      
      // Get unique teams by teamId to avoid duplicates
      const uniqueTeams = favoriteTeams.reduce((acc, team) => {
        if (!acc.find(t => t.teamId === team.teamId)) {
          acc.push(team);
        }
        return acc;
      }, []);
      
      console.log(`Processing ${uniqueTeams.length} unique teams from ${favoriteTeams.length} favorites`);
      
      // For each unique team, check if we have current game data first, then fallback to fetching
      const gamesPromises = uniqueTeams.flatMap(async (team) => {
        const teamGames = [];
        
        // Check if we have current game data for this team
        const currentGameData = getTeamCurrentGame(team.teamId);
        
        if (currentGameData) {
          console.log(`Found current game data for ${team.displayName}, using direct event link`);
          
          // Try to fetch the game directly using the event link
          const directGame = await fetchGameFromEventLink(team, currentGameData);
          if (directGame) {
            console.log(`Successfully fetched game directly for ${team.displayName}`);
            return [directGame]; // Return early with the direct game
          } else {
            console.log(`Direct fetch failed for ${team.displayName}, falling back to normal fetch`);
          }
        }
        
        // Fallback to normal fetching if no current game data or direct fetch failed
        console.log(`Using normal fetch for ${team.displayName}`);
        
        // Always check European competitions for every team
        const europeanGames = await Promise.all([
          fetchUCLTeamGame(team),
          fetchUELTeamGame(team), 
          fetchUECLTeamGame(team)
        ]);
        teamGames.push(...europeanGames.filter(game => game !== null));
        
        // Check domestic league based on original sport
        let domesticGame = null;
        if (team.sport === 'La Liga') {
          domesticGame = await fetchSpainTeamGame(team);
        } else if (team.sport === 'Serie A') {
          domesticGame = await fetchItalyTeamGame(team);
        } else if (team.sport === 'Bundesliga') {
          domesticGame = await fetchGermanyTeamGame(team);
        } else if (team.sport === 'Premier League') {
          domesticGame = await fetchEnglandTeamGame(team);
        } else if (team.sport === 'Ligue 1') {
          domesticGame = await fetchFranceTeamGame(team);
        } else if (team.sport === 'MLB') {
          domesticGame = await fetchMLBTeamGame(team);
        } else if (team.sport === 'Champions League' || team.sport === 'Europa League' || team.sport === 'Europa Conference League') {
          // For teams starred from European competitions, fetch their European games
          console.log(`Fetching European competition games for: ${team.displayName} (${team.sport})`);
          if (team.sport === 'Champions League') {
            domesticGame = await fetchUCLTeamGame(team);
          } else if (team.sport === 'Europa League') {
            domesticGame = await fetchUELTeamGame(team);
          } else if (team.sport === 'Europa Conference League') {
            domesticGame = await fetchUECLTeamGame(team);
          }
        }
        
        if (domesticGame) {
          teamGames.push(domesticGame);
        }
        
        return teamGames;
      });

      const gamesArrays = await Promise.all(gamesPromises);
      // Flatten the arrays since each team can return multiple games
      const allGames = gamesArrays.flat();
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
          // If game already exists, we can just skip it since it's the same game
          console.log(`Duplicate game removed: ${game.id} (${game.sport})`);
        }
        return acc;
      }, []);
      
      console.log(`Found ${validGames.length} games (${uniqueGames.length} unique) for ${favoriteTeams.length} favorite teams`);
      console.log('Unique game IDs:', uniqueGames.map(g => g.id));
      setFavoriteGames(uniqueGames);
    } catch (error) {
      console.error('Error fetching favorite games:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    console.log('Manual refresh triggered - forcing refresh');
    setRefreshing(true);
    fetchFavoriteGames(true); // Force refresh on manual pull
  };

  // Function to update plays data for live games only
  const updateLiveGamesPlays = async () => {
    try {
      const liveGames = favoriteGames.filter(game => {
        const status = game.status || game.header?.competitions?.[0]?.status;
        return status?.type?.state === 'in';
      });

      if (liveGames.length === 0) {
        console.log('No live games to update plays for');
        return;
      }

      console.log(`Updating plays for ${liveGames.length} live games`);

      const updatedGames = await Promise.all(
        favoriteGames.map(async (game) => {
          const status = game.status || game.header?.competitions?.[0]?.status;
          const isLive = status?.type?.state === 'in';
          
          if (!isLive) {
            return game; // Return unchanged if not live
          }

          try {
            let playsData = null;
            
            // Determine the correct API endpoint based on sport
            if (game.sport === 'Champions League' || game.actualLeagueCode === 'uefa.champions') {
              const playsResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.champions/events/${game.id}/competitions/${game.id}/plays?lang=en&region=us&limit=1000`);
              if (playsResponse.ok) {
                const playsResponseData = await playsResponse.json();
                if (playsResponseData.items && playsResponseData.items.length > 0) {
                  playsData = [...playsResponseData.items].reverse();
                  console.log(`Updated plays for UCL game ${game.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
                }
              }
            } else if (game.sport === 'Europa League' || game.actualLeagueCode === 'uefa.europa') {
              const playsResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.europa/events/${game.id}/competitions/${game.id}/plays?lang=en&region=us&limit=1000`);
              if (playsResponse.ok) {
                const playsResponseData = await playsResponse.json();
                if (playsResponseData.items && playsResponseData.items.length > 0) {
                  playsData = [...playsResponseData.items].reverse();
                  console.log(`Updated plays for UEL game ${game.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
                }
              }
            } else if (game.sport === 'Europa Conference League' || game.actualLeagueCode === 'uefa.europa.conf') {
              const playsResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.europa.conf/events/${game.id}/competitions/${game.id}/plays?lang=en&region=us&limit=1000`);
              if (playsResponse.ok) {
                const playsResponseData = await playsResponse.json();
                if (playsResponseData.items && playsResponseData.items.length > 0) {
                  playsData = [...playsResponseData.items].reverse();
                  console.log(`Updated plays for UECL game ${game.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
                }
              }
            } else if (game.sport === 'MLB' || game.actualLeagueCode === 'mlb') {
              const playsResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events/${game.id}/competitions/${game.id}/plays?lang=en&region=us&limit=20`);
              if (playsResponse.ok) {
                const playsResponseData = await playsResponse.json();
                if (playsResponseData.items && playsResponseData.items.length > 0) {
                  playsData = [...playsResponseData.items].reverse();
                  console.log(`Updated plays for MLB game ${game.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
                }
              }
            } else if (game.actualLeagueCode) {
              // Handle domestic leagues using the actualLeagueCode
              const playsResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${game.actualLeagueCode}/events/${game.id}/competitions/${game.id}/plays?lang=en&region=us&limit=10000`);
              if (playsResponse.ok) {
                const playsResponseData = await playsResponse.json();
                if (playsResponseData.items && playsResponseData.items.length > 0) {
                  playsData = [...playsResponseData.items].reverse();
                  console.log(`Updated plays for ${game.actualLeagueCode} game ${game.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
                }
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
  const fetchGameFromEventLink = async (team, currentGameData) => {
    try {
      console.log(`Fetching game directly from event link for ${team.displayName}:`, currentGameData.eventLink);
      
      // Check if the current game is from today
      const { todayStart, todayEnd } = getTodayDateRange();
      const gameDate = new Date(currentGameData.gameDate);
      
      if (gameDate < todayStart || gameDate >= todayEnd) {
        console.log(`Game for ${team.displayName} is not from today, skipping direct fetch`);
        return null;
      }
      
      const eventResponse = await fetch(currentGameData.eventLink);
      if (!eventResponse.ok) {
        console.log(`Failed to fetch event data from link for ${team.displayName}`);
        return null;
      }
      
      const eventData = await eventResponse.json();
      
      // Fetch team and score data for competitors if needed
      if (eventData.competitions?.[0]?.competitors) {
        const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
          const [teamData, scoreData] = await Promise.all([
            competitor.team?.$ref ? fetch(competitor.team.$ref).then(res => res.json()).catch(() => null) : null,
            competitor.score?.$ref ? fetch(competitor.score.$ref).then(res => res.json()).catch(() => null) : null
          ]);
          return { ...competitor, team: teamData || competitor.team, score: scoreData || competitor.score };
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
            const statusResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${competition}/summary?event=${eventData.id}`);
            if (statusResponse.ok) {
              gameDataWithStatus = await statusResponse.json();
              console.log(`Successfully fetched Site API status for game ${eventData.id} from ${competition}:`, {
                hasHeader: !!gameDataWithStatus?.header,
                hasStatus: !!gameDataWithStatus?.header?.competitions?.[0]?.status,
                statusState: gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state,
                displayClock: gameDataWithStatus?.header?.competitions?.[0]?.status?.displayClock
              });
              break; // Found the right competition, stop trying
            } else {
              console.log(`Site API request failed for game ${eventData.id} in ${competition}:`, statusResponse.status);
            }
          } catch (competitionError) {
            console.log(`Error trying ${competition} for game ${eventData.id}:`, competitionError.message);
          }
        }
        
        if (!gameDataWithStatus) {
          console.log(`Could not fetch Site API status for game ${eventData.id} from any competition`);
        }
      } catch (statusError) {
        console.log('Could not fetch status data for direct game:', statusError);
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

      return {
        ...eventData,
        favoriteTeam: team,
        sport: team.sport,
        actualLeagueCode: currentGameData.competition || team.sport,
        gameDataWithStatus: gameDataWithStatus,
        playsData: playsData,
        fromDirectLink: true // Flag to indicate this came from direct link
      };
      
    } catch (error) {
      console.error(`Error fetching game from event link for ${team.displayName}:`, error);
      return null;
    }
  };

  const fetchUCLTeamGame = async (team) => {
    try {
      console.log(`Fetching UCL games for team: ${team.displayName} (${team.teamId})`);
      // Fetch team events from ESPN Core API
      const eventsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.champions/seasons/2025/teams/${team.teamId}/events?lang=en&region=us&limit=10`;
      const eventsResponse = await fetch(eventsUrl);
      const eventsData = await eventsResponse.json();

      if (eventsData.items && eventsData.items.length > 0) {
        console.log(`Found ${eventsData.items.length} UCL events for ${team.displayName}`);
        // Find today's game using 2 AM cutoff
        const { todayStart, todayEnd } = getTodayDateRange();

        for (const eventRef of eventsData.items) {
          const eventResponse = await fetch(eventRef.$ref);
          const eventData = await eventResponse.json();
          const eventDate = new Date(eventData.date);

          // Check if this is today's game
          if (eventDate >= todayStart && eventDate < todayEnd) {
            // Fetch team and score data for competitors
            if (eventData.competitions?.[0]?.competitors) {
              const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
                const [teamData, scoreData] = await Promise.all([
                  competitor.team?.$ref ? fetch(competitor.team.$ref).then(res => res.json()).catch(() => null) : null,
                  competitor.score?.$ref ? fetch(competitor.score.$ref).then(res => res.json()).catch(() => null) : null
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
                  const statusResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${competition}/summary?event=${eventData.id}`);
                  if (statusResponse.ok) {
                    gameDataWithStatus = await statusResponse.json();
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
                const playsResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.champions/events/${eventData.id}/competitions/${eventData.id}/plays?lang=en&region=us&limit=1000`);
                if (playsResponse.ok) {
                  const playsResponseData = await playsResponse.json();
                  if (playsResponseData.items && playsResponseData.items.length > 0) {
                    // Sort plays in reverse chronological order (most recent first) like Game Details
                    playsData = [...playsResponseData.items].reverse();
                    console.log(`Got ${playsData.length} plays for UCL game ${eventData.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
                  }
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
      // Use Europa League API endpoint
      const eventsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.europa/seasons/2025/teams/${team.teamId}/events?lang=en&region=us&limit=10`;
      const eventsResponse = await fetch(eventsUrl);
      const eventsData = await eventsResponse.json();

      if (eventsData.items && eventsData.items.length > 0) {
        const { todayStart, todayEnd } = getTodayDateRange();

        for (const eventRef of eventsData.items) {
          const eventResponse = await fetch(eventRef.$ref);
          const eventData = await eventResponse.json();
          const eventDate = new Date(eventData.date);

          if (eventDate >= todayStart && eventDate < todayEnd) {
            if (eventData.competitions?.[0]?.competitors) {
              const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
                const [teamData, scoreData] = await Promise.all([
                  competitor.team?.$ref ? fetch(competitor.team.$ref).then(res => res.json()).catch(() => null) : null,
                  competitor.score?.$ref ? fetch(competitor.score.$ref).then(res => res.json()).catch(() => null) : null
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
                  const statusResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${competition}/summary?event=${eventData.id}`);
                  if (statusResponse.ok) {
                    gameDataWithStatus = await statusResponse.json();
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
                const playsResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.europa/events/${eventData.id}/competitions/${eventData.id}/plays?lang=en&region=us&limit=1000`);
                if (playsResponse.ok) {
                  const playsResponseData = await playsResponse.json();
                  if (playsResponseData.items && playsResponseData.items.length > 0) {
                    // Sort plays in reverse chronological order (most recent first) like Game Details
                    playsData = [...playsResponseData.items].reverse();
                    console.log(`Got ${playsData.length} plays for UEL game ${eventData.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
                  }
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
      // Use Europa Conference League API endpoint
      const eventsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.europa.conf/seasons/2025/teams/${team.teamId}/events?lang=en&region=us&limit=10`;
      const eventsResponse = await fetch(eventsUrl);
      const eventsData = await eventsResponse.json();

      if (eventsData.items && eventsData.items.length > 0) {
        const { todayStart, todayEnd } = getTodayDateRange();

        for (const eventRef of eventsData.items) {
          const eventResponse = await fetch(eventRef.$ref);
          const eventData = await eventResponse.json();
          const eventDate = new Date(eventData.date);

          if (eventDate >= todayStart && eventDate < todayEnd) {
            if (eventData.competitions?.[0]?.competitors) {
              const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
                const [teamData, scoreData] = await Promise.all([
                  competitor.team?.$ref ? fetch(competitor.team.$ref).then(res => res.json()).catch(() => null) : null,
                  competitor.score?.$ref ? fetch(competitor.score.$ref).then(res => res.json()).catch(() => null) : null
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
                  const statusResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${competition}/summary?event=${eventData.id}`);
                  if (statusResponse.ok) {
                    gameDataWithStatus = await statusResponse.json();
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
      // Check La Liga and associated domestic competitions
      const mainLeague = "esp.1";
      const competitions = [mainLeague, ...(LEAGUE_COMPETITIONS[mainLeague] || []).map(comp => comp.code)];
      const allGames = [];

      for (const leagueCode of competitions) {
        try {
          const eventsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/seasons/2025/teams/${team.teamId}/events?lang=en&region=us&limit=20`;
          const eventsResponse = await fetch(eventsUrl);
          const eventsData = await eventsResponse.json();

          if (eventsData.items && eventsData.items.length > 0) {
            const { todayStart, todayEnd } = getTodayDateRange();

            for (const eventRef of eventsData.items) {
              const eventResponse = await fetch(eventRef.$ref);
              const eventData = await eventResponse.json();
              const eventDate = new Date(eventData.date);

              if (eventDate >= todayStart && eventDate < todayEnd) {
                if (eventData.competitions?.[0]?.competitors) {
                  const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
                    const [teamData, scoreData] = await Promise.all([
                      competitor.team?.$ref ? fetch(competitor.team.$ref).then(res => res.json()).catch(() => null) : null,
                      competitor.score?.$ref ? fetch(competitor.score.$ref).then(res => res.json()).catch(() => null) : null
                    ]);
                    return { ...competitor, team: teamData || competitor.team, score: scoreData || competitor.score };
                  });
                  
                  eventData.competitions[0].competitors = await Promise.all(competitorPromises);
                }

                // Get Site API status data for live status information
                let gameDataWithStatus = null;
                try {
                  console.log(`Fetching Site API status for Spain game ${eventData.id} from ${leagueCode}`);
                  const statusResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueCode}/summary?event=${eventData.id}`);
                  if (statusResponse.ok) {
                    gameDataWithStatus = await statusResponse.json();
                    console.log(`Successfully fetched Site API status for Spain game ${eventData.id} from ${leagueCode}:`, {
                      hasStatus: !!gameDataWithStatus?.header?.competitions?.[0]?.status,
                      statusState: gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state,
                      displayClock: gameDataWithStatus?.header?.competitions?.[0]?.status?.displayClock
                    });
                  } else {
                    console.log(`Site API request failed for Spain game ${eventData.id} in ${leagueCode}:`, statusResponse.status);
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
                    const playsResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/events/${eventData.id}/competitions/${eventData.id}/plays?lang=en&region=us&limit=1000`);
                    if (playsResponse.ok) {
                      const playsResponseData = await playsResponse.json();
                      if (playsResponseData.items && playsResponseData.items.length > 0) {
                        playsData = [...playsResponseData.items].reverse();
                        console.log(`Got ${playsData.length} plays for Spain game ${eventData.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
                      }
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
      // Check Serie A and associated domestic competitions
      const mainLeague = "ita.1";
      const competitions = [mainLeague, ...(LEAGUE_COMPETITIONS[mainLeague] || []).map(comp => comp.code)];
      const allGames = [];

      for (const leagueCode of competitions) {
        try {
          const eventsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/seasons/2025/teams/${team.teamId}/events?lang=en&region=us&limit=20`;
          const eventsResponse = await fetch(eventsUrl);
          const eventsData = await eventsResponse.json();

          if (eventsData.items && eventsData.items.length > 0) {
            const { todayStart, todayEnd } = getTodayDateRange();

            for (const eventRef of eventsData.items) {
              const eventResponse = await fetch(eventRef.$ref);
              const eventData = await eventResponse.json();
              const eventDate = new Date(eventData.date);

              if (eventDate >= todayStart && eventDate < todayEnd) {
                if (eventData.competitions?.[0]?.competitors) {
                  const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
                    const [teamData, scoreData] = await Promise.all([
                      competitor.team?.$ref ? fetch(competitor.team.$ref).then(res => res.json()).catch(() => null) : null,
                      competitor.score?.$ref ? fetch(competitor.score.$ref).then(res => res.json()).catch(() => null) : null
                    ]);
                    return { ...competitor, team: teamData || competitor.team, score: scoreData || competitor.score };
                  });
                  
                  eventData.competitions[0].competitors = await Promise.all(competitorPromises);
                }

                // Get Site API status data for live status information
                let gameDataWithStatus = null;
                try {
                  console.log(`Fetching Site API status for Italy game ${eventData.id} from ${leagueCode}`);
                  const statusResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueCode}/summary?event=${eventData.id}`);
                  if (statusResponse.ok) {
                    gameDataWithStatus = await statusResponse.json();
                    console.log(`Successfully fetched Site API status for Italy game ${eventData.id} from ${leagueCode}:`, {
                      hasStatus: !!gameDataWithStatus?.header?.competitions?.[0]?.status,
                      statusState: gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state,
                      displayClock: gameDataWithStatus?.header?.competitions?.[0]?.status?.displayClock
                    });
                  } else {
                    console.log(`Site API request failed for Italy game ${eventData.id} in ${leagueCode}:`, statusResponse.status);
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
                    const playsResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/events/${eventData.id}/competitions/${eventData.id}/plays?lang=en&region=us&limit=1000`);
                    if (playsResponse.ok) {
                      const playsResponseData = await playsResponse.json();
                      if (playsResponseData.items && playsResponseData.items.length > 0) {
                        playsData = [...playsResponseData.items].reverse();
                        console.log(`Got ${playsData.length} plays for Italy game ${eventData.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
                      }
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
      // Check Bundesliga and associated domestic competitions
      const mainLeague = "ger.1";
      const competitions = [mainLeague, ...(LEAGUE_COMPETITIONS[mainLeague] || []).map(comp => comp.code)];
      const allGames = [];

      for (const leagueCode of competitions) {
        try {
          const eventsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/seasons/2025/teams/${team.teamId}/events?lang=en&region=us&limit=20`;
          const eventsResponse = await fetch(eventsUrl);
          const eventsData = await eventsResponse.json();

          if (eventsData.items && eventsData.items.length > 0) {
            const { todayStart, todayEnd } = getTodayDateRange();

            for (const eventRef of eventsData.items) {
              const eventResponse = await fetch(eventRef.$ref);
              const eventData = await eventResponse.json();
              const eventDate = new Date(eventData.date);

              if (eventDate >= todayStart && eventDate < todayEnd) {
                if (eventData.competitions?.[0]?.competitors) {
                  const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
                    const [teamData, scoreData] = await Promise.all([
                      competitor.team?.$ref ? fetch(competitor.team.$ref).then(res => res.json()).catch(() => null) : null,
                      competitor.score?.$ref ? fetch(competitor.score.$ref).then(res => res.json()).catch(() => null) : null
                    ]);
                    return { ...competitor, team: teamData || competitor.team, score: scoreData || competitor.score };
                  });
                  
                  eventData.competitions[0].competitors = await Promise.all(competitorPromises);
                }

                // Get Site API status data for live status information
                let gameDataWithStatus = null;
                try {
                  console.log(`Fetching Site API status for Germany game ${eventData.id} from ${leagueCode}`);
                  const statusResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueCode}/summary?event=${eventData.id}`);
                  if (statusResponse.ok) {
                    gameDataWithStatus = await statusResponse.json();
                    console.log(`Successfully fetched Site API status for Germany game ${eventData.id} from ${leagueCode}:`, {
                      hasStatus: !!gameDataWithStatus?.header?.competitions?.[0]?.status,
                      statusState: gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state,
                      displayClock: gameDataWithStatus?.header?.competitions?.[0]?.status?.displayClock
                    });
                  } else {
                    console.log(`Site API request failed for Germany game ${eventData.id} in ${leagueCode}:`, statusResponse.status);
                  }
                } catch (statusError) {
                  console.log(`Error fetching Site API status for Germany game ${eventData.id}:`, statusError.message);
                }

                // Fetch plays data for live games
                let playsData = null;
                const isLive = gameDataWithStatus?.header?.competitions?.[0]?.status?.type?.state === 'in';
                if (isLive) {
                  try {
                    console.log(`Fetching plays data for live Germany game ${eventData.id}`);
                    const playsResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/events/${eventData.id}/competitions/${eventData.id}/plays?lang=en&region=us&limit=1000`);
                    if (playsResponse.ok) {
                      const playsResponseData = await playsResponse.json();
                      if (playsResponseData.items && playsResponseData.items.length > 0) {
                        playsData = [...playsResponseData.items].reverse();
                        console.log(`Got ${playsData.length} plays for Germany game ${eventData.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
                      }
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
      console.log(`Fetching England games for team: ${team.displayName} (${team.teamId})`);
      // Check Premier League and associated domestic competitions
      const mainLeague = "eng.1";
      const competitions = [mainLeague, ...(LEAGUE_COMPETITIONS[mainLeague] || []).map(comp => comp.code)];
      const allGames = [];

      for (const leagueCode of competitions) {
        try {
          const eventsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/seasons/2025/teams/${team.teamId}/events?lang=en&region=us&limit=20`;
          console.log(`Fetching from ${leagueCode}:`, eventsUrl);
          const eventsResponse = await fetch(eventsUrl);
          const eventsData = await eventsResponse.json();

          if (eventsData.items && eventsData.items.length > 0) {
            const { todayStart, todayEnd } = getTodayDateRange();
            console.log(`Found ${eventsData.items.length} events for ${leagueCode}, filtering for date range: ${todayStart.toISOString()} to ${todayEnd.toISOString()}`);

            for (const eventRef of eventsData.items) {
              const eventResponse = await fetch(eventRef.$ref);
              const eventData = await eventResponse.json();
              const eventDate = new Date(eventData.date);
              
              console.log(`Event ${eventData.id}: ${eventDate.toISOString()} (${eventDate >= todayStart && eventDate < todayEnd ? 'MATCHES' : 'FILTERED OUT'})`);

              if (eventDate >= todayStart && eventDate < todayEnd) {
                if (eventData.competitions?.[0]?.competitors) {
                  const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
                    const [teamData, scoreData] = await Promise.all([
                      competitor.team?.$ref ? fetch(competitor.team.$ref).then(res => res.json()).catch(() => null) : null,
                      competitor.score?.$ref ? fetch(competitor.score.$ref).then(res => res.json()).catch(() => null) : null
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
      // Check Ligue 1 and associated domestic competitions
      const mainLeague = "fra.1";
      const competitions = [mainLeague, ...(LEAGUE_COMPETITIONS[mainLeague] || []).map(comp => comp.code)];
      const allGames = [];

      for (const leagueCode of competitions) {
        try {
          const eventsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/seasons/2025/teams/${team.teamId}/events?lang=en&region=us&limit=20`;
          const eventsResponse = await fetch(eventsUrl);
          const eventsData = await eventsResponse.json();

          if (eventsData.items && eventsData.items.length > 0) {
            const { todayStart, todayEnd } = getTodayDateRange();

            for (const eventRef of eventsData.items) {
              const eventResponse = await fetch(eventRef.$ref);
              const eventData = await eventResponse.json();
              const eventDate = new Date(eventData.date);

              if (eventDate >= todayStart && eventDate < todayEnd) {
                if (eventData.competitions?.[0]?.competitors) {
                  const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
                    const [teamData, scoreData] = await Promise.all([
                      competitor.team?.$ref ? fetch(competitor.team.$ref).then(res => res.json()).catch(() => null) : null,
                      competitor.score?.$ref ? fetch(competitor.score.$ref).then(res => res.json()).catch(() => null) : null
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
      console.log(`Fetching MLB game for team: ${team.displayName} (ID: ${team.teamId})`);
      
      const { todayStart, todayEnd } = getTodayDateRange();
      
      // Fetch today's MLB games for this team
      const eventsUrl = `https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/seasons/2025/teams/${team.teamId}/events?lang=en&region=us&limit=20`;
      const eventsResponse = await fetch(eventsUrl);
      const eventsData = await eventsResponse.json();

      if (eventsData.items && eventsData.items.length > 0) {
        for (const eventRef of eventsData.items) {
          const eventResponse = await fetch(eventRef.$ref);
          const eventData = await eventResponse.json();
          const eventDate = new Date(eventData.date);

          if (eventDate >= todayStart && eventDate < todayEnd) {
            console.log(`Found today's MLB game for ${team.displayName}:`, eventData.id);
            
            // Fetch detailed game data using the game ID
            const gameDetailUrl = `https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events/${eventData.id}?lang=en&region=us`;
            const gameDetailResponse = await fetch(gameDetailUrl);
            const gameDetailData = await gameDetailResponse.json();
            
            // Fetch live data from ESPN's live API (similar to GameDetailsScreen)
            let liveData = null;
            try {
              const liveUrl = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${eventData.id}`;
              const liveResponse = await fetch(liveUrl);
              if (liveResponse.ok) {
                liveData = await liveResponse.json();
                console.log(`Successfully fetched live MLB data for game ${eventData.id}`);
              }
            } catch (liveError) {
              console.warn(`Could not fetch live MLB data for game ${eventData.id}:`, liveError);
            }

            // Fetch plays data for live games
            let playsData = null;
            try {
              const gameStatus = liveData?.header?.competitions?.[0]?.status?.type?.state || gameDetailData.status?.type?.state;
              if (gameStatus === 'in') {
                const playsUrl = `https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events/${eventData.id}/competitions/${eventData.id}/plays?lang=en&region=us&limit=20`;
                const playsResponse = await fetch(playsUrl);
                if (playsResponse.ok) {
                  const playsResponseData = await playsResponse.json();
                  if (playsResponseData.items && playsResponseData.items.length > 0) {
                    playsData = [...playsResponseData.items].reverse(); // Most recent first
                    console.log(`Fetched plays data for MLB game ${eventData.id}, most recent: ${playsData[0]?.text || 'N/A'}`);
                  }
                }
              }
            } catch (playsError) {
              console.warn(`Could not fetch plays data for MLB game ${eventData.id}:`, playsError);
            }

            return {
              ...gameDetailData,
              favoriteTeam: team,
              sport: 'MLB',
              actualLeagueCode: 'mlb',
              liveData,
              playsData
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
      navigation.navigate('MLBGameDetails', {
        gameId: game.id,
        sport: 'MLB',
      });
    }
  };

  const renderMLBGameCard = (game, theme, colors) => {
    if (!game?.competitions?.[0]) return null;

    const competition = game.competitions[0];
    const awayTeam = competition.competitors.find(team => team.homeAway === 'away');
    const homeTeam = competition.competitors.find(team => team.homeAway === 'home');
    
    if (!awayTeam || !homeTeam) return null;

    const gameStatus = getGameStatus(game);
    const liveData = game.liveData || {};
    const gameId = game.id;

    const middleContent = () => {
      if (gameStatus.isLive && liveData.status) {
        // Live game - show inning, balls/strikes, bases, outs
        const status = liveData.status;
        const situation = liveData.situation || {};
        
        const inningText = `${situation.isTopInning ? 'Top' : 'Bot'} ${situation.inning || 1}`;
        const ballsStrikesText = `B: ${situation.balls || 0} S: ${situation.strikes || 0}`;
        const outsText = `Outs: ${situation.outs || 0}`;
        
        return (
          <View style={styles.liveGameMiddleSection}>
            <Text style={[styles.liveInningText, { color: colors.text }]}>{inningText}</Text>
            <Text style={[styles.liveCountText, { color: colors.text }]}>{ballsStrikesText}</Text>
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

    // Get play text and border if available
    const playInfo = liveGamePlays[gameId];
    let playText = '';
    let playBorderStyle = {};
    
    if (playInfo && playInfo.lastPlay) {
      playText = playInfo.lastPlay.text || '';
      
      // Determine which team made the play for border styling
      const playTeamId = playInfo.lastPlay.team?.id;
      if (playTeamId) {
        if (playTeamId === homeTeam.id) {
          playBorderStyle = { borderRightWidth: 3, borderRightColor: colors.primary };
        } else if (playTeamId === awayTeam.id) {
          playBorderStyle = { borderLeftWidth: 3, borderLeftColor: colors.primary };
        }
      }
    }

    return (
      <TouchableOpacity
        style={[
          styles.gameCard,
          { backgroundColor: colors.card, borderColor: colors.border },
          playBorderStyle
        ]}
        onPress={() => handleGamePress(game)}
      >
        {/* Away team (left side for MLB) */}
        <View style={styles.teamSection}>
          <TeamLogoImage
            source={{ uri: awayTeam.team?.logos?.[0]?.href }}
            style={styles.teamLogo}
            isDarkMode={theme === 'dark'}
          />
          <Text style={[styles.teamName, { color: colors.text }]}>
            {awayTeam.team?.abbreviation || awayTeam.team?.displayName}
          </Text>
          <Text style={[styles.teamScore, { color: colors.text }]}>
            {awayTeam.score || '0'}
          </Text>
        </View>

        {/* Middle section */}
        {middleContent()}

        {/* Home team (right side for MLB) */}
        <View style={styles.teamSection}>
          <TeamLogoImage
            source={{ uri: homeTeam.team?.logos?.[0]?.href }}
            style={styles.teamLogo}
            isDarkMode={theme === 'dark'}
          />
          <Text style={[styles.teamName, { color: colors.text }]}>
            {homeTeam.team?.abbreviation || homeTeam.team?.displayName}
          </Text>
          <Text style={[styles.teamScore, { color: colors.text }]}>
            {homeTeam.score || '0'}
          </Text>
        </View>

        {/* Play text if available */}
        {playText ? (
          <View style={styles.playTextContainer}>
            <Text style={[styles.playText, { color: colors.text }]} numberOfLines={2}>
              {playText}
            </Text>
          </View>
        ) : null}
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

    // Helper function to get the current/most recent play for live games
    const getCurrentPlay = (game) => {
      if (!game.playsData || !Array.isArray(game.playsData) || game.playsData.length === 0) {
        console.log(`No plays data for game ${game.id}`);
        return null;
      }
      
      // Log plays data for debugging
      console.log(`Game ${game.id} plays data:`, {
        totalPlays: game.playsData.length,
        firstPlay: game.playsData[0]?.text || 'N/A',
        firstPlayTime: game.playsData[0]?.clock?.displayValue || game.playsData[0]?.period?.displayValue || 'N/A',
        lastPlay: game.playsData[game.playsData.length - 1]?.text || 'N/A',
        lastPlayTime: game.playsData[game.playsData.length - 1]?.clock?.displayValue || game.playsData[game.playsData.length - 1]?.period?.displayValue || 'N/A'
      });
      
      // The plays should be sorted in reverse chronological order (most recent first)
      // But let's verify by checking timestamps/periods if available
      const mostRecentPlay = game.playsData[0];
      
      console.log(`Returning play for game ${game.id}:`, {
        text: mostRecentPlay.text || mostRecentPlay.shortText || 'N/A',
        time: mostRecentPlay.clock?.displayValue || mostRecentPlay.period?.displayValue || 'N/A',
        type: mostRecentPlay.type?.text || 'N/A'
      });
      
      return mostRecentPlay;
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
      const currentPlay = getCurrentPlay(game);
      
      if (currentPlay) {
        const playText = currentPlay.text || currentPlay.shortText || currentPlay.type?.text || 'Live';
        const playTime = currentPlay.clock?.displayValue || currentPlay.period?.displayValue || '';
        
        console.log(`LivePlayDisplay for game ${game.id}:`, {
          displayText: playText,
          playTime: playTime,
          playType: currentPlay.type?.text,
          rawPlay: JSON.stringify(currentPlay, null, 2)
        });
        
        return (
          <View style={styles.livePlayContainer}>
            <Text style={[styles.livePlayText, { color: theme.textSecondary }]} numberOfLines={2}>
              {playText}
            </Text>
          </View>
        );
      } else {
        console.log(`No current play for game ${game.id}, showing fallback`);
        return <Text style={[styles.venueText, { color: theme.textSecondary }]}>Live</Text>;
      }
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
      
      // Debug logging to understand the status structure
      if (game.id) {
        console.log('Game status debug (fallback):', {
          gameId: game.id,
          hasStatus: !!status,
          state: state,
          statusType: status?.type,
          displayClock: status?.displayClock,
          period: status?.period
        });
      }
      
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
      return renderMLBGameCard(game, theme, colors);
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
                  <Text style={[styles.teamScore, { 
                    color: matchStatus.isPost && homeIsWinner ? colors.primary : 
                           homeIsLoser ? '#999' : theme.text 
                  }]}>
                    {homeScore}
                  </Text>
                  {homeShootoutScore && (
                    <Text style={[
                      styles.shootoutScore, 
                      { color: homeIsLoser ? '#999' : colors.primary }
                    ]}>
                      ({homeShootoutScore})
                    </Text>
                  )}
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
                  {awayShootoutScore && (
                    <Text style={[
                      styles.shootoutScore, 
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
    const groupedGames = favoriteGames.reduce((acc, game) => {
      const sport = getLeagueGroupName(game.actualLeagueCode, game.sport);
      if (!acc[sport]) {
        acc[sport] = [];
      }
      acc[sport].push(game);
      return acc;
    }, {});

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
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Today's Games
              </Text>
              {renderGroupedGames()}
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
    paddingVertical: 16,
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
});

export default FavoritesScreen;
