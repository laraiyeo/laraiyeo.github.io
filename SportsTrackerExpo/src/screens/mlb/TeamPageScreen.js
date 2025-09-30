import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, ScrollView } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';
import { getAPITeamId, convertMLBIdToESPNId } from '../../utils/TeamIdMapping';

// Keep a reference to the original console.log so important diagnostics remain visible
const __orig_console_log = (typeof console !== 'undefined' && console.log) ? console.log.bind(console) : () => {};

const TeamPageScreen = ({ route, navigation }) => {
  const { teamId, sport } = route.params;
  const { theme, colors, isDarkMode, getTeamLogoUrl: getThemeTeamLogoUrl } = useTheme();
  const { isFavorite, toggleFavorite, updateTeamCurrentGame } = useFavorites();
  const [isUpdatingFavorites, setIsUpdatingFavorites] = useState(false);
  const [activeTab, setActiveTab] = useState('Games');
  const [teamData, setTeamData] = useState(null);
  const [teamRecord, setTeamRecord] = useState(null);
  const [currentGame, setCurrentGame] = useState(null);
  const [lastStatusString, setLastStatusString] = useState(null);
  const [lastMatches, setLastMatches] = useState([]);
  const [nextMatches, setNextMatches] = useState([]);
  const [lastMatchesCollapsed, setLastMatchesCollapsed] = useState(true);
  const [nextMatchesCollapsed, setNextMatchesCollapsed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState(null);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [collapsedRosterSections, setCollapsedRosterSections] = useState({
    pitchers: true,
    catchers: true,
    infielders: true,
    outfielders: true,
    others: true
  });
  const [teamStats, setTeamStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const liveUpdateInterval = useRef(null);

  useEffect(() => {
    console.log('TeamPageScreen received - teamId:', teamId, 'sport:', sport);
    // Convert ESPN ID to MLB ID for API calls
    const mlbApiId = getAPITeamId(teamId, sport);
    console.log('Using MLB API ID:', mlbApiId, 'for ESPN team ID:', teamId);
    fetchTeamData();
    
    // Cleanup interval on unmount
    return () => {
      if (liveUpdateInterval.current) {
        clearInterval(liveUpdateInterval.current);
      }
    };
  }, [teamId]);

  const fetchTeamData = async () => {
    try {
      // Convert ESPN ID to MLB ID for API calls
      const mlbApiId = getAPITeamId(teamId, sport);
      // Fetch team basic info from MLB API
      const url = `https://statsapi.mlb.com/api/v1/teams/${mlbApiId}`;
      console.log('Fetching team data from:', url, '(ESPN ID:', teamId, '-> MLB ID:', mlbApiId, ')');
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('Team API response:', data);
      
      if (data.teams && data.teams.length > 0) {
        setTeamData(data.teams[0]);
        
        // Fetch team record and streak from ESPN standings
        await fetchTeamRecord(data.teams[0].abbreviation);
        
        // Fetch current/upcoming game
        await fetchCurrentGame();
        
        // Fetch last and next matches
        await fetchAllMatches();
      } else {
        console.log('No team data found in response');
      }
    } catch (error) {
      console.error('Error fetching team data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamRecord = async (teamAbbreviation) => {
    try {
      console.log('Fetching team record for abbreviation:', teamAbbreviation);
      const response = await fetch('https://cdn.espn.com/core/mlb/standings?xhr=1');
      const data = await response.json();
      
      if (data?.content?.standings?.groups) {
        // Search through all leagues and divisions to find the team
        for (const league of data.content.standings.groups) {
          for (const division of league.groups) {
            const teamEntry = division.standings.entries.find(
              entry => {
                console.log('Checking team:', entry.team.abbreviation, 'against', teamAbbreviation);
                return entry.team.abbreviation === teamAbbreviation || 
                       (teamAbbreviation === 'ARI' && entry.team.abbreviation === 'AZ') ||
                       (teamAbbreviation === 'AZ' && entry.team.abbreviation === 'ARI');
              }
            );
            
            if (teamEntry) {
              console.log('Found team entry:', teamEntry);
              const wins = teamEntry.stats.find(stat => stat.name === "wins")?.displayValue || "0";
              const losses = teamEntry.stats.find(stat => stat.name === "losses")?.displayValue || "0";
              const lastTen = teamEntry.stats.find(stat => stat.name === "Last Ten Games")?.displayValue || "0-0";
              const streak = teamEntry.stats.find(stat => stat.name === "streak")?.displayValue || "N/A";
              const clincher = teamEntry.team.clincher ? `${(teamEntry.team.clincher).toUpperCase()} - ` : '';

              setTeamRecord({ wins, losses, lastTen, streak, clincher });
              return;
            }
          }
        }
        console.log('Team not found in standings for abbreviation:', teamAbbreviation);
      }
    } catch (error) {
      console.error('Error fetching team record:', error);
    }
  };

  const fetchCurrentGame = async () => {
    try {
      // Convert ESPN team ID to MLB API ID for the API call
      const mlbApiId = getAPITeamId(teamId, sport);
      if (!mlbApiId) {
        console.error('Could not convert team ID to MLB API ID:', teamId);
        return;
      }
      
      // Get today's date adjusted for MLB timezone (matches live.js logic)
      const getAdjustedDateForMLB = () => {
        const now = new Date();
        
        // Calculate Eastern Time offset (EST is UTC-5, EDT is UTC-4)
        // This approach is more reliable than toLocaleString in React Native
        const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
        const isDST = new Date().getTimezoneOffset() < new Date(new Date().getFullYear(), 0, 1).getTimezoneOffset();
        const easternOffset = isDST ? -4 : -5; // EDT or EST
        const easternTime = new Date(utcTime + (easternOffset * 3600000));
        
        // MLB considers games before 2 AM as part of the previous day
        if (easternTime.getHours() < 2) {
          easternTime.setDate(easternTime.getDate() - 1);
        }

        const adjustedDate = easternTime.getFullYear() + "-" +
                           String(easternTime.getMonth() + 1).padStart(2, "0") + "-" +
                           String(easternTime.getDate()).padStart(2, "0");

        return adjustedDate;
      };

      const today = getAdjustedDateForMLB();
      console.log('MLB adjusted date:', today);
      console.log('TeamPage fetchCurrentGame: teamId =', teamId, 'mlbApiId =', mlbApiId);
      
      const todayUrl = `https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&teamId=${mlbApiId}&startDate=${today}&endDate=${today}&hydrate=team,linescore,decisions`;
      console.log('TeamPage fetchCurrentGame: URL =', todayUrl);
      
      const todayResponse = await fetch(todayUrl);
      const todayData = await todayResponse.json();

      // Check if there's a game today - prioritize live games
      if (todayData.dates && todayData.dates.length > 0 && todayData.dates[0].games.length > 0) {
        const games = todayData.dates[0].games;
        
        // First, look for any live games
        const liveGame = games.find(game => isGameLive(game));
        if (liveGame) {
          __orig_console_log('Found live game:', liveGame.gamePk);
          // Persist to favorites if this team is favorited so the Favorites screen can use direct fetch
          try {
            if (isFavorite(teamId, sport)) {
              await updateTeamCurrentGame(teamId, {
                eventId: liveGame.gamePk,
                eventLink: liveGame.link || `/api/v1.1/game/${liveGame.gamePk}/feed/live`,
                gameDate: liveGame.gameDate,
                competition: 'mlb',
                updatedAt: new Date().toISOString()
              });
            }
          } catch (e) {
            console.log('TeamPage: failed to persist live currentGame to favorites', e?.message || e);
          }
          setCurrentGame(liveGame);
          try { setLastStatusString(`Live: true Scheduled: false Finished: false Start Time: ${new Date(liveGame.gameDate).toLocaleString()} Direct Link: ${liveGame.link || `/api/v1.1/game/${liveGame.gamePk}/feed/live`}`); } catch (e) {}
          return;
        }
        
        // If no live games, look for scheduled games
        const scheduledGame = games.find(game => 
          game.status.abstractGameState === 'Preview' || 
          game.status.detailedState.includes('Scheduled')
        );
        if (scheduledGame) {
          __orig_console_log('Found scheduled game for today:', scheduledGame.gamePk);
          try {
            if (isFavorite(teamId, sport)) {
              await updateTeamCurrentGame(teamId, {
                eventId: scheduledGame.gamePk,
                eventLink: scheduledGame.link || `/api/v1.1/game/${scheduledGame.gamePk}/feed/live`,
                gameDate: scheduledGame.gameDate,
                competition: 'mlb',
                updatedAt: new Date().toISOString()
              });
            }
          } catch (e) {
            console.log('TeamPage: failed to persist scheduled currentGame to favorites', e?.message || e);
          }
          setCurrentGame(scheduledGame);
          try { setLastStatusString(`Live: false Scheduled: true Finished: false Start Time: ${new Date(scheduledGame.gameDate).toLocaleString()} Direct Link: ${scheduledGame.link || `/api/v1.1/game/${scheduledGame.gamePk}/feed/live`}`); } catch (e) {}
          return;
        }
        
        // Otherwise, take the first game (likely completed)
  __orig_console_log('Found completed game for today:', games[0].gamePk);
        try {
          if (isFavorite(teamId, sport)) {
            await updateTeamCurrentGame(teamId, {
              eventId: games[0].gamePk,
              eventLink: games[0].link || `/api/v1.1/game/${games[0].gamePk}/feed/live`,
              gameDate: games[0].gameDate,
              competition: 'mlb',
              updatedAt: new Date().toISOString()
            });
          }
        } catch (e) {
          console.log('TeamPage: failed to persist completed currentGame to favorites', e?.message || e);
        }
  setCurrentGame(games[0]);
  try { setLastStatusString(`Live: false Scheduled: false Finished: true Start Time: ${new Date(games[0].gameDate).toLocaleString()} Direct Link: ${games[0].link || `/api/v1.1/game/${games[0].gamePk}/feed/live`}`); } catch (e) {}
      } else {
        // No game today, look for next upcoming game using MLB date logic
        const getNextMLBDate = () => {
          const now = new Date();
          
          // Calculate Eastern Time offset (same logic as above)
          const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
          const isDST = new Date().getTimezoneOffset() < new Date(new Date().getFullYear(), 0, 1).getTimezoneOffset();
          const easternOffset = isDST ? -4 : -5; // EDT or EST
          const easternTime = new Date(utcTime + (easternOffset * 3600000));
          
          // If it's before 2 AM, we're still on the previous MLB day, so next game is "today"
          if (easternTime.getHours() < 2) {
            // Don't add a day - look from current calendar date
            const year = easternTime.getFullYear();
            const month = String(easternTime.getMonth() + 1).padStart(2, '0');
            const day = String(easternTime.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          } else {
            // After 2 AM, look from tomorrow
            easternTime.setDate(easternTime.getDate() + 1);
            const year = easternTime.getFullYear();
            const month = String(easternTime.getMonth() + 1).padStart(2, '0');
            const day = String(easternTime.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          }
        };

        const startSearchDate = getNextMLBDate();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 14); // Look ahead 14 days from now
        const formatDate = (date) => date.toISOString().split('T')[0];
        const end = formatDate(endDate);

        console.log('Searching for upcoming games from:', startSearchDate, 'to:', end);

        const upcomingResponse = await fetch(
          `https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&teamId=${mlbApiId}&startDate=${startSearchDate}&endDate=${end}&hydrate=team,linescore,decisions`
        );
        const upcomingData = await upcomingResponse.json();

        // Find the next scheduled game
        if (upcomingData.dates && upcomingData.dates.length > 0) {
          for (const date of upcomingData.dates) {
            if (date.games && date.games.length > 0) {
              const nextGame = date.games.find(game => 
                ["Scheduled", "Pre-Game", "Warmup"].includes(game.status.detailedState)
              );
              if (nextGame) {
                console.log('Found upcoming game:', nextGame.gamePk, 'on', date.date);
                try {
                  if (isFavorite(teamId, sport)) {
                    // Persist as favorite upcoming game but do not treat it as the "current" game in the UI
                    await updateTeamCurrentGame(teamId, {
                      eventId: nextGame.gamePk,
                      eventLink: nextGame.link || `/api/v1.1/game/${nextGame.gamePk}/feed/live`,
                      gameDate: nextGame.gameDate,
                      competition: 'mlb',
                      updatedAt: new Date().toISOString()
                    });
                  }
                } catch (e) {
                  console.log('TeamPage: failed to persist upcoming currentGame to favorites', e?.message || e);
                }
                // Do not call setCurrentGame for future scheduled games; they belong in Upcoming
                break;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching current game:', error);
    }
  };

  const fetchAllMatches = async () => {
    try {
      // Convert ESPN ID to MLB ID for API calls
      const mlbApiId = getAPITeamId(teamId, sport);
      // Get current year season games
      const currentYear = new Date().getFullYear();
      const response = await fetch(
        `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${mlbApiId}&season=${currentYear}&gameType=R&gameType=D&gameType=L&gameType=W&gameType=F&hydrate=team,linescore,decisions`
      );
      const data = await response.json();
      
      if (data.dates && data.dates.length > 0) {
        // Flatten all games into a single array
        const allGames = [];
        data.dates.forEach(date => {
          date.games.forEach(game => {
            allGames.push(game);
          });
        });
        
        // Sort games by date
        allGames.sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
        
        // Get yesterday's date by taking today's MLB date and subtracting 1 day
        const getTodayMLBDate = () => {
          const now = new Date();
          
          // Calculate Eastern Time offset
          const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
          const isDST = new Date().getTimezoneOffset() < new Date(new Date().getFullYear(), 0, 1).getTimezoneOffset();
          const easternOffset = isDST ? -4 : -5; // EDT or EST
          const easternTime = new Date(utcTime + (easternOffset * 3600000));
          
          // MLB considers games before 2 AM as part of the previous day
          if (easternTime.getHours() < 2) {
            easternTime.setDate(easternTime.getDate() - 1);
          }

          return easternTime;
        };

        const todayMLB = getTodayMLBDate();
        const yesterdayMLB = new Date(todayMLB);
        yesterdayMLB.setDate(yesterdayMLB.getDate() - 1);
        
        const yesterdayMLBString = yesterdayMLB.getFullYear() + "-" +
                                  String(yesterdayMLB.getMonth() + 1).padStart(2, "0") + "-" +
                                  String(yesterdayMLB.getDate()).padStart(2, "0");
        
        console.log('Yesterday MLB date for last matches:', yesterdayMLBString);
        
        // Get last matches (completed games from yesterday and earlier, in reverse order)
        const lastMatchesData = allGames
          .filter(game => {
            // Convert game date to Eastern time to match MLB schedule logic
            const gameUTC = new Date(game.gameDate);
            const utcTime = gameUTC.getTime();
            const isDST = new Date().getTimezoneOffset() < new Date(new Date().getFullYear(), 0, 1).getTimezoneOffset();
            const easternOffset = isDST ? -4 : -5; // EDT or EST
            const gameEastern = new Date(utcTime + (easternOffset * 3600000));
            
            const gameEasternDateString = gameEastern.getFullYear() + "-" +
                                        String(gameEastern.getMonth() + 1).padStart(2, "0") + "-" +
                                        String(gameEastern.getDate()).padStart(2, "0");
            
            return game.status.abstractGameState === 'Final' && gameEasternDateString <= yesterdayMLBString;
          })
          .reverse();
        
        // Get next matches (upcoming games from tomorrow and later)
        const nextMatchesData = allGames.filter(game => {
          // Only include upcoming games
          const isUpcoming = game.status.abstractGameState === 'Preview' || 
                           ["Scheduled", "Pre-Game", "Warmup"].includes(game.status.detailedState);
          
          if (!isUpcoming) return false;
          
          // Convert game date to Eastern time to match MLB schedule logic
          const gameUTC = new Date(game.gameDate);
          const utcTime = gameUTC.getTime();
          const isDST = new Date().getTimezoneOffset() < new Date(new Date().getFullYear(), 0, 1).getTimezoneOffset();
          const easternOffset = isDST ? -4 : -5; // EDT or EST
          const gameEastern = new Date(utcTime + (easternOffset * 3600000));
          
          const gameEasternDateString = gameEastern.getFullYear() + "-" +
                                      String(gameEastern.getMonth() + 1).padStart(2, "0") + "-" +
                                      String(gameEastern.getDate()).padStart(2, "0");
          
          // Get today's MLB date string
          const todayMLBString = todayMLB.getFullYear() + "-" +
                               String(todayMLB.getMonth() + 1).padStart(2, "0") + "-" +
                               String(todayMLB.getDate()).padStart(2, "0");
          
          // Only include games from tomorrow onwards
          return gameEasternDateString > todayMLBString;
        });
        
        setLastMatches(lastMatchesData);
        setNextMatches(nextMatchesData);
        
        console.log('Last matches:', lastMatchesData.length);
        console.log('Next matches:', nextMatchesData.length);
      }
    } catch (error) {
      console.error('Error fetching all matches:', error);
    }
  };

  const fetchRoster = async () => {
    if (!teamData) return;
    
    setLoadingRoster(true);
    try {
      // Convert ESPN ID to MLB ID for API calls
      const mlbApiId = getAPITeamId(teamId, sport);
      const response = await fetch(
        `https://statsapi.mlb.com/api/v1/teams/${mlbApiId}/roster`
      );
      const data = await response.json();
      
      if (data.roster) {
        setRoster(data.roster);
      }
    } catch (error) {
      console.error('Error fetching roster:', error);
    } finally {
      setLoadingRoster(false);
    }
  };

  const fetchTeamStats = async () => {
    if (!teamData) return;
    
    setLoadingStats(true);
    try {
      // Convert ESPN ID to MLB ID for API calls
      const mlbApiId = getAPITeamId(teamId, sport);
      const currentYear = new Date().getFullYear();
      
      // Fetch both hitting and pitching stats
      const [hittingResponse, pitchingResponse] = await Promise.all([
        fetch(`https://statsapi.mlb.com/api/v1/teams/${mlbApiId}/stats?stats=season&group=hitting&season=${currentYear}`),
        fetch(`https://statsapi.mlb.com/api/v1/teams/${mlbApiId}/stats?stats=season&group=pitching&season=${currentYear}`)
      ]);
      
      const [hittingData, pitchingData] = await Promise.all([
        hittingResponse.json(),
        pitchingResponse.json()
      ]);
      
      const stats = {
        hitting: hittingData.stats?.[0]?.splits?.[0]?.stat || null,
        pitching: pitchingData.stats?.[0]?.splits?.[0]?.stat || null
      };
      
      setTeamStats(stats);
    } catch (error) {
      console.error('Error fetching team stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  // Handle game click navigation
  const handleGamePress = (game) => {
    console.log('Navigating to game:', game.gamePk);
    navigation.navigate('GameDetails', {
      gameId: game.gamePk,
      sport: 'mlb'
    });
  };

  // Start live updates for current game if it's in progress
  const startLiveUpdates = () => {
    if (liveUpdateInterval.current) {
      clearInterval(liveUpdateInterval.current);
    }

    if (currentGame && isGameLive(currentGame)) {
      console.log('Starting live updates for game:', currentGame.gamePk);
      liveUpdateInterval.current = setInterval(() => {
        fetchCurrentGameUpdate();
      }, 2000); // Update every 2 seconds
    }
  };

  // Stop live updates
  const stopLiveUpdates = () => {
    if (liveUpdateInterval.current) {
      clearInterval(liveUpdateInterval.current);
      liveUpdateInterval.current = null;
    }
  };

  // Check if game is live
  const isGameLive = (game) => {
    if (!game || !game.status) return false;
    const state = game.status.abstractGameState;
    const detailedState = game.status.detailedState;
    return state === 'Live' || 
           (state === 'Preview' && detailedState === 'In Progress') ||
           detailedState === 'Manager challenge' ||
           game.status.codedGameState === 'M';
  };

  // Fetch only current game update for live games
  const fetchCurrentGameUpdate = async () => {
    if (!currentGame) return;

    try {
      const response = await fetch(
        `https://statsapi.mlb.com/api/v1/schedule/games/?gamePk=${currentGame.gamePk}&hydrate=team,linescore,decisions`
      );
      const data = await response.json();

      if (data.dates && data.dates.length > 0 && data.dates[0].games.length > 0) {
        const updatedGame = data.dates[0].games[0];
        console.log('Updated game data:', updatedGame.status.detailedState);
        setCurrentGame(updatedGame);

        // Stop live updates if game is finished
        if (!isGameLive(updatedGame)) {
          console.log('Game finished, stopping live updates');
          stopLiveUpdates();
        }
      }
    } catch (error) {
      console.error('Error fetching current game update:', error);
    }
  };

  // Effect to manage live updates
  useEffect(() => {
    if (currentGame) {
      // Compute status flags
      const isLiveFlag = isGameLive(currentGame);
      // Determine finished from MLB coded states or status
      const mlbCoded = currentGame.mlbGameData?.status?.codedGameState || currentGame.liveData?.status?.codedGameState;
      const statusType = currentGame.status || currentGame.header?.competitions?.[0]?.status || null;
      const isFinishedFlag = Boolean(mlbCoded === 'F' || mlbCoded === 'O' || (statusType && (statusType.abstractGameState === 'Final' || statusType.type?.state === 'post')));
      const isScheduledFlag = !isLiveFlag && !isFinishedFlag;

      // Start/stop live updates as before
      if (isLiveFlag) {
        startLiveUpdates();
      } else {
        stopLiveUpdates();
      }

      // Format start time
      const startDateRaw = currentGame.gameDate || currentGame.date || currentGame.startDate || (currentGame.header && currentGame.header.competitions && currentGame.header.competitions[0] && currentGame.header.competitions[0].date);
      const startTimeStr = startDateRaw ? new Date(startDateRaw).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : 'unknown';
      const directLink = currentGame.link || currentGame.eventLink || (currentGame.gamePk ? `/api/v1.1/game/${currentGame.gamePk}/feed/live` : (currentGame.eventId ? `/api/v1.1/game/${currentGame.eventId}/feed/live` : 'none'));

  const statusString = `Live: ${isLiveFlag} Scheduled: ${isScheduledFlag} Finished: ${isFinishedFlag} Start Time: ${startTimeStr} Direct Link: ${directLink}`;
  __orig_console_log(`TeamPage currentGame status - ${statusString}`);
  // Also expose on-screen for debugging
  try { setLastStatusString(statusString); } catch (e) {}
    }

    return () => stopLiveUpdates();
  }, [currentGame]);

  // Effect to load roster when Roster tab is selected
  useEffect(() => {
    if (activeTab === 'Roster' && teamData && !roster && !loadingRoster) {
      fetchRoster();
    }
  }, [activeTab, teamData, roster, loadingRoster]);

  // Effect to load stats when Stats tab is selected
  useEffect(() => {
    if (activeTab === 'Stats' && teamData && !teamStats && !loadingStats) {
      fetchTeamStats();
    }
  }, [activeTab, teamData, teamStats, loadingStats]);

  const getTeamLogo = (abbreviation) => {
    if (!abbreviation) return null;
    return getThemeTeamLogoUrl('mlb', abbreviation);
  };

  const getTeamLogoUrl = (teamAbbreviation) => {
    if (!teamAbbreviation) return 'https://via.placeholder.com/40x40?text=MLB';
    return getThemeTeamLogoUrl('mlb', teamAbbreviation);
  };

  const getTeamColor = (abbreviation) => {
    // Normalize abbreviation for consistent lookup
    const normalizedAbbr = abbreviation === 'AZ' ? 'ARI' : abbreviation;
    
    // Team color definitions for light mode
    const lightModeColors = {
      'LAA': '#BA0021', // Angels - Red
      'HOU': '#002D62', // Astros - Navy
      'OAK': '#003831', // Athletics - Green
      'TOR': '#134A8E', // Blue Jays - Blue
      'ATL': '#CE1141', // Braves - Red
      'MIL': '#FFC52F', // Brewers - Yellow
      'STL': '#C41E3A', // Cardinals - Red
      'CHC': '#0E3386', // Cubs - Blue
      'ARI': '#A71930', // Diamondbacks - Red
      'LAD': '#005A9C', // Dodgers - Blue
      'SF': '#FD5A1E', // Giants - Orange
      'CLE': '#E31937', // Indians - Red
      'SEA': '#C4CED4', // Mariners - Silver
      'MIA': '#00A3E0', // Marlins - Blue
      'NYM': '#002D72', // Mets - Blue
      'WSH': '#AB0003', // Nationals - Red
      'BAL': '#DF4601', // Orioles - Orange
      'SD': '#2F241D', // Padres - Brown
      'PHI': '#E81828', // Phillies - Red
      'PIT': '#FDB827', // Pirates - Yellow
      'TEX': '#C0111F', // Rangers - Red
      'TB': '#092C5C', // Rays - Navy
      'BOS': '#BD3039', // Red Sox - Red
      'CIN': '#C6011F', // Reds - Red
      'COL': '#33006F', // Rockies - Purple
      'KC': '#004687', // Royals - Blue
      'DET': '#0C2340', // Tigers - Navy
      'MIN': '#002B5C', // Twins - Navy
      'CWS': '#27251F', // White Sox - Black
      'NYY': '#132448'  // Yankees - Navy
    };

    // Team color definitions for dark mode (brighter/more vibrant variants)
    const darkModeColors = {
      'LAA': '#FF3366', // Angels - Brighter Red
      'HOU': '#4A90E2', // Astros - Brighter Blue
      'OAK': '#00B359', // Athletics - Brighter Green
      'TOR': '#4A7BC8', // Blue Jays - Brighter Blue
      'ATL': '#FF4466', // Braves - Brighter Red
      'MIL': '#FFD700', // Brewers - Gold
      'STL': '#FF4466', // Cardinals - Brighter Red
      'CHC': '#4A7BC8', // Cubs - Brighter Blue
      'ARI': '#FF4466', // Diamondbacks - Brighter Red
      'LAD': '#4A90E2', // Dodgers - Brighter Blue
      'SF': '#FF8C42', // Giants - Brighter Orange
      'CLE': '#FF4466', // Indians - Brighter Red
      'SEA': '#7FB3D3', // Mariners - Light Blue
      'MIA': '#42C5F0', // Marlins - Brighter Blue
      'NYM': '#4A7BC8', // Mets - Brighter Blue
      'WSH': '#FF3344', // Nationals - Brighter Red
      'BAL': '#FF7A33', // Orioles - Brighter Orange
      'SD': '#8B4513', // Padres - Lighter Brown
      'PHI': '#FF4466', // Phillies - Brighter Red
      'PIT': '#FFD700', // Pirates - Gold
      'TEX': '#FF3344', // Rangers - Brighter Red
      'TB': '#4A7BC8', // Rays - Brighter Blue
      'BOS': '#FF4466', // Red Sox - Brighter Red
      'CIN': '#FF3344', // Reds - Brighter Red
      'COL': '#8A2BE2', // Rockies - Brighter Purple
      'KC': '#4A90E2', // Royals - Brighter Blue
      'DET': '#4A7BC8', // Tigers - Brighter Blue
      'MIN': '#4A7BC8', // Twins - Brighter Blue
      'CWS': '#666666', // White Sox - Gray (since black doesn't work in dark mode)
      'NYY': '#4A7BC8'  // Yankees - Brighter Blue
    };

    const colorMap = isDarkMode ? darkModeColors : lightModeColors;
    return colorMap[normalizedAbbr] || colors.primary;
  };

  // Helper functions for determining losing team styles (from scoreboard)
  const getTeamScoreStyle = (game, isAwayTeam) => {
    if (!game.teams || !game.teams.away || !game.teams.home) return styles.gameTeamScore;
    
    const isGameFinal = game.status.abstractGameState === 'Final';
    const awayScore = parseInt(game.teams.away.score || '0');
    const homeScore = parseInt(game.teams.home.score || '0');
    const isLosing = isGameFinal && (
      (isAwayTeam && awayScore < homeScore) || 
      (!isAwayTeam && homeScore < awayScore)
    );
    return isLosing ? [styles.gameTeamScore, styles.losingTeamScore] : styles.gameTeamScore;
  };

  const getScoreColor = (game, isAwayTeam) => {
    if (!game.teams || !game.teams.away || !game.teams.home) return colors.primary;
    
    const isGameFinal = game.status.abstractGameState === 'Final';
    const awayScore = parseInt(game.teams.away.score || '0');
    const homeScore = parseInt(game.teams.home.score || '0');
    const isLosing = isGameFinal && (
      (isAwayTeam && awayScore < homeScore) || 
      (!isAwayTeam && homeScore < awayScore)
    );
    return isLosing ? theme.textSecondary : colors.primary;
  };

  const getTeamNameColor = (game, isAwayTeam) => {
    if (!game.teams || !game.teams.away || !game.teams.home) return theme.text;
    
    // Check if current team is favorited
    const currentTeam = isAwayTeam ? game.teams.away : game.teams.home;
    const mlbTeamId = currentTeam.team.id?.toString();
    const espnTeamId = convertMLBIdToESPNId(mlbTeamId) || mlbTeamId;
    const isTeamFavorited = isFavorite(espnTeamId, 'mlb');
    
    // If team is favorited, use primary color
    if (isTeamFavorited) {
      return colors.primary;
    }
    
    const isGameFinal = game.status.abstractGameState === 'Final';
    const awayScore = parseInt(game.teams.away.score || '0');
    const homeScore = parseInt(game.teams.home.score || '0');
    const isLosing = isGameFinal && (
      (isAwayTeam && awayScore < homeScore) || 
      (!isAwayTeam && homeScore < awayScore)
    );
    return isLosing ? theme.textSecondary : theme.text;
  };

  const getTeamNameStyle = (game, isAwayTeam) => {
    if (!game.teams || !game.teams.away || !game.teams.home) return styles.gameTeamName;
    
    // Check if current team is favorited
    const currentTeam = isAwayTeam ? game.teams.away : game.teams.home;
    const mlbTeamId = currentTeam.team.id?.toString();
    const espnTeamId = convertMLBIdToESPNId(mlbTeamId) || mlbTeamId;
    const isTeamFavorited = isFavorite(espnTeamId, 'mlb');
    
    const isGameFinal = game.status.abstractGameState === 'Final';
    const awayScore = parseInt(game.teams.away.score || '0');
    const homeScore = parseInt(game.teams.home.score || '0');
    const isLosing = isGameFinal && (
      (isAwayTeam && awayScore < homeScore) || 
      (!isAwayTeam && homeScore < awayScore)
    );
    
    // Apply losing style for all losing teams (favorited teams get special color handling in getTeamNameColor)
    return isLosing ? [styles.gameTeamName, styles.losingTeamName] : styles.gameTeamName;
  };

  const getTeamLogoStyle = (game, isAwayTeam) => {
    if (!game.teams || !game.teams.away || !game.teams.home) return styles.gameTeamLogo;
    
    const isGameFinal = game.status.abstractGameState === 'Final';
    const awayScore = parseInt(game.teams.away.score || '0');
    const homeScore = parseInt(game.teams.home.score || '0');
    const isLosing = isGameFinal && (
      (isAwayTeam && awayScore < homeScore) || 
      (!isAwayTeam && homeScore < awayScore)
    );
    
    // Apply reduced opacity for losing teams
    return isLosing ? [styles.gameTeamLogo, { opacity: 0.5 }] : styles.gameTeamLogo;
  };

  const renderTeamHeader = () => {
    if (!teamData) return null;

    const getStreakColor = (streak) => {
      if (!streak || streak === 'N/A') return '#666';
      return streak.startsWith('W') ? '#008000' : streak.startsWith('L') ? '#FF0000' : '#666';
    };

    const isTeamFavorite = isFavorite(teamId, sport);

    const handleToggleFavorite = async () => {
      const teamPayload = {
        teamId: teamId,
        teamName: teamData.name,
        sport: 'MLB',
        abbreviation: teamData.abbreviation
      };
      // Ensure we have the freshest currentGame information before deciding what to save
      try {
        await fetchCurrentGame();
      } catch (e) {
        console.log('handleToggleFavorite: fetchCurrentGame failed or was unavailable:', e?.message || e);
      }

      // Prefer the explicit currentGame, but fall back to nextMatches or lastMatches
      // so Favorites has an event to fast-path to even when there is no live game.
      let sourceGame = currentGame;
      if (!sourceGame) {
        // Prefer the next upcoming match if available
        if (nextMatches && nextMatches.length > 0) {
          sourceGame = nextMatches[0];
        } else if (lastMatches && lastMatches.length > 0) {
          // Otherwise use the most recent completed game
          sourceGame = lastMatches[0];
        }
      }

      const currentGameData = sourceGame ? {
        eventId: sourceGame.gamePk,
        eventLink: sourceGame.link,
        gameDate: sourceGame.gameDate,
        competition: 'mlb'
      } : null;

      if (currentGameData) {
        console.log('MLB TeamPage: favoriting with currentGameData (sourceGame chosen)', currentGameData);
      } else {
        console.log('MLB TeamPage: favoriting without a currentGame (no candidate found)');
      }

      try {
        // optional local processing flag if needed
        setIsUpdatingFavorites(true);
        await toggleFavorite(teamPayload, currentGameData);
      } finally {
        setTimeout(() => setIsUpdatingFavorites(false), 400);
      }
    };

    return (
      <View style={[styles.teamHeader, { backgroundColor: theme.surface }]}>
        <Image 
          source={{ uri: getTeamLogoUrl(teamData.abbreviation) }}
          style={styles.teamLogo}
          defaultSource={{ uri: 'https://via.placeholder.com/80x80?text=MLB' }}
        />
        <View style={styles.teamInfo}>
          <Text allowFontScaling={false} style={[styles.teamName, { color: getTeamColor(teamData.abbreviation) }]}>
            {teamData.name}
          </Text>
          <Text allowFontScaling={false} style={[styles.teamDivision, { color: theme.textSecondary }]}>
            {teamRecord ? (teamRecord.clincher || '') : ''}{teamData.division?.name || 'N/A'}
          </Text>
          
          {teamRecord && (
            <View style={styles.recordContainer}>
              <View style={styles.recordRow}>
                <Text allowFontScaling={false} style={[styles.recordValue, { color: theme.text }]}>{(teamRecord.wins || 0)}-{(teamRecord.losses || 0)}</Text>
                <Text allowFontScaling={false} style={[styles.recordValue, { color: theme.text }]}>{teamRecord.lastTen || '0-0'}</Text>
                <Text allowFontScaling={false} style={[styles.recordValue, { color: getStreakColor(teamRecord.streak) }]}>
                  {teamRecord.streak || 'N/A'}
                </Text>
              </View>
              <View style={styles.recordRow}>
                <Text allowFontScaling={false} style={[styles.recordLabel, { color: theme.textSecondary }]}>RECORD</Text>
                <Text allowFontScaling={false} style={[styles.recordLabel, { color: theme.textSecondary }]}>L10</Text>
                <Text allowFontScaling={false} style={[styles.recordLabel, { color: theme.textSecondary }]}>STRK</Text>
              </View>
            </View>
          )}
        </View>
        <TouchableOpacity 
          style={styles.favoriteButton} 
          onPress={handleToggleFavorite}
          activeOpacity={0.7}
        >
          <Text allowFontScaling={false} style={[styles.favoriteIcon, { color: isTeamFavorite ? colors.primary : theme.textSecondary }]}>
            {isTeamFavorite ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderCurrentGame = () => {
    if (!currentGame) {
      return (
        <View style={styles.matchesSection}>
          <Text allowFontScaling={false} style={[styles.gameSectionTitle, { color: colors.primary }]}>Current Game</Text>
          <View style={[styles.noGameContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text allowFontScaling={false} style={[styles.noGameText, { color: theme.textSecondary }]}>No current or upcoming games found</Text>
          </View>
        </View>
      );
    }

    const away = currentGame.teams.away;
    const home = currentGame.teams.home;
    const gameDate = new Date(currentGame.gameDate);
    const isToday = gameDate.toDateString() === new Date().toDateString();
    
    const formatGameTime = (date) => {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    };

    const formatGameDate = (date) => {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    };

    const getGameStatus = () => {
      const status = currentGame.status.detailedState;
      if (status === 'Scheduled' || status === 'Pre-Game') {
        return isToday ? 'Today' : formatGameDate(gameDate);
      }
      // Add live indicator for active games
      if (isGameLive(currentGame)) {
        return `${status}`;
      }
      return status;
    };

    return (
      <View style={styles.matchesSection}>
        <Text allowFontScaling={false} style={[styles.gameSectionTitle, { color: colors.primary }]}>
          {isToday ? 'Current Game' : 'Upcoming Game'}
        </Text>
        <TouchableOpacity 
          style={[styles.gameCard, { backgroundColor: theme.surface }]}
          onPress={() => handleGamePress(currentGame)}
          activeOpacity={0.7}
        >
          <View style={styles.gameTeams}>
            <View style={styles.teamContainer}>
              <View style={styles.teamLogoContainer}>
                <Image 
                  source={{ uri: getTeamLogoUrl(away.team.abbreviation) }}
                  style={getTeamLogoStyle(currentGame, true)}
                  defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
                />
                {(isGameLive(currentGame) || currentGame.status.abstractGameState === 'Final') && away.score !== undefined && (
                  <Text allowFontScaling={false} style={[getTeamScoreStyle(currentGame, true), { color: getScoreColor(currentGame, true) }]}>{away.score}</Text>
                )}
              </View>
              <Text allowFontScaling={false} style={[getTeamNameStyle(currentGame, true), { color: getTeamNameColor(currentGame, true) }]}>
                {(() => {
                  const mlbId = away.team.id?.toString();
                  const espnId = convertMLBIdToESPNId(mlbId) || mlbId;
                  return isFavorite(espnId, 'mlb') && <Text allowFontScaling={false} style={{ color: colors.primary }}>★ </Text>;
                })()}
                {away.team.abbreviation}
              </Text>
              <Text allowFontScaling={false} style={[styles.teamRecord, { color: theme.textSecondary }]}>
                {away.leagueRecord ? `(${away.leagueRecord.wins}-${away.leagueRecord.losses})` : ''}
              </Text>
            </View>
            
            <View style={styles.gameInfo}>
              <Text allowFontScaling={false} style={[styles.gameStatus, { color: colors.primary }]}>{getGameStatus()}</Text>
              <Text allowFontScaling={false} style={[styles.gameTime, { color: theme.textSecondary }]}>{formatGameTime(gameDate)}</Text>
              <Text allowFontScaling={false} style={[styles.versus, { color: theme.textSecondary }]}>vs</Text>
            </View>
            
            <View style={styles.teamContainer}>
              <View style={styles.teamLogoContainer}>
                {(isGameLive(currentGame) || currentGame.status.abstractGameState === 'Final') && home.score !== undefined && (
                  <Text allowFontScaling={false} style={[getTeamScoreStyle(currentGame, false), { color: getScoreColor(currentGame, false) }]}>{home.score}</Text>
                )}
                <Image 
                  source={{ uri: getTeamLogoUrl(home.team.abbreviation) }}
                  style={getTeamLogoStyle(currentGame, false)}
                  defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
                />
              </View>
              <Text allowFontScaling={false} style={[getTeamNameStyle(currentGame, false), { color: getTeamNameColor(currentGame, false) }]}>
                {(() => {
                  const mlbId = home.team.id?.toString();
                  const espnId = convertMLBIdToESPNId(mlbId) || mlbId;
                  return isFavorite(espnId, 'mlb') && <Text allowFontScaling={false} style={{ color: colors.primary }}>★ </Text>;
                })()}
                {home.team.abbreviation}
              </Text>
              <Text allowFontScaling={false} style={[styles.teamRecord, { color: theme.textSecondary }]}>
                {home.leagueRecord ? `(${home.leagueRecord.wins}-${home.leagueRecord.losses})` : ''}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderTabButtons = () => {
    const tabs = ['Games', 'Stats', 'Roster'];
    
    return (
      <>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tabButton,
              activeTab === tab && styles.activeTabButton,
              { borderBottomColor: activeTab === tab ? colors.primary : 'transparent' }
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text allowFontScaling={false} style={[
              styles.tabText,
              activeTab === tab && styles.activeTabText,
              { color: activeTab === tab ? colors.primary : theme.textSecondary }
            ]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </>
    );
  };

  const renderMatchCard = (game) => {
    const away = game.teams.away;
    const home = game.teams.home;
    const gameDate = new Date(game.gameDate);
    const isCompleted = game.status.abstractGameState === 'Final';
    
    const formatGameTime = (date) => {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    };

    const formatGameDate = (date) => {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    };

    const getGameStatus = () => {
      if (isCompleted) {
        return 'Final';
      }
      const status = game.status.detailedState;
      if (status === 'Scheduled' || status === 'Pre-Game') {
        return formatGameDate(gameDate);
      }
      return status;
    };

    const getGameTime = () => {
      if (isCompleted) {
        // For completed games, show date and time
        return `${formatGameDate(gameDate)} - ${formatGameTime(gameDate)}`;
      }
      // For scheduled games, show just time
      return formatGameTime(gameDate);
    };

    return (
      <TouchableOpacity 
        style={[styles.gameCard, { backgroundColor: theme.surface }]}
        onPress={() => handleGamePress(game)}
        activeOpacity={0.7}
      >
        {/* Game Description Banner - Full width at top */}
        {game.description && (
          <View style={[styles.gameDescriptionBanner, { backgroundColor: colors.primary }]}>
            <Text allowFontScaling={false} style={styles.gameDescriptionText}>{game.description}</Text>
          </View>
        )}
        
        <View style={styles.gameTeams}>
          <View style={styles.teamContainer}>
            <View style={styles.teamLogoContainer}>
              <Image 
                source={{ uri: getTeamLogoUrl(away.team.abbreviation) }}
                style={getTeamLogoStyle(game, true)}
                defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
              />
              {isCompleted && away.score !== undefined && (
                <Text allowFontScaling={false} style={[getTeamScoreStyle(game, true), { color: getScoreColor(game, true) }]}>{away.score}</Text>
              )}
            </View>
            <Text allowFontScaling={false} style={[getTeamNameStyle(game, true), { color: getTeamNameColor(game, true) }]}>
              {(() => {
                const mlbId = away.team.id?.toString();
                const espnId = convertMLBIdToESPNId(mlbId) || mlbId;
                return isFavorite(espnId, 'mlb') && <Text allowFontScaling={false} style={{ color: colors.primary }}>★ </Text>;
              })()}
              {away.team.abbreviation}
            </Text>
            <Text allowFontScaling={false} style={[styles.teamRecord, { color: theme.textSecondary }]}>
              {away.leagueRecord ? `(${away.leagueRecord.wins}-${away.leagueRecord.losses})` : ''}
            </Text>
          </View>
          
          <View style={styles.gameInfo}>
            <Text allowFontScaling={false} style={[styles.gameStatus, { color: colors.primary }]}>{getGameStatus()}</Text>
            <Text allowFontScaling={false} style={[styles.gameTime, { color: theme.textSecondary }]}>{getGameTime()}</Text>
            <Text allowFontScaling={false} style={[styles.versus, { color: theme.textSecondary }]}>vs</Text>
          </View>
          
          <View style={styles.teamContainer}>
            <View style={styles.teamLogoContainer}>
              {isCompleted && home.score !== undefined && (
                <Text allowFontScaling={false} style={[getTeamScoreStyle(game, false), { color: getScoreColor(game, false) }]}>{home.score}</Text>
              )}
              <Image 
                source={{ uri: getTeamLogoUrl(home.team.abbreviation) }}
                style={getTeamLogoStyle(game, false)}
                defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
              />
            </View>
            <Text allowFontScaling={false} style={[getTeamNameStyle(game, false), { color: getTeamNameColor(game, false) }]}>
              {(() => {
                const mlbId = home.team.id?.toString();
                const espnId = convertMLBIdToESPNId(mlbId) || mlbId;
                return isFavorite(espnId, 'mlb') && <Text allowFontScaling={false} style={{ color: colors.primary }}>★ </Text>;
              })()}
              {home.team.abbreviation}
            </Text>
            <Text allowFontScaling={false} style={[styles.teamRecord, { color: theme.textSecondary }]}>
              {home.leagueRecord ? `(${home.leagueRecord.wins}-${home.leagueRecord.losses})` : ''}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderStatsContent = () => {
    if (loadingStats) {
      return (
        <View style={styles.statsLoadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>Loading team statistics...</Text>
        </View>
      );
    }

    if (!teamStats || (!teamStats.hitting && !teamStats.pitching)) {
      return (
        <View style={styles.statsLoadingContainer}>
          <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>Team statistics not available</Text>
        </View>
      );
    }

    const renderStatBox = (label, value, key) => (
      <View key={key} style={[styles.statBox, { backgroundColor: theme.surface }]}>
        <Text allowFontScaling={false} style={[styles.statBoxValue, { color: colors.primary }]}>{value}</Text>
        <Text allowFontScaling={false} style={[styles.statBoxLabel, { color: theme.textSecondary }]}>{label}</Text>
      </View>
    );

    const renderStatsGrid = (stats, title, statDefinitions) => {
      if (!stats) return null;

      const statBoxes = statDefinitions.map(({ key, label, format }) => {
        let value = stats[key];
        if (format && value !== undefined && value !== null) {
          value = format(value);
        }
        return renderStatBox(label, value || '--', `${title}-${key}`);
      });

      // Group stats into rows of 3
      const rows = [];
      for (let i = 0; i < statBoxes.length; i += 3) {
        rows.push(statBoxes.slice(i, i + 3));
      }

      return (
        <View style={styles.statsSection}>
          <Text allowFontScaling={false} style={[styles.statsSectionTitle, { color: theme.text }]}>{title}</Text>
          {rows.map((row, rowIndex) => (
            <View key={`${title}-row-${rowIndex}`} style={styles.statsRow}>
              {row}
            </View>
          ))}
        </View>
      );
    };

    // Define batting statistics to display
    const battingStats = [
      { key: 'avg', label: 'AVG' },
      { key: 'homeRuns', label: 'HR' },
      { key: 'rbi', label: 'RBI' },
      { key: 'runs', label: 'Runs' },
      { key: 'hits', label: 'Hits' },
      { key: 'doubles', label: '2B' },
      { key: 'triples', label: '3B' },
      { key: 'obp', label: 'OBP' },
      { key: 'slg', label: 'SLG' },
      { key: 'ops', label: 'OPS' },
      { key: 'strikeOuts', label: 'SO' },
      { key: 'baseOnBalls', label: 'BB' },
      { key: 'stolenBases', label: 'SB' },
      { key: 'stolenBasePercentage', label: 'SB%' },
      { key: 'babip', label: 'BABIP' }
    ];

    // Define pitching statistics to display
    const pitchingStats = [
      { key: 'era', label: 'ERA' },
      { key: 'wins', label: 'W' },
      { key: 'losses', label: 'L' },
      { key: 'saves', label: 'SV' },
      { key: 'strikeOuts', label: 'SO' },
      { key: 'whip', label: 'WHIP' },
      { key: 'inningsPitched', label: 'IP', format: (val) => parseFloat(val).toFixed(1) },
      { key: 'hits', label: 'H' },
      { key: 'baseOnBalls', label: 'BB' },
      { key: 'homeRuns', label: 'HR' },
      { key: 'strikeoutWalkRatio', label: 'K/BB' },
      { key: 'strikeoutsPer9Inn', label: 'K/9' },
      { key: 'walksPer9Inn', label: 'BB/9' },
      { key: 'hitsPer9Inn', label: 'H/9' },
      { key: 'homeRunsPer9', label: 'HR/9' }
    ];

    // Calculate per-game statistics
    const gamesPlayed = teamStats.hitting?.gamesPlayed || 1; // Avoid division by zero
    const perGameStats = teamStats.hitting ? {
      runs: (teamStats.hitting.runs / gamesPlayed).toFixed(1),
      hits: (teamStats.hitting.hits / gamesPlayed).toFixed(1),
      rbi: (teamStats.hitting.rbi / gamesPlayed).toFixed(1),
      // HA = Hits Allowed (from pitching stats)
      ha: teamStats.pitching ? (teamStats.pitching.hits / gamesPlayed).toFixed(1) : '--',
      // BBA = Walks Allowed (from pitching stats) 
      bba: teamStats.pitching ? (teamStats.pitching.baseOnBalls / gamesPlayed).toFixed(1) : '--',
      // HRA = Home Runs Allowed (from pitching stats)
      hra: teamStats.pitching ? (teamStats.pitching.homeRuns / gamesPlayed).toFixed(1) : '--'
    } : null;

    // Define per-game statistics to display
    const perGameStatDefinitions = [
      { key: 'runs', label: 'Runs/G' },
      { key: 'hits', label: 'Hits/G' },
      { key: 'rbi', label: 'RBI/G' },
      { key: 'ha', label: 'HA/G' },
      { key: 'bba', label: 'BBA/G' },
      { key: 'hra', label: 'HRA/G' }
    ];

    return (
      <ScrollView 
        style={[styles.statsContainer, { backgroundColor: theme.background }]} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.statsContent}
      >
        {perGameStats && renderStatsGrid(perGameStats, 'Per Game Statistics', perGameStatDefinitions)}
        {renderStatsGrid(teamStats.hitting, 'Batting Statistics', battingStats)}
        {renderStatsGrid(teamStats.pitching, 'Pitching Statistics', pitchingStats)}
      </ScrollView>
    );
  };

  const renderRosterContent = () => {
    if (loadingRoster) {
      return (
        <View style={styles.matchesSection}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>Loading roster...</Text>
        </View>
      );
    }

    if (!roster || roster.length === 0) {
      return (
        <View style={styles.matchesSection}>
          <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>Roster data not available</Text>
        </View>
      );
    }

    // Group players by position
    const pitchers = roster.filter(player => player.position?.abbreviation === 'P');
    const catchers = roster.filter(player => player.position?.abbreviation === 'C');
    const infielders = roster.filter(player => ['1B', '2B', '3B', 'SS'].includes(player.position?.abbreviation));
    const outfielders = roster.filter(player => ['LF', 'CF', 'RF', 'OF'].includes(player.position?.abbreviation));
    const others = roster.filter(player => !['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF'].includes(player.position?.abbreviation));

    const renderPlayerSection = (title, players, sectionKey) => {
      if (players.length === 0) return null;

      const isCollapsed = collapsedRosterSections[sectionKey];

      const toggleSection = () => {
        setCollapsedRosterSections(prev => ({
          ...prev,
          [sectionKey]: !prev[sectionKey]
        }));
      };

      return (
        <View style={styles.rosterSection}>
          <TouchableOpacity 
            style={styles.rosterSectionHeader}
            onPress={toggleSection}
            activeOpacity={0.7}
          >
            <Text allowFontScaling={false} style={[styles.rosterSectionTitle, { color: theme.text }]}>
              {title} ({players.length})
            </Text>
            <Text allowFontScaling={false} style={[styles.rosterSectionArrow, { color: theme.text }]}>
              {isCollapsed ? '▶' : '▼'}
            </Text>
          </TouchableOpacity>
          {!isCollapsed && (
            <View style={styles.rosterTableContainer}>
              <View style={[styles.rosterTableHeader, { backgroundColor: theme.surface }]}>
                <Text allowFontScaling={false} style={[styles.rosterTableHeaderPlayer, { color: theme.text }]}>Player</Text>
                <Text allowFontScaling={false} style={[styles.rosterTableHeaderStatus, { color: theme.text }]}>Status</Text>
              </View>
              {players.map((player) => (
                <TouchableOpacity 
                  key={player.person.id} 
                  style={[styles.rosterTableRow, { borderBottomColor: theme.border, backgroundColor: theme.surfaceSecondary }]}
                  onPress={() => {
                    console.log('Navigating to player page:', player.person.id, player.person.fullName);
                    navigation.navigate('PlayerPage', { 
                      playerId: player.person.id,
                      playerName: player.person.fullName,
                      teamId: teamId,
                      sport: sport 
                    });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.rosterTablePlayerCell}>
                    <View style={styles.rosterPlayerRow}>
                      <Image 
                        source={{ 
                          uri: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${player.person.id}/headshot/67/current` 
                        }}
                        style={styles.playerHeadshot}
                        defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
                      />
                      <View style={styles.rosterPlayerInfo}>
                        <Text allowFontScaling={false} style={[styles.rosterTablePlayerName, { color: theme.text }]}>
                          {player.person.fullName}
                        </Text>
                        <Text allowFontScaling={false} style={[styles.rosterTablePlayerDetails, { color: theme.textTertiary }]}>
                          <Text allowFontScaling={false} style={[styles.rosterTablePlayerNumber, { color: theme.textTertiary }]}>#{player.jerseyNumber || '--'}</Text>
                          {' • '}
                          {player.position?.abbreviation || 'N/A'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.rosterTableStatusCell}>
                    <Text allowFontScaling={false} style={[
                      styles.rosterTableStatusText,
                      player.status?.code === 'A' ? styles.activeStatus : styles.inactiveStatus
                    ]}>
                      {player.status?.code === 'A' ? 'Active' : player.status?.description || 'Inactive'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      );
    };

    return (
      <ScrollView style={[styles.rosterContainer, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
        {renderPlayerSection('Pitchers', pitchers, 'pitchers')}
        {renderPlayerSection('Catchers', catchers, 'catchers')}
        {renderPlayerSection('Infielders', infielders, 'infielders')}
        {renderPlayerSection('Outfielders', outfielders, 'outfielders')}
        {others.length > 0 && renderPlayerSection('Others', others, 'others')}
      </ScrollView>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'Games':
        return (
          <ScrollView style={[styles.gamesContainer, { backgroundColor: theme.background }]}>
            {renderCurrentGame()}
            
            <View style={styles.matchesSection}>
              <TouchableOpacity 
                style={styles.sectionHeader}
                onPress={() => setLastMatchesCollapsed(!lastMatchesCollapsed)}
              >
                <Text allowFontScaling={false} style={[styles.gameSectionTitle, { color: colors.primary }]}>Last Matches</Text>
                <Text allowFontScaling={false} style={[styles.collapseArrow, { color: colors.primary }]}>
                  {lastMatchesCollapsed ? '▶' : '▼'}
                </Text>
              </TouchableOpacity>
              
              {lastMatches.length > 0 ? (
                <View>
                  {(lastMatchesCollapsed ? lastMatches.slice(0, 1) : lastMatches).map((game, index) => (
                    <View key={`last-${game.gamePk}-${index}`}>{renderMatchCard(game)}</View>
                  ))}
                </View>
              ) : (
                <View style={[styles.gameSectionCard, { backgroundColor: theme.surface }]}>
                  <Text allowFontScaling={false} style={[styles.noGameText, { color: theme.textSecondary }]}>No previous games found</Text>
                </View>
              )}
            </View>
            
            <View style={styles.matchesSection}>
              <TouchableOpacity 
                style={styles.sectionHeader}
                onPress={() => setNextMatchesCollapsed(!nextMatchesCollapsed)}
              >
                <Text allowFontScaling={false} style={[styles.gameSectionTitle, { color: colors.primary }]}>Next Matches</Text>
                <Text allowFontScaling={false} style={[styles.collapseArrow, { color: colors.primary }]}>
                  {nextMatchesCollapsed ? '▶' : '▼'}
                </Text>
              </TouchableOpacity>
              
              {nextMatches.length > 0 ? (
                <View>
                  {(nextMatchesCollapsed ? nextMatches.slice(0, 1) : nextMatches).map((game, index) => (
                    <View key={`next-${game.gamePk}-${index}`}>{renderMatchCard(game)}</View>
                  ))}
                </View>
              ) : (
                <View style={[styles.gameSectionCard, { backgroundColor: theme.surface }]}>
                  <Text allowFontScaling={false} style={[styles.noGameText, { color: theme.textSecondary }]}>No upcoming games found</Text>
                </View>
              )}
            </View>
          </ScrollView>
        );
      case 'Stats':
        return renderStatsContent();
      case 'Roster':
        return renderRosterContent();
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.text }]}>Loading team information...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderTeamHeader()}
      
      {/* Fixed Tab Container */}
      <View style={[styles.fixedTabContainer, { backgroundColor: theme.surface }]}>
        {renderTabButtons()}
      </View>
      
      <ScrollView style={[styles.contentScrollView, { backgroundColor: theme.background }]}>
        {renderContent()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  debugBanner: {
    padding: 8,
    backgroundColor: '#111',
    margin: 8,
    borderRadius: 6
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
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  teamLogo: {
    width: 80,
    height: 80,
    marginRight: 20,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  teamDivision: {
    fontSize: 16,
    marginBottom: 8,
  },
  recordContainer: {
    marginTop: 4,
    marginLeft: 0,
  },
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 180,
  },
  recordValue: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 1,
  },
  recordLabel: {
    fontSize: 12,
    textAlign: 'center',
    flex: 1,
    marginTop: 2,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  fixedTabContainer: {
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
  },
  contentScrollView: {
    flex: 1,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTabButton: {
    borderBottomWidth: 3,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
  },
  activeTabText: {
    fontWeight: 'bold',
  },
  contentContainer: {
    flex: 1,
    padding: 15,
  },
  gamesContainer: {
    flex: 1,
    paddingTop: 5,
  },
  matchesSection: {
    paddingHorizontal: 15,
    paddingVertical: 5,
  },
  contentText: {
    fontSize: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  gameSection: {
    marginBottom: 20,
  },
  gameSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  gameSectionCard: {
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  gameCard: {
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  gameTeams: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  teamContainer: {
    flex: 1,
    alignItems: 'center',
  },
  gameTeamLogo: {
    width: 40,
    height: 40,
    marginBottom: 5,
  },
  gameTeamName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  versus: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 5,
  },
  teamRecord: {
    fontSize: 12,
  },
  gameInfo: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  gameStatus: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  gameTime: {
    fontSize: 12,
  },
  noGameContainer: {
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  noGameText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  collapseButton: {
    padding: 5,
  },
  collapseArrow: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  teamLogoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  gameTeamScore: {
    fontSize: 30,
    fontWeight: 'bold',
    marginHorizontal: 8,
  },
  losingTeamScore: {
    color: '#999',
  },
  losingTeamName: {
    color: '#999',
  },
  gameDescriptionBanner: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    marginBottom: 10,
    marginHorizontal: -15,
    marginTop: -15,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  gameDescriptionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Roster styles
  rosterContainer: {
    flex: 1,
    padding: 15,
  },
  rosterSection: {
    marginBottom: 20,
  },
  rosterSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  rosterSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
  },
  rosterSectionArrow: {
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
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
  rosterPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerHeadshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  rosterPlayerInfo: {
    flex: 1,
  },
  rosterTablePlayerName: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  rosterTablePlayerDetails: {
    fontSize: 12,
  },
  rosterTablePlayerNumber: {
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
  // Stats styles
  statsContainer: {
    flex: 1,
  },
  statsContent: {
    padding: 15,
  },
  statsLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  statsSection: {
    marginBottom: 25,
  },
  statsSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    gap: 10,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: 15,
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
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  statBoxLabel: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  favoriteButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    padding: 10,
    zIndex: 1,
  },
  favoriteIcon: {
    fontSize: 24,
    fontWeight: 'bold',
  },
});

export default TeamPageScreen;
