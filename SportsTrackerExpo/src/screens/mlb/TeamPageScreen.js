import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, ScrollView } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

const TeamPageScreen = ({ route, navigation }) => {
  const { teamId, sport } = route.params;
  const { theme, colors, isDarkMode, getTeamLogoUrl: getThemeTeamLogoUrl } = useTheme();
  const [activeTab, setActiveTab] = useState('Games');
  const [teamData, setTeamData] = useState(null);
  const [teamRecord, setTeamRecord] = useState(null);
  const [currentGame, setCurrentGame] = useState(null);
  const [lastMatches, setLastMatches] = useState([]);
  const [nextMatches, setNextMatches] = useState([]);
  const [lastMatchesCollapsed, setLastMatchesCollapsed] = useState(true);
  const [nextMatchesCollapsed, setNextMatchesCollapsed] = useState(true);
  const [loading, setLoading] = useState(true);
  const liveUpdateInterval = useRef(null);

  useEffect(() => {
    console.log('TeamPageScreen received - teamId:', teamId, 'sport:', sport);
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
      // Fetch team basic info from MLB API
      const url = `https://statsapi.mlb.com/api/v1/teams/${teamId}`;
      console.log('Fetching team data from:', url);
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
              
              setTeamRecord({ wins, losses, lastTen, streak });
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
      
      const todayResponse = await fetch(
        `https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&teamId=${teamId}&startDate=${today}&endDate=${today}&hydrate=team,linescore,decisions`
      );
      const todayData = await todayResponse.json();

      // Check if there's a game today - prioritize live games
      if (todayData.dates && todayData.dates.length > 0 && todayData.dates[0].games.length > 0) {
        const games = todayData.dates[0].games;
        
        // First, look for any live games
        const liveGame = games.find(game => isGameLive(game));
        if (liveGame) {
          console.log('Found live game:', liveGame.gamePk);
          setCurrentGame(liveGame);
          return;
        }
        
        // If no live games, look for scheduled games
        const scheduledGame = games.find(game => 
          game.status.abstractGameState === 'Preview' || 
          game.status.detailedState.includes('Scheduled')
        );
        if (scheduledGame) {
          console.log('Found scheduled game for today:', scheduledGame.gamePk);
          setCurrentGame(scheduledGame);
          return;
        }
        
        // Otherwise, take the first game (likely completed)
        console.log('Found completed game for today:', games[0].gamePk);
        setCurrentGame(games[0]);
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
          `https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&teamId=${teamId}&startDate=${startSearchDate}&endDate=${end}&hydrate=team,linescore,decisions`
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
                setCurrentGame(nextGame);
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
      // Get current year season games
      const currentYear = new Date().getFullYear();
      const response = await fetch(
        `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&season=${currentYear}&gameType=R&gameType=D&gameType=L&gameType=W&hydrate=team,linescore,decisions`
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
      if (isGameLive(currentGame)) {
        startLiveUpdates();
      } else {
        stopLiveUpdates();
      }
    }

    return () => stopLiveUpdates();
  }, [currentGame]);

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
    
    const isGameFinal = game.status.abstractGameState === 'Final';
    const awayScore = parseInt(game.teams.away.score || '0');
    const homeScore = parseInt(game.teams.home.score || '0');
    const isLosing = isGameFinal && (
      (isAwayTeam && awayScore < homeScore) || 
      (!isAwayTeam && homeScore < awayScore)
    );
    return isLosing ? [styles.gameTeamName, styles.losingTeamName] : styles.gameTeamName;
  };

  const renderTeamHeader = () => {
    if (!teamData) return null;

    const getStreakColor = (streak) => {
      if (!streak || streak === 'N/A') return '#666';
      return streak.startsWith('W') ? '#008000' : streak.startsWith('L') ? '#FF0000' : '#666';
    };

    return (
      <View style={[styles.teamHeader, { backgroundColor: theme.surface }]}>
        <Image 
          source={{ uri: getTeamLogoUrl(teamData.abbreviation) }}
          style={styles.teamLogo}
          defaultSource={{ uri: 'https://via.placeholder.com/80x80?text=MLB' }}
        />
        <View style={styles.teamInfo}>
          <Text style={[styles.teamName, { color: getTeamColor(teamData.abbreviation) }]}>
            {teamData.name}
          </Text>
          <Text style={[styles.teamDivision, { color: theme.textSecondary }]}>{teamData.division?.name || 'N/A'}</Text>
          
          {teamRecord && (
            <View style={styles.recordContainer}>
              <View style={styles.recordRow}>
                <Text style={[styles.recordValue, { color: theme.text }]}>{teamRecord.wins}-{teamRecord.losses}</Text>
                <Text style={[styles.recordValue, { color: theme.text }]}>{teamRecord.lastTen}</Text>
                <Text style={[styles.recordValue, { color: getStreakColor(teamRecord.streak) }]}>
                  {teamRecord.streak}
                </Text>
              </View>
              <View style={styles.recordRow}>
                <Text style={[styles.recordLabel, { color: theme.textSecondary }]}>RECORD</Text>
                <Text style={[styles.recordLabel, { color: theme.textSecondary }]}>L10</Text>
                <Text style={[styles.recordLabel, { color: theme.textSecondary }]}>STRK</Text>
              </View>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderCurrentGame = () => {
    if (!currentGame) {
      return (
        <View style={styles.matchesSection}>
          <Text style={[styles.gameSectionTitle, { color: colors.primary }]}>Current Game</Text>
          <View style={styles.noGameContainer}>
            <Text style={[styles.noGameText, { color: theme.textSecondary }]}>No current or upcoming games found</Text>
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
        <Text style={[styles.gameSectionTitle, { color: colors.primary }]}>
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
                  style={styles.gameTeamLogo}
                  defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
                />
                {(isGameLive(currentGame) || currentGame.status.abstractGameState === 'Final') && away.score !== undefined && (
                  <Text style={[getTeamScoreStyle(currentGame, true), { color: getScoreColor(currentGame, true) }]}>{away.score}</Text>
                )}
              </View>
              <Text style={[getTeamNameStyle(currentGame, true), { color: getTeamNameColor(currentGame, true) }]}>{away.team.abbreviation}</Text>
              <Text style={[styles.teamRecord, { color: theme.textSecondary }]}>
                {away.leagueRecord ? `(${away.leagueRecord.wins}-${away.leagueRecord.losses})` : ''}
              </Text>
            </View>
            
            <View style={styles.gameInfo}>
              <Text style={[styles.gameStatus, { color: colors.primary }]}>{getGameStatus()}</Text>
              <Text style={[styles.gameTime, { color: theme.textSecondary }]}>{formatGameTime(gameDate)}</Text>
              <Text style={[styles.versus, { color: theme.textSecondary }]}>vs</Text>
            </View>
            
            <View style={styles.teamContainer}>
              <View style={styles.teamLogoContainer}>
                {(isGameLive(currentGame) || currentGame.status.abstractGameState === 'Final') && home.score !== undefined && (
                  <Text style={[getTeamScoreStyle(currentGame, false), { color: getScoreColor(currentGame, false) }]}>{home.score}</Text>
                )}
                <Image 
                  source={{ uri: getTeamLogoUrl(home.team.abbreviation) }}
                  style={styles.gameTeamLogo}
                  defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
                />
              </View>
              <Text style={[getTeamNameStyle(currentGame, false), { color: getTeamNameColor(currentGame, false) }]}>{home.team.abbreviation}</Text>
              <Text style={[styles.teamRecord, { color: theme.textSecondary }]}>
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
            <Text style={[
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
            <Text style={styles.gameDescriptionText}>{game.description}</Text>
          </View>
        )}
        
        <View style={styles.gameTeams}>
          <View style={styles.teamContainer}>
            <View style={styles.teamLogoContainer}>
              <Image 
                source={{ uri: getTeamLogoUrl(away.team.abbreviation) }}
                style={styles.gameTeamLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
              />
              {isCompleted && away.score !== undefined && (
                <Text style={[getTeamScoreStyle(game, true), { color: getScoreColor(game, true) }]}>{away.score}</Text>
              )}
            </View>
            <Text style={[getTeamNameStyle(game, true), { color: getTeamNameColor(game, true) }]}>{away.team.abbreviation}</Text>
            <Text style={[styles.teamRecord, { color: theme.textSecondary }]}>
              {away.leagueRecord ? `(${away.leagueRecord.wins}-${away.leagueRecord.losses})` : ''}
            </Text>
          </View>
          
          <View style={styles.gameInfo}>
            <Text style={[styles.gameStatus, { color: colors.primary }]}>{getGameStatus()}</Text>
            <Text style={[styles.gameTime, { color: theme.textSecondary }]}>{getGameTime()}</Text>
            <Text style={[styles.versus, { color: theme.textSecondary }]}>vs</Text>
          </View>
          
          <View style={styles.teamContainer}>
            <View style={styles.teamLogoContainer}>
              {isCompleted && home.score !== undefined && (
                <Text style={[getTeamScoreStyle(game, false), { color: getScoreColor(game, false) }]}>{home.score}</Text>
              )}
              <Image 
                source={{ uri: getTeamLogoUrl(home.team.abbreviation) }}
                style={styles.gameTeamLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
              />
            </View>
            <Text style={[getTeamNameStyle(game, false), { color: getTeamNameColor(game, false) }]}>{home.team.abbreviation}</Text>
            <Text style={[styles.teamRecord, { color: theme.textSecondary }]}>
              {home.leagueRecord ? `(${home.leagueRecord.wins}-${home.leagueRecord.losses})` : ''}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
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
                <Text style={[styles.gameSectionTitle, { color: colors.primary }]}>Last Matches</Text>
                <Text style={[styles.collapseArrow, { color: colors.primary }]}>
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
                  <Text style={[styles.noGameText, { color: theme.textSecondary }]}>No previous games found</Text>
                </View>
              )}
            </View>
            
            <View style={styles.matchesSection}>
              <TouchableOpacity 
                style={styles.sectionHeader}
                onPress={() => setNextMatchesCollapsed(!nextMatchesCollapsed)}
              >
                <Text style={[styles.gameSectionTitle, { color: colors.primary }]}>Next Matches</Text>
                <Text style={[styles.collapseArrow, { color: colors.primary }]}>
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
                  <Text style={[styles.noGameText, { color: theme.textSecondary }]}>No upcoming games found</Text>
                </View>
              )}
            </View>
          </ScrollView>
        );
      case 'Stats':
        return (
          <View style={[styles.contentContainer, { backgroundColor: theme.background }]}>
            <Text style={[styles.contentText, { color: theme.textSecondary }]}>Team statistics will be implemented here</Text>
          </View>
        );
      case 'Roster':
        return (
          <View style={[styles.contentContainer, { backgroundColor: theme.background }]}>
            <Text style={[styles.contentText, { color: theme.textSecondary }]}>Roster content will be implemented here</Text>
          </View>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>Loading team information...</Text>
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
});

export default TeamPageScreen;
