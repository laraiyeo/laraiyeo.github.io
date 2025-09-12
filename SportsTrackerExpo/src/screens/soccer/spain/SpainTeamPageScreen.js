import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, ScrollView } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { SpainServiceEnhanced } from '../../../services/soccer/SpainServiceEnhanced';

const SpainTeamPageScreen = ({ route, navigation }) => {
  const { teamId, teamName } = route.params;
  const { theme, colors, isDarkMode } = useTheme();
  const [activeTab, setActiveTab] = useState('Games');
  const [teamData, setTeamData] = useState(null);
  const [teamRecord, setTeamRecord] = useState(null);
  const [currentGame, setCurrentGame] = useState(null);
  const [lastMatches, setLastMatches] = useState([]);
  const [nextMatches, setNextMatches] = useState([]);
  const [lastMatchesCollapsed, setLastMatchesCollapsed] = useState(true);
  const [nextMatchesCollapsed, setNextMatchesCollapsed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState(null);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [collapsedRosterSections, setCollapsedRosterSections] = useState({
    goalkeepers: true,
    defenders: true,
    midfielders: true,
    forwards: true,
    others: true
  });
  const [teamStats, setTeamStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const liveUpdateInterval = useRef(null);

  useEffect(() => {
    console.log('SpainTeamPageScreen received - teamId:', teamId, 'teamName:', teamName);
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
      // Fetch team basic info from ESPN Soccer API
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/teams/${teamId}`;
      console.log('Fetching team data from:', url);
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('Team API response:', data);
      
      if (data.team) {
        setTeamData(data.team);
        
        // Fetch team record from standings
        await fetchTeamRecord(data.team.id);
        
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

  const fetchTeamRecord = async (teamId) => {
    try {
      console.log('Fetching team record for teamId:', teamId);
      const standingsData = await SpainServiceEnhanced.getStandings();
      
      if (standingsData?.standings?.entries) {
        const teamEntry = standingsData.standings.entries.find(
          entry => entry.team.id === teamId
        );
        
        if (teamEntry) {
          console.log('Found team entry:', teamEntry);
          const wins = teamEntry.stats.find(stat => stat.name === "wins")?.displayValue || "0";
          const losses = teamEntry.stats.find(stat => stat.name === "losses")?.displayValue || "0";
          const draws = teamEntry.stats.find(stat => stat.name === "ties")?.displayValue || "0";
          const points = teamEntry.stats.find(stat => stat.name === "points")?.displayValue || "0";
          const position = teamEntry.stats.find(stat => stat.name === "rank")?.displayValue || "N/A";
          
          setTeamRecord({ wins, losses, draws, points, position });
          return;
        }
        console.log('Team not found in standings for teamId:', teamId);
      }
    } catch (error) {
      console.error('Error fetching team record:', error);
    }
  };

  const fetchCurrentGame = async () => {
    try {
      // Get today's date
      const today = new Date();
      const dateString = today.toISOString().split('T')[0];
      
      console.log('Looking for current game on:', dateString);
      
      // Try to get today's game first
      const todayGames = await SpainServiceEnhanced.getGamesByDate(dateString);
      
      if (todayGames && todayGames.length > 0) {
        const teamGame = todayGames.find(game => 
          game.competitions?.[0]?.competitors?.some(competitor => 
            competitor.team.id === teamId
          )
        );
        
        if (teamGame) {
          console.log('Found game for today:', teamGame.id);
          setCurrentGame(teamGame);
          return;
        }
      }
      
      // If no game today, look for next upcoming game
      const upcomingGames = await SpainServiceEnhanced.getScheduledGames();
      if (upcomingGames && upcomingGames.length > 0) {
        const nextGame = upcomingGames.find(game =>
          game.competitions?.[0]?.competitors?.some(competitor => 
            competitor.team.id === teamId
          )
        );
        
        if (nextGame) {
          console.log('Found upcoming game:', nextGame.id);
          setCurrentGame(nextGame);
        }
      }
    } catch (error) {
      console.error('Error fetching current game:', error);
    }
  };

  const fetchAllMatches = async () => {
    try {
      // Get recent finished games
      const finishedGames = await SpainServiceEnhanced.getFinishedGames();
      const teamFinishedGames = finishedGames.filter(game =>
        game.competitions?.[0]?.competitors?.some(competitor => 
          competitor.team.id === teamId
        )
      ).slice(0, 10); // Get last 10 games
      
      // Get upcoming scheduled games
      const scheduledGames = await SpainServiceEnhanced.getScheduledGames();
      const teamScheduledGames = scheduledGames.filter(game =>
        game.competitions?.[0]?.competitors?.some(competitor => 
          competitor.team.id === teamId
        )
      ).slice(0, 10); // Get next 10 games
      
      setLastMatches(teamFinishedGames);
      setNextMatches(teamScheduledGames);
      
      console.log('Last matches:', teamFinishedGames.length);
      console.log('Next matches:', teamScheduledGames.length);
    } catch (error) {
      console.error('Error fetching all matches:', error);
    }
  };

  const fetchRoster = async () => {
    if (!teamData) return;
    
    setLoadingRoster(true);
    try {
      const currentYear = new Date().getFullYear();
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/teams/${teamId}/roster?season=${currentYear}`
      );
      const data = await response.json();
      
      if (data.athletes && data.athletes.length > 0) {
        setRoster(data.athletes);
      } else {
        // Try previous year if current year has no data
        const prevResponse = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/teams/${teamId}/roster?season=${currentYear - 1}`
        );
        const prevData = await prevResponse.json();
        if (prevData.athletes) {
          setRoster(prevData.athletes);
        }
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
      // For soccer, we'll use standings data as basic stats
      const standingsData = await SpainServiceEnhanced.getStandings();
      
      if (standingsData?.standings?.entries) {
        const teamEntry = standingsData.standings.entries.find(
          entry => entry.team.id === teamId
        );
        
        if (teamEntry) {
          const stats = {};
          teamEntry.stats.forEach(stat => {
            stats[stat.name] = stat.displayValue;
          });
          setTeamStats(stats);
        }
      }
    } catch (error) {
      console.error('Error fetching team stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  // Handle game click navigation
  const handleGamePress = (game) => {
    console.log('Navigating to game:', game.id);
    navigation.navigate('SpainGameDetails', {
      gameId: game.id,
      sport: 'soccer'
    });
  };

  // Check if game is live
  const isGameLive = (game) => {
    if (!game || !game.status) return false;
    const state = game.status.type.state;
    return state === 'in' || state === 'live';
  };

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

  const getTeamLogo = (team) => {
    if (!team) return 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/default.png&h=200&w=200';
    
    // Special cases for teams with specific logo handling
    if (["367", "2950", "111"].includes(team.id)) {
      return team.logos?.find(logo => logo.rel.includes("default"))?.href || 
        `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`;
    }
    
    return team.logos?.find(logo => logo.rel.includes("dark"))?.href || 
      `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`;
  };

  const getTeamColor = (team) => {
    if (!team) return colors.primary;
    
    // Use alternate color if main color is too light/problematic
    const isUsingAlternateColor = ["ffffff", "ffee00", "ffff00", "81f733", "000000", "f7f316", "eef209", "ece83a", "1c31ce", "ffd700"].includes(team.color);
    
    if (isUsingAlternateColor && team.alternateColor) {
      return `#${team.alternateColor}`;
    } else if (team.color) {
      return `#${team.color}`;
    }
    
    return colors.primary;
  };

  const renderTeamHeader = () => {
    if (!teamData) return null;

    const teamColor = getTeamColor(teamData);
    const teamLogo = getTeamLogo(teamData);

    return (
      <View style={[styles.teamHeader, { backgroundColor: theme.surface }]}>
        <Image 
          source={{ uri: teamLogo }}
          style={styles.teamLogo}
          defaultSource={{ uri: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/default.png&h=200&w=200' }}
        />
        <View style={styles.teamInfo}>
          <Text style={[styles.teamName, { color: teamColor }]}>
            {teamData.displayName || teamData.name}
          </Text>
          <Text style={[styles.teamDivision, { color: theme.textSecondary }]}>
            {teamData.standingSummary || 'Spain'}
          </Text>
          
          {teamRecord && (
            <View style={styles.recordContainer}>
              <View style={styles.recordRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.recordValue, { color: teamColor }]}>
                    {teamRecord.wins}-{teamRecord.draws}-{teamRecord.losses}
                  </Text>
                  <Text style={[styles.recordLabel, { color: theme.textSecondary }]}>
                    Record
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 20 }}>
                  <Text style={[styles.recordValue, { color: teamColor }]}>
                    {teamRecord.points}
                  </Text>
                  <Text style={[styles.recordLabel, { color: theme.textSecondary }]}>
                    Points
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderTabButtons = () => {
    const tabs = ['Games', 'Stats', 'Roster'];
    
    return tabs.map((tab) => (
      <TouchableOpacity
        key={tab}
        style={[
          styles.tabButton,
          activeTab === tab && [styles.activeTabButton, { borderBottomColor: colors.primary }]
        ]}
        onPress={() => setActiveTab(tab)}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.tabText,
            { color: activeTab === tab ? colors.primary : theme.textSecondary },
            activeTab === tab && styles.activeTabText
          ]}
        >
          {tab}
        </Text>
      </TouchableOpacity>
    ));
  };

  const renderCurrentGame = () => {
    if (!currentGame) {
      return (
        <View style={styles.matchesSection}>
          <Text style={[styles.gameSectionTitle, { color: colors.primary }]}>Current Game</Text>
          <View style={[styles.noGameContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.noGameText, { color: theme.textSecondary }]}>No game scheduled today</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.matchesSection}>
        <Text style={[styles.gameSectionTitle, { color: colors.primary }]}>
          {isGameLive(currentGame) ? 'Live Game' : 'Current Game'}
        </Text>
        {renderMatchCard(currentGame)}
      </View>
    );
  };

  const renderMatchCard = (game) => {
    if (!game?.competitions?.[0]) return null;

    const competition = game.competitions[0];
    const competitors = competition.competitors || [];
    const homeTeam = competitors.find(c => c.homeAway === "home");
    const awayTeam = competitors.find(c => c.homeAway === "away");

    if (!homeTeam || !awayTeam) return null;

    const isHomeTeam = homeTeam.team.id === teamId;
    const opponent = isHomeTeam ? awayTeam : homeTeam;
    const teamScore = isHomeTeam ? homeTeam.score : awayTeam.score;
    const opponentScore = isHomeTeam ? awayTeam.score : homeTeam.score;

    const gameDate = new Date(game.date);
    const isCompleted = game.status.type.state === 'post';
    const isLive = isGameLive(game);

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
      if (isLive) {
        return 'Live';
      }
      const status = game.status.type.description;
      if (status === 'Scheduled') {
        return formatGameDate(gameDate);
      }
      return status;
    };

    const getGameTime = () => {
      if (isCompleted) {
        return `${formatGameDate(gameDate)} - ${formatGameTime(gameDate)}`;
      }
      return formatGameTime(gameDate);
    };

    // Determine winning/losing team for styling
    const teamWon = isCompleted && parseInt(teamScore || 0) > parseInt(opponentScore || 0);
    const teamLost = isCompleted && parseInt(teamScore || 0) < parseInt(opponentScore || 0);

    const getTeamNameColor = (isTeam) => {
      if (!isCompleted) return theme.text;
      if (isTeam) {
        return teamLost ? '#999' : theme.text;
      } else {
        return teamWon ? '#999' : theme.text;
      }
    };

    const getScoreColor = (isTeam) => {
      if (!isCompleted) return theme.text;
      if (isTeam) {
        return teamWon ? colors.primary : '#999';
      } else {
        return teamWon ? '#999' : colors.primary;
      }
    };

    const getTeamNameStyle = (isTeam) => {
      if (!isCompleted) return styles.gameTeamName;
      if (isTeam) {
        return teamLost ? styles.losingTeamName : styles.gameTeamName;
      } else {
        return teamWon ? styles.losingTeamName : styles.gameTeamName;
      }
    };

    const getTeamScoreStyle = () => {
      return styles.gameTeamScore;
    };

    return (
      <TouchableOpacity 
        style={[styles.gameCard, { backgroundColor: theme.surface }]}
        onPress={() => handleGamePress(game)}
        activeOpacity={0.7}
      >
        <View style={styles.gameTeams}>
          <View style={styles.teamContainer}>
            <View style={styles.teamLogoContainer}>
              <Image 
                source={{ uri: getTeamLogo(teamData) }}
                style={styles.gameTeamLogo}
                defaultSource={{ uri: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/default.png&h=200&w=200' }}
              />
              {isCompleted && teamScore !== undefined && (
                <Text style={[getTeamScoreStyle(), { color: getScoreColor(true) }]}>{teamScore}</Text>
              )}
            </View>
            <Text style={[getTeamNameStyle(true), { color: getTeamNameColor(true) }]}>
              {teamData.abbreviation || teamData.shortDisplayName}
            </Text>
          </View>
          
          <View style={styles.gameInfo}>
            <Text style={[styles.gameStatus, { color: colors.primary }]}>{getGameStatus()}</Text>
            <Text style={[styles.gameTime, { color: theme.textSecondary }]}>{getGameTime()}</Text>
            <Text style={[styles.versus, { color: theme.textSecondary }]}>vs</Text>
          </View>
          
          <View style={styles.teamContainer}>
            <View style={styles.teamLogoContainer}>
              {isCompleted && opponentScore !== undefined && (
                <Text style={[getTeamScoreStyle(), { color: getScoreColor(false) }]}>{opponentScore}</Text>
              )}
              <Image 
                source={{ uri: getTeamLogo(opponent.team) }}
                style={styles.gameTeamLogo}
                defaultSource={{ uri: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/default.png&h=200&w=200' }}
              />
            </View>
            <Text style={[getTeamNameStyle(false), { color: getTeamNameColor(false) }]}>
              {opponent.team.abbreviation || opponent.team.shortDisplayName}
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
          <Text style={[styles.contentText, { color: theme.textSecondary }]}>Loading team statistics...</Text>
        </View>
      );
    }

    if (!teamStats) {
      return (
        <View style={styles.statsLoadingContainer}>
          <Text style={[styles.contentText, { color: theme.textSecondary }]}>Team statistics not available</Text>
        </View>
      );
    }

    const renderStatBox = (label, value, key) => (
      <View key={key} style={[styles.statBox, { backgroundColor: theme.surface }]}>
        <Text style={[styles.statBoxValue, { color: colors.primary }]}>{value}</Text>
        <Text style={[styles.statBoxLabel, { color: theme.textSecondary }]}>{label}</Text>
      </View>
    );

    const renderStatsGrid = (stats, title, statDefinitions) => {
      if (!stats) return null;

      const statBoxes = statDefinitions.map(({ key, label }) => {
        const value = stats[key];
        return renderStatBox(label, value || '--', `${title}-${key}`);
      });

      // Group stats into rows of 3
      const rows = [];
      for (let i = 0; i < statBoxes.length; i += 3) {
        rows.push(statBoxes.slice(i, i + 3));
      }

      return (
        <View style={styles.statsSection}>
          <Text style={[styles.statsSectionTitle, { color: theme.text }]}>{title}</Text>
          {rows.map((row, rowIndex) => (
            <View key={`${title}-row-${rowIndex}`} style={styles.statsRow}>
              {row}
            </View>
          ))}
        </View>
      );
    };

    // Define soccer statistics to display
    const teamStatDefinitions = [
      { key: 'wins', label: 'Wins' },
      { key: 'losses', label: 'Losses' },
      { key: 'ties', label: 'Draws' },
      { key: 'points', label: 'Points' },
      { key: 'pointsFor', label: 'Goals For' },
      { key: 'pointsAgainst', label: 'Goals Against' },
      { key: 'differential', label: 'Goal Diff' },
      { key: 'gamesPlayed', label: 'Games' },
      { key: 'rank', label: 'Position' }
    ];

    return (
      <ScrollView 
        style={[styles.statsContainer, { backgroundColor: theme.background }]} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.statsContent}
      >
        {renderStatsGrid(teamStats, 'Team Statistics', teamStatDefinitions)}
      </ScrollView>
    );
  };

  const renderRosterContent = () => {
    if (loadingRoster) {
      return (
        <View style={styles.matchesSection}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.contentText, { color: theme.textSecondary }]}>Loading roster...</Text>
        </View>
      );
    }

    if (!roster || roster.length === 0) {
      return (
        <View style={styles.matchesSection}>
          <Text style={[styles.contentText, { color: theme.textSecondary }]}>Roster data not available</Text>
        </View>
      );
    }

    // Group players by position for soccer
    const goalkeepers = roster.filter(player => {
      const pos = player.athlete?.position?.abbreviation || player.position?.abbreviation || '';
      return pos === 'GK' || pos === 'G';
    });
    
    const defenders = roster.filter(player => {
      const pos = player.athlete?.position?.abbreviation || player.position?.abbreviation || '';
      return ['CB', 'LB', 'RB', 'LWB', 'RWB', 'D'].includes(pos);
    });
    
    const midfielders = roster.filter(player => {
      const pos = player.athlete?.position?.abbreviation || player.position?.abbreviation || '';
      return ['CM', 'CDM', 'CAM', 'LM', 'RM', 'M'].includes(pos);
    });
    
    const forwards = roster.filter(player => {
      const pos = player.athlete?.position?.abbreviation || player.position?.abbreviation || '';
      return ['ST', 'CF', 'LW', 'RW', 'F'].includes(pos);
    });
    
    const others = roster.filter(player => {
      const pos = player.athlete?.position?.abbreviation || player.position?.abbreviation || '';
      return !['GK', 'G', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'D', 'CM', 'CDM', 'CAM', 'LM', 'RM', 'M', 'ST', 'CF', 'LW', 'RW', 'F'].includes(pos);
    });

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
            <Text style={[styles.rosterSectionTitle, { color: theme.text }]}>
              {title} ({players.length})
            </Text>
            <Text style={[styles.rosterSectionArrow, { color: theme.text }]}>
              {isCollapsed ? '▶' : '▼'}
            </Text>
          </TouchableOpacity>
          {!isCollapsed && (
            <View style={styles.rosterTableContainer}>
              <View style={[styles.rosterTableHeader, { backgroundColor: theme.surface }]}>
                <Text style={[styles.rosterTableHeaderPlayer, { color: theme.text }]}>Player</Text>
                <Text style={[styles.rosterTableHeaderStatus, { color: theme.text }]}>Position</Text>
              </View>
              {players.map((playerData) => {
                const player = playerData.athlete || playerData;
                return (
                  <TouchableOpacity 
                    key={player.id} 
                    style={[styles.rosterTableRow, { borderBottomColor: theme.border, backgroundColor: theme.surfaceSecondary }]}
                    onPress={() => {
                      console.log('Player selected:', player.id, player.fullName || player.displayName);
                      // Navigation to player details can be added here
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rosterTablePlayerCell}>
                      <View style={styles.rosterPlayerRow}>
                        <Image 
                          source={{ 
                            uri: player.headshot?.href || `https://a.espncdn.com/combiner/i?img=/i/headshots/soccer/players/full/${player.id}.png&w=350&h=254` 
                          }}
                          style={styles.playerHeadshot}
                          defaultSource={{ uri: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=350&h=254' }}
                        />
                        <View style={styles.rosterPlayerInfo}>
                          <Text style={[styles.rosterTablePlayerName, { color: theme.text }]}>
                            {player.fullName || player.displayName || player.name}
                          </Text>
                          <Text style={[styles.rosterTablePlayerDetails, { color: theme.textTertiary }]}>
                            <Text style={[styles.rosterTablePlayerNumber, { color: theme.textTertiary }]}>
                              #{player.jersey || player.number || '--'}
                            </Text>
                            {' • '}
                            Age {player.age || 'N/A'}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.rosterTableStatusCell}>
                      <Text style={[styles.rosterTableStatusText, { color: theme.text }]}>
                        {player.position?.abbreviation || player.position?.name || 'N/A'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      );
    };

    return (
      <ScrollView style={[styles.rosterContainer, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
        {renderPlayerSection('Goalkeepers', goalkeepers, 'goalkeepers')}
        {renderPlayerSection('Defenders', defenders, 'defenders')}
        {renderPlayerSection('Midfielders', midfielders, 'midfielders')}
        {renderPlayerSection('Forwards', forwards, 'forwards')}
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
                <Text style={[styles.gameSectionTitle, { color: colors.primary }]}>Last Matches</Text>
                <Text style={[styles.collapseArrow, { color: colors.primary }]}>
                  {lastMatchesCollapsed ? '▶' : '▼'}
                </Text>
              </TouchableOpacity>
              
              {lastMatches.length > 0 ? (
                <View>
                  {(lastMatchesCollapsed ? lastMatches.slice(0, 1) : lastMatches).map((game, index) => (
                    <View key={`last-${game.id}-${index}`}>{renderMatchCard(game)}</View>
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
                    <View key={`next-${game.id}-${index}`}>{renderMatchCard(game)}</View>
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
    marginLeft: -15,
  },
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    width: 150,
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
  losingTeamName: {
    color: '#999',
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
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: 15,
    marginHorizontal: 5,
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
});

export default SpainTeamPageScreen;