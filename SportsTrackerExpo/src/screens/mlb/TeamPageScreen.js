import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, ScrollView } from 'react-native';

const TeamPageScreen = ({ route, navigation }) => {
  const { teamId, sport } = route.params;
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
      // Get today's date adjusted for MLB timezone (similar to web version)
      const getAdjustedDateForMLB = () => {
        const now = new Date();
        const utc = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
        const easternTime = new Date(utc.getTime() + (-5 * 3600000)); // EST offset
        return easternTime.toISOString().split('T')[0];
      };

      const today = getAdjustedDateForMLB();
      const todayResponse = await fetch(
        `https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&teamId=${teamId}&startDate=${today}&endDate=${today}&hydrate=team,linescore,decisions`
      );
      const todayData = await todayResponse.json();

      // Check if there's a game today
      if (todayData.dates && todayData.dates.length > 0 && todayData.dates[0].games.length > 0) {
        const game = todayData.dates[0].games[0];
        console.log('Found today\'s game:', JSON.stringify(game, null, 2));
        setCurrentGame(game);
      } else {
        // No game today, look for next upcoming game
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 14); // Look ahead 14 days

        const formatDate = (date) => date.toISOString().split('T')[0];
        const startDate = formatDate(tomorrow);
        const end = formatDate(endDate);

        const upcomingResponse = await fetch(
          `https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&teamId=${teamId}&startDate=${startDate}&endDate=${end}&hydrate=team,linescore,decisions`
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
                console.log('Found upcoming game:', JSON.stringify(nextGame, null, 2));
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
        
        // Find current game index (same as the one in currentGame state)
        let currentGameIndex = -1;
        if (currentGame) {
          currentGameIndex = allGames.findIndex(game => game.gamePk === currentGame.gamePk);
        }
        
        // If no current game found, find the next upcoming game
        if (currentGameIndex === -1) {
          const today = new Date();
          currentGameIndex = allGames.findIndex(game => {
            const gameDate = new Date(game.gameDate);
            return gameDate >= today && ["Scheduled", "Pre-Game", "Warmup"].includes(game.status.detailedState);
          });
        }
        
        // Get last matches (games before current game, in reverse order)
        const lastMatchesData = currentGameIndex > 0 ? 
          allGames.slice(0, currentGameIndex).reverse() : [];
        
        // Get next matches (games after current game)
        const nextMatchesData = currentGameIndex >= 0 && currentGameIndex < allGames.length - 1 ? 
          allGames.slice(currentGameIndex + 1) : [];
        
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
    return state === 'Live' || state === 'Preview' && game.status.detailedState === 'In Progress';
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
    const abbrev = abbreviation.toLowerCase();
    return `https://a.espncdn.com/i/teamlogos/mlb/500/${abbrev}.png`;
  };

  const getTeamLogoUrl = (teamAbbreviation) => {
    if (!teamAbbreviation) return 'https://via.placeholder.com/40x40?text=MLB';
    
    // Handle special cases where ESPN uses different abbreviations
    const abbreviationMap = {
      'ARI': 'ari', // Arizona Diamondbacks
      'AZ': 'ari',  // Alternative Arizona abbreviation
      'WSH': 'wsh', // Washington Nationals
      'WAS': 'wsh', // Alternative Washington abbreviation
      'CWS': 'chw', // Chicago White Sox (ESPN uses 'chw' not 'cws')
      'KCR': 'kc',  // Kansas City Royals
      'SDP': 'sd',  // San Diego Padres
      'SFG': 'sf',  // San Francisco Giants
      'TBR': 'tb',  // Tampa Bay Rays
      'LAA': 'laa', // Los Angeles Angels
      'LAD': 'lad'  // Los Angeles Dodgers
    };

    const mappedAbbr = abbreviationMap[teamAbbreviation.toUpperCase()] || teamAbbreviation.toLowerCase();
    console.log(`Team ${teamAbbreviation} mapped to ${mappedAbbr} for logo URL`);
    
    return `https://a.espncdn.com/i/teamlogos/mlb/500/${mappedAbbr}.png`;
  };

  const getTeamColor = (abbreviation) => {
    // Normalize abbreviation for consistent lookup
    const normalizedAbbr = abbreviation === 'AZ' ? 'ARI' : abbreviation;
    
    const teamColors = {
      'LAA': '#BA0021', // Angels - Red
      'HOU': '#EB6E1F', // Astros - Orange
      'ATH': '#003831', // Athletics - Green
      'TOR': '#134A8E', // Blue Jays - Blue
      'ATL': '#CE1141', // Braves - Red
      'MIL': '#FFC52F', // Brewers - Yellow (but will use dark blue instead)
      'STL': '#C41E3A', // Cardinals - Red
      'CHC': '#0E3386', // Cubs - Blue
      'ARI': '#A71930', // Diamondbacks - Red
      'LAD': '#005A9C', // Dodgers - Blue
      'SF': '#FD5A1E', // Giants - Orange
      'CLE': '#E31937', // Guardians - Red
      'SEA': '#0C2C56', // Mariners - Navy
      'MIA': '#00A3E0', // Marlins - Blue
      'NYM': '#FF5910', // Mets - Orange
      'WSH': '#AB0003', // Nationals - Red
      'BAL': '#DF4601', // Orioles - Orange
      'SD': '#FFC425', // Padres - Yellow (but will use brown instead)
      'PHI': '#E81828', // Phillies - Red
      'PIT': '#FDB827', // Pirates - Yellow (but will use black instead)
      'TEX': '#C0111F', // Rangers - Red
      'TB': '#092C5C', // Rays - Navy
      'BOS': '#BD3039', // Red Sox - Red
      'CIN': '#C6011F', // Reds - Red
      'COL': '#C4CED4', // Rockies - Silver (will use purple instead)
      'KC': '#004687', // Royals - Blue
      'DET': '#0C2340', // Tigers - Navy
      'MIN': '#002B5C', // Twins - Navy
      'CWS': '#27251F', // White Sox - Black
      'NYY': '#132448'  // Yankees - Navy
    };

    // Special handling for teams with light/white primary colors
    const lightColorOverrides = {
      'MIL': '#12284B', // Use navy instead of yellow
      'SD': '#2F241D',  // Use brown instead of yellow
      'PIT': '#27251F', // Use black instead of yellow
      'COL': '#33006F'  // Use purple instead of silver
    };

    const color = lightColorOverrides[normalizedAbbr] || teamColors[normalizedAbbr];
    console.log(`Team color for ${abbreviation} (normalized: ${normalizedAbbr}):`, color);
    return color || '#333'; // Default to dark gray if team not found
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
      <View style={styles.teamHeader}>
        <Image 
          source={{ uri: getTeamLogoUrl(teamData.abbreviation) }}
          style={styles.teamLogo}
          defaultSource={{ uri: 'https://via.placeholder.com/80x80?text=MLB' }}
        />
        <View style={styles.teamInfo}>
          <Text style={[styles.teamName, { color: getTeamColor(teamData.abbreviation) }]}>
            {teamData.name}
          </Text>
          <Text style={styles.teamDivision}>{teamData.division?.name || 'N/A'}</Text>
          
          {teamRecord && (
            <View style={styles.recordContainer}>
              <View style={styles.recordRow}>
                <Text style={styles.recordValue}>{teamRecord.wins}-{teamRecord.losses}</Text>
                <Text style={styles.recordValue}>{teamRecord.lastTen}</Text>
                <Text style={[styles.recordValue, { color: getStreakColor(teamRecord.streak) }]}>
                  {teamRecord.streak}
                </Text>
              </View>
              <View style={styles.recordRow}>
                <Text style={styles.recordLabel}>RECORD</Text>
                <Text style={styles.recordLabel}>L10</Text>
                <Text style={styles.recordLabel}>STRK</Text>
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
          <Text style={styles.gameSectionTitle}>Current Game</Text>
          <View style={styles.noGameContainer}>
            <Text style={styles.noGameText}>No current or upcoming games found</Text>
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
        return `🔴 ${status}`;
      }
      return status;
    };

    return (
      <View style={styles.matchesSection}>
        <Text style={styles.gameSectionTitle}>
          {isToday ? 'Current Game' : 'Upcoming Game'}
        </Text>
        <TouchableOpacity 
          style={styles.gameCard}
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
                  <Text style={styles.gameTeamScore}>{away.score}</Text>
                )}
              </View>
              <Text style={styles.gameTeamName}>{away.team.abbreviation}</Text>
              <Text style={styles.teamRecord}>
                {away.leagueRecord ? `(${away.leagueRecord.wins}-${away.leagueRecord.losses})` : ''}
              </Text>
            </View>
            
            <View style={styles.gameInfo}>
              <Text style={styles.gameStatus}>{getGameStatus()}</Text>
              <Text style={styles.gameTime}>{formatGameTime(gameDate)}</Text>
              <Text style={styles.versus}>vs</Text>
            </View>
            
            <View style={styles.teamContainer}>
              <View style={styles.teamLogoContainer}>
                {(isGameLive(currentGame) || currentGame.status.abstractGameState === 'Final') && home.score !== undefined && (
                  <Text style={styles.gameTeamScore}>{home.score}</Text>
                )}
                <Image 
                  source={{ uri: getTeamLogoUrl(home.team.abbreviation) }}
                  style={styles.gameTeamLogo}
                  defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
                />
              </View>
              <Text style={styles.gameTeamName}>{home.team.abbreviation}</Text>
              <Text style={styles.teamRecord}>
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
              activeTab === tab && styles.activeTabButton
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[
              styles.tabText,
              activeTab === tab && styles.activeTabText
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
        style={styles.gameCard}
        onPress={() => handleGamePress(game)}
        activeOpacity={0.7}
      >
        {/* Game Description Banner - Full width at top */}
        {game.description && (
          <View style={styles.gameDescriptionBanner}>
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
                <Text style={getTeamScoreStyle(game, true)}>{away.score}</Text>
              )}
            </View>
            <Text style={getTeamNameStyle(game, true)}>{away.team.abbreviation}</Text>
            <Text style={styles.teamRecord}>
              {away.leagueRecord ? `(${away.leagueRecord.wins}-${away.leagueRecord.losses})` : ''}
            </Text>
          </View>
          
          <View style={styles.gameInfo}>
            <Text style={styles.gameStatus}>{getGameStatus()}</Text>
            <Text style={styles.gameTime}>{getGameTime()}</Text>
            <Text style={styles.versus}>vs</Text>
          </View>
          
          <View style={styles.teamContainer}>
            <View style={styles.teamLogoContainer}>
              {isCompleted && home.score !== undefined && (
                <Text style={getTeamScoreStyle(game, false)}>{home.score}</Text>
              )}
              <Image 
                source={{ uri: getTeamLogoUrl(home.team.abbreviation) }}
                style={styles.gameTeamLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
              />
            </View>
            <Text style={getTeamNameStyle(game, false)}>{home.team.abbreviation}</Text>
            <Text style={styles.teamRecord}>
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
          <ScrollView style={styles.gamesContainer}>
            {renderCurrentGame()}
            
            <View style={styles.matchesSection}>
              <TouchableOpacity 
                style={styles.sectionHeader}
                onPress={() => setLastMatchesCollapsed(!lastMatchesCollapsed)}
              >
                <Text style={styles.gameSectionTitle}>Last Matches</Text>
                <Text style={styles.collapseArrow}>
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
                <View style={styles.gameSectionCard}>
                  <Text style={styles.noGameText}>No previous games found</Text>
                </View>
              )}
            </View>
            
            <View style={styles.matchesSection}>
              <TouchableOpacity 
                style={styles.sectionHeader}
                onPress={() => setNextMatchesCollapsed(!nextMatchesCollapsed)}
              >
                <Text style={styles.gameSectionTitle}>Next Matches</Text>
                <Text style={styles.collapseArrow}>
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
                <View style={styles.gameSectionCard}>
                  <Text style={styles.noGameText}>No upcoming games found</Text>
                </View>
              )}
            </View>
          </ScrollView>
        );
      case 'Stats':
        return (
          <View style={styles.contentContainer}>
            <Text style={styles.contentText}>Team statistics will be implemented here</Text>
          </View>
        );
      case 'Roster':
        return (
          <View style={styles.contentContainer}>
            <Text style={styles.contentText}>Roster content will be implemented here</Text>
          </View>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#013369" />
        <Text style={styles.loadingText}>Loading team information...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderTeamHeader()}
      
      {/* Fixed Tab Container */}
      <View style={styles.fixedTabContainer}>
        {renderTabButtons()}
      </View>
      
      <ScrollView style={styles.contentScrollView}>
        {renderContent()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
  teamHeader: {
    backgroundColor: '#fff',
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
    color: '#888',
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
    color: '#333',
    textAlign: 'center',
    flex: 1,
  },
  recordLabel: {
    fontSize: 12,
    color: '#888',
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
    backgroundColor: '#fff',
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
    backgroundColor: '#f5f5f5',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTabButton: {
    borderBottomColor: '#013369',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
  activeTabText: {
    color: '#013369',
    fontWeight: 'bold',
  },
  contentContainer: {
    flex: 1,
    padding: 15,
  },
  gamesContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: 5,
  },
  matchesSection: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 15,
    paddingVertical: 5,
  },
  contentText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  gameSection: {
    marginBottom: 20,
  },
  gameSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#013369',
    marginBottom: 5,
  },
  gameSectionCard: {
    backgroundColor: '#fff',
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
    backgroundColor: '#fff',
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
    color: '#333',
    marginBottom: 2,
  },
  versus: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#888',
    marginTop: 5,
  },
  teamRecord: {
    fontSize: 12,
    color: '#888',
  },
  gameInfo: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  gameStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: '#013369',
    marginBottom: 2,
  },
  gameTime: {
    fontSize: 12,
    color: '#888',
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
    color: '#888',
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
    color: '#013369',
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
    color: '#013369',
    marginHorizontal: 8,
  },
  losingTeamScore: {
    color: '#999',
  },
  losingTeamName: {
    color: '#999',
  },
  gameDescriptionBanner: {
    backgroundColor: '#013369',
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
