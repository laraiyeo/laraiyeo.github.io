import React, { useState, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  TouchableOpacity,
  Modal,
  Animated
} from 'react-native';
import { NFLService } from '../../services/NFLService';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';

// Component to display play probability like scoreboard copy card
const PlayProbability = ({ probabilityRef, driveTeam, homeTeam, awayTeam }) => {
  const [probabilityData, setProbabilityData] = useState(null);
  const { theme } = useTheme();

  useEffect(() => {
    const fetchProbability = async () => {
      try {
        const response = await fetch(NFLService.convertToHttps(probabilityRef));
        const data = await response.json();
        
        const homeWinPct = data.homeWinPercentage || 0;
        const awayWinPct = data.awayWinPercentage || 0;
        
        // Determine which team's probability to show based on drive team
        let displayProbability = '';
        let teamLogo = '';
        
        // Check if drive team matches home or away team
        if (driveTeam?.id === homeTeam?.id) {
          // Drive team is home team
          displayProbability = `${(homeWinPct * 100).toFixed(1)}%`;
          teamLogo = homeTeam?.logo;
        } else if (driveTeam?.id === awayTeam?.id) {
          // Drive team is away team  
          displayProbability = `${(awayWinPct * 100).toFixed(1)}%`;
          teamLogo = awayTeam?.logo;
        } else {
          // Fallback to higher percentage
          if (homeWinPct > awayWinPct) {
            displayProbability = `${(homeWinPct * 100).toFixed(1)}%`;
            teamLogo = homeTeam?.logo;
          } else {
            displayProbability = `${(awayWinPct * 100).toFixed(1)}%`;
            teamLogo = awayTeam?.logo;
          }
        }
        
        setProbabilityData({ displayProbability, teamLogo });
      } catch (error) {
        console.error('Error fetching probability data:', error);
      }
    };

    if (probabilityRef) {
      fetchProbability();
    }
  }, [probabilityRef, driveTeam, homeTeam, awayTeam]);

  if (!probabilityData) return null;

  return (
    <View style={styles.playProbability}>
      <Text allowFontScaling={false} style={[styles.playProbabilityText, { color: theme.textSecondary }]}>
        W {probabilityData.displayProbability}
      </Text>
      {probabilityData.teamLogo && (
        <Image 
          source={{ uri: NFLService.convertToHttps(probabilityData.teamLogo) }}
          style={styles.playProbabilityLogo}
        />
      )}
    </View>
  );
};

const GameDetailsScreen = ({ route }) => {
  const { gameId, sport } = route.params;
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const { isFavorite } = useFavorites();
  const [gameDetails, setGameDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('stats'); // Default to stats tab
  const [drivesData, setDrivesData] = useState(null);
  const [loadingDrives, setLoadingDrives] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerModalVisible, setPlayerModalVisible] = useState(false);
  const [playerStats, setPlayerStats] = useState(null);
  const [loadingPlayerStats, setLoadingPlayerStats] = useState(false);
  const [gameSituation, setGameSituation] = useState(null);
  const [formattedGameData, setFormattedGameData] = useState(null); // Formatted like scoreboard
  const [selectedDrive, setSelectedDrive] = useState(null);
  const [driveModalVisible, setDriveModalVisible] = useState(false);
  const [updateInterval, setUpdateInterval] = useState(null);
  const [lastUpdateHash, setLastUpdateHash] = useState('');
  const [lastSituationHash, setLastSituationHash] = useState('');
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [awayRosterData, setAwayRosterData] = useState(null);
  const [homeRosterData, setHomeRosterData] = useState(null);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const stickyHeaderOpacity = useRef(new Animated.Value(0)).current;

  // Helper function to get NFL team abbreviation from ESPN team data
  const getNFLTeamAbbreviation = (espnTeam) => {
    // First try direct abbreviation if available
    if (espnTeam?.abbreviation) {
      return espnTeam.abbreviation;
    }
    
    // ESPN team ID to abbreviation mapping
    const teamMapping = {
      '2': 'BUF', '15': 'MIA', '17': 'NE', '20': 'NYJ',
      '33': 'BAL', '4': 'CIN', '5': 'CLE', '23': 'PIT',
      '34': 'HOU', '11': 'IND', '30': 'JAX', '10': 'TEN',
      '7': 'DEN', '12': 'KC', '13': 'LV', '24': 'LAC',
      '6': 'DAL', '19': 'NYG', '21': 'PHI', '28': 'WAS',
      '3': 'CHI', '8': 'DET', '9': 'GB', '16': 'MIN',
      '1': 'ATL', '29': 'CAR', '18': 'NO', '27': 'TB',
      '22': 'ARI', '14': 'LAR', '25': 'SF', '26': 'SEA'
    };
    
    const abbr = teamMapping[espnTeam?.id?.toString()];
    if (abbr) {
      return abbr;
    }
    
    console.warn('No NFL abbreviation mapping found for team:', espnTeam?.id);
    return null;
  };
  
  // Helper function to get NFL team ID for favorites
  const getNFLTeamId = (espnTeam) => {
    // ESPN team abbreviations to NFL team IDs mapping
    const teamMapping = {
      'BUF': '2', 'MIA': '15', 'NE': '17', 'NYJ': '20',
      'BAL': '33', 'CIN': '4', 'CLE': '5', 'PIT': '23',
      'HOU': '34', 'IND': '11', 'JAX': '30', 'TEN': '10',
      'DEN': '7', 'KC': '12', 'LV': '13', 'LAC': '24',
      'DAL': '6', 'NYG': '19', 'PHI': '21', 'WAS': '28',
      'CHI': '3', 'DET': '8', 'GB': '9', 'MIN': '16',
      'ATL': '1', 'CAR': '29', 'NO': '18', 'TB': '27',
      'ARI': '22', 'LAR': '14', 'SF': '25', 'SEA': '26'
    };

    console.log('Team abbreviation:', espnTeam.abbreviation, 'ESPN ID:', espnTeam.id);
    
    let nflId = teamMapping[espnTeam.abbreviation];
    
    if (!nflId) {
      console.warn('No NFL ID mapping found for team:', espnTeam.abbreviation, 'ESPN ID:', espnTeam.id, 'Using ESPN ID as fallback');
      return espnTeam.id;
    }
    
    console.log('Final NFL ID:', nflId);
    return nflId;
  };
  
  // TeamLogoImage component with fallback support  
  const TeamLogoImage = React.memo(({ team, style, isLosingTeam = false }) => {
    const [logoSource, setLogoSource] = useState(() => {
      const teamAbbr = getNFLTeamAbbreviation(team);
      if (teamAbbr) {
        return { uri: getTeamLogoUrl('nfl', teamAbbr) };
      } else {
        return require('../../../assets/nfl.png');
      }
    });
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
      const teamAbbr = getNFLTeamAbbreviation(team);
      if (teamAbbr) {
        setLogoSource({ uri: getTeamLogoUrl('nfl', teamAbbr) });
        setRetryCount(0);
      } else {
        setLogoSource(require('../../../assets/nfl.png'));
      }
    }, [team]);

    const handleError = () => {
      if (retryCount === 0) {
        const teamAbbr = getNFLTeamAbbreviation(team);
        if (teamAbbr) {
          // Try alternative URL format
          setLogoSource({ uri: `https://a.espncdn.com/i/teamlogos/nfl/500/${teamAbbr}.png` });
          setRetryCount(1);
        } else {
          setLogoSource(require('../../../assets/nfl.png'));
        }
      } else {
        // Final fallback
        setLogoSource(require('../../../assets/nfl.png'));
      }
    };

    return (
      <Image
        style={[style, isLosingTeam && { opacity: 0.5 }]}
        source={logoSource}
        onError={handleError}
        resizeMode="contain"
      />
    );
  });

  useEffect(() => {
    loadGameDetails();
    
    // Load drives data immediately in parallel
    loadDrives();
    
    // Also load game situation data in parallel for live games
    loadGameSituation();
  }, [gameId]);

  // Clear data when gameId changes (different game)
  useEffect(() => {
    setDrivesData(null);
    setFormattedGameData(null);
    setGameSituation(null);
    setLastUpdateHash('');
    setLastSituationHash('');
  }, [gameId]);

  // Reload data when the screen comes into focus (useful when navigating back)
  useFocusEffect(
    React.useCallback(() => {
      loadGameDetails();
      
      return () => {
        // Cleanup if needed
      };
    }, [gameId])
  );

  // Effect to load roster data for scheduled games
  useEffect(() => {
    if (gameDetails && !homeRosterData && !awayRosterData) {
      const competition = gameDetails.header?.competitions?.[0] || gameDetails.competitions?.[0];
      const status = competition?.status || gameDetails.header?.status;
      const statusDesc = status?.type?.description?.toLowerCase();
      const isScheduled = statusDesc?.includes('scheduled');
      if (isScheduled) {
        loadRosterData(false); // Show loading for initial load
      }
    }
  }, [gameDetails, homeRosterData, awayRosterData]);

  // Set up live updates when gameDetails is loaded
  useEffect(() => {
    if (!gameDetails) return;

    const competition = gameDetails.header?.competitions?.[0] || gameDetails.competitions?.[0];
    const status = competition?.status || gameDetails.header?.status;
    const isLiveGame = !status?.type?.completed;
    
    if (isLiveGame) {
      const interval = setInterval(() => {
        const statusDesc = status?.type?.description?.toLowerCase();
        const isScheduled = statusDesc?.includes('scheduled');
        
        loadGameDetails(true); // Silent update - this will update all game data including stats
        
        // Always update drives for live games since yard line graphic depends on drive data
        if (!isScheduled) {
          loadDrives(true); // Silent update drives for yard line graphic
        }
        
        // Only load game situation for non-scheduled games
        if (!isScheduled) {
          loadGameSituation(true); // Silent update
        }
      }, 2000);
      
      setUpdateInterval(interval);
      
      return () => {
        clearInterval(interval);
      };
    }
  }, [gameDetails, activeTab, drivesData]); // Include all dependencies

  useEffect(() => {
    if (gameDetails) {
      const competition = gameDetails.header?.competitions?.[0] || gameDetails.competitions?.[0];
      const status = competition?.status || gameDetails.header?.status;
      const statusDesc = status?.type?.description?.toLowerCase();
      const isScheduled = statusDesc?.includes('scheduled');
      
      // If we're on drives tab but game is scheduled, switch to stats tab
      if (activeTab === 'drives' && isScheduled) {
        setActiveTab('stats');
      }
      
      if (activeTab === 'drives' && !isScheduled) {
        loadDrives();
      }
    }
  }, [activeTab, gameId, gameDetails]);

  // Update selected drive when drives data changes and modal is visible
  useEffect(() => {
    if (driveModalVisible && selectedDrive && drivesData) {
      // Find the updated drive that matches the selected drive ID
      const updatedDrive = drivesData.find(drive => drive.id === selectedDrive.id);
      if (updatedDrive) {
        setSelectedDrive(updatedDrive);
      }
    }
  }, [drivesData, driveModalVisible, selectedDrive?.id]);

  const loadGameSituation = async (silentUpdate = false) => {
    try {
      // Extract game date from gameDetails to avoid searching multiple dates
      let gameDate = null;
      if (gameDetails) {
        // Try to get date from multiple possible locations in the response
        const competition = gameDetails.header?.competitions?.[0] || gameDetails.competitions?.[0];
        if (competition?.date) {
          gameDate = new Date(competition.date);
        } else if (gameDetails.header?.events?.[0]?.date) {
          gameDate = new Date(gameDetails.header.events[0].date);
        } else if (gameDetails.date) {
          gameDate = new Date(gameDetails.date);
        }
      }
      
      const situation = await NFLService.getGameSituation(gameId, gameDate);
      
      // Create hash for change detection
      const currentSituationHash = JSON.stringify({
        down: situation?.down,
        distance: situation?.distance,
        yardLine: situation?.yardLine,
        team: situation?.possession,
        quarter: situation?.status?.period,
        clock: situation?.status?.displayClock
      });

      // Only update state if data has changed
      if (currentSituationHash !== lastSituationHash || !silentUpdate) {
        setGameSituation(situation);
        setLastSituationHash(currentSituationHash);
        
        // Debug logging for possession data
        console.log('=== GAME SITUATION LOADED ===');
        console.log('Full situation data:', situation);
        console.log('Direct possession property:', situation?.possession);
        console.log('Down:', situation?.down);
        console.log('Distance:', situation?.distance);
        console.log('Yard Line:', situation?.yardLine);
        console.log('============================');
      }
    } catch (error) {
      if (!silentUpdate) {
        console.error('Error loading game situation:', error);
      }
    }
  };

  const loadGameDetails = async (silentUpdate = false) => {
    try {
      if (!silentUpdate) {
        setLoading(true);
      }
      const details = await NFLService.getGameDetails(gameId);
      
      // Get the competition data first for both formatting and hash calculation
      const competition = details.header?.competitions?.[0] || details.competitions?.[0];
      const status = competition?.status || details.header?.status;
      
      // Also create formatted game data like scoreboard screen for possession logic
      const formattedGame = NFLService.formatGameForMobile({ 
        id: gameId, 
        competitions: [competition],
        status: status
      });
      
      // Create hash for change detection
      const homeTeam = competition?.competitors?.find(c => c.homeAway === 'home');
      const awayTeam = competition?.competitors?.find(c => c.homeAway === 'away');
      
      const currentHash = JSON.stringify({
        homeScore: homeTeam?.score,
        awayScore: awayTeam?.score,
        status: status?.type?.description,
        clock: status?.displayClock,
        period: status?.period,
        down: status?.down,
        distance: status?.distance,
        yardLine: status?.yardLine
      });

      // Only update state if data has changed
      if (currentHash !== lastUpdateHash || !silentUpdate) {
        setGameDetails(details);
        setFormattedGameData(formattedGame);
        setLastUpdateHash(currentHash);
      } else {
      }
    } catch (error) {
      if (!silentUpdate) {
        Alert.alert('Error', 'Failed to load game details');
      }
      console.error('Error loading game details:', error);
    } finally {
      if (!silentUpdate) {
        setLoading(false);
      }
    }
  };

  const loadRosterData = async (silentUpdate = false) => {
    try {
      if (!silentUpdate) {
        setLoadingRoster(true);
      }
      const competition = gameDetails.header?.competitions?.[0] || gameDetails.competitions?.[0];
      const homeTeam = competition?.competitors?.find(c => c.homeAway === 'home');
      const awayTeam = competition?.competitors?.find(c => c.homeAway === 'away');

      if (homeTeam?.team?.id) {
        const homeResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${homeTeam.team.id}/roster`);
        const homeData = await homeResponse.json();
        setHomeRosterData(homeData);
      }

      if (awayTeam?.team?.id) {
        const awayResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${awayTeam.team.id}/roster`);
        const awayData = await awayResponse.json();
        setAwayRosterData(awayData);
      }
    } catch (error) {
      console.error('Error loading roster data:', error);
    } finally {
      if (!silentUpdate) {
        setLoadingRoster(false);
      }
    }
  };

  const loadDrives = async (silentUpdate = false) => {
    try {
      if (!silentUpdate) {
        setLoadingDrives(true);
      }
      const drives = await NFLService.getDrivesComplete(gameId);
      
      // For silent updates, only update if there are actually new drives or changes
      if (silentUpdate && drivesData) {
        // Compare drive count and latest drive ID to see if update is needed
        const currentDriveCount = drivesData.length;
        const newDriveCount = drives.length;
        
        // Only update if there are new drives or if the latest drive has a different result
        if (newDriveCount > currentDriveCount || 
            (drives.length > 0 && drivesData.length > 0 && 
             (drives[drives.length - 1].id !== drivesData[drivesData.length - 1].id ||
              drives[drives.length - 1].displayResult !== drivesData[drivesData.length - 1].displayResult))) {
          setDrivesData(drives);
        }
      } else {
        setDrivesData(drives);
      }
    } catch (error) {
      if (!silentUpdate) {
        console.error('Error loading drives:', error);
      }
    } finally {
      if (!silentUpdate) {
        setLoadingDrives(false);
      }
    }
  };

  const handlePlayerPress = async (player, statCategory, teamInfo = null) => {
    setSelectedPlayer({
      ...player,
      statCategory: statCategory.text || statCategory.name,
      allStats: statCategory,
      team: teamInfo // Add team info to selectedPlayer
    });
    setPlayerModalVisible(true);
    setLoadingPlayerStats(true);

    try {
      // Fetch game-specific player stats using ESPN box score API
      const gameStats = await NFLService.getPlayerGameStats(gameId, player.id);
      if (gameStats && gameStats.splits && gameStats.splits.categories) {
        setPlayerStats(gameStats);
      } else {
        // Fallback to season stats if game stats not available
        const seasonStats = await NFLService.getPlayerStats(player.id);
        
        if (seasonStats && seasonStats.splits && seasonStats.splits.categories) {
          setPlayerStats(seasonStats);
        } else {
          setPlayerStats(null);
        }
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

  const handleDrivePress = async (drive) => {
    console.log('Drive pressed:', drive.id, 'hasPlaysData:', drive.hasPlaysData, 'plays count:', drive.plays?.length || 0);
    console.log('Drive plays reference:', drive.plays?.$ref || drive.plays?.href || 'None');
    setSelectedDrive(drive);
    setDriveModalVisible(true);
    
    // Check if we need to load plays on demand
    // Load plays if: no hasPlaysData flag OR no plays array OR empty plays array
    const needsPlaysData = !drive.hasPlaysData || !drive.plays || drive.plays.length === 0;
    const hasPlaysRef = drive.plays?.$ref || drive.plays?.href;
    
    if (needsPlaysData && hasPlaysRef) {
      try {
        console.log('Loading plays for drive on demand:', drive.id);
        const playsData = await NFLService.getDrivePlays(drive);
        
        // Update the drive with the loaded plays data
        const updatedDrive = {
          ...drive,
          plays: playsData,
          hasPlaysData: true
        };
        
        console.log('Updated drive with', playsData.length, 'plays');
        
        // Update the selected drive with plays data
        setSelectedDrive(updatedDrive);
        
        // Also update the drive in the drives list for future reference
        if (drivesData) {
          const updatedDrivesData = drivesData.map(d => 
            d.id === drive.id ? updatedDrive : d
          );
          setDrivesData(updatedDrivesData);
        }
      } catch (error) {
        console.error('Error loading plays for drive:', error);
        // Continue showing the modal even if plays failed to load
      }
    } else if (!hasPlaysRef) {
      console.log('Drive has no plays reference, no plays available');
    } else {
      console.log('Drive already has plays data');
    }
  };

  const closeDriveModal = () => {
    setDriveModalVisible(false);
    setSelectedDrive(null);
  };

  // Helper function to create drive summary text
  const getDriveSummary = (drive) => {
    const parts = [];
    
    if (drive.plays && drive.plays.length > 0) {
      parts.push(`${drive.plays.length} play${drive.plays.length === 1 ? '' : 's'}`);
    }
    
    if (drive.yards) {
      parts.push(`${drive.yards} yard${Math.abs(drive.yards) === 1 ? '' : 's'}`);
    }
    
    if (drive.timeElapsed && drive.timeElapsed.displayValue) {
      parts.push(drive.timeElapsed.displayValue);
    }
    
    return parts.length > 0 ? parts.join(', ') : 'Drive information';
  };

  // Helper function to render drive yard line graphic
  const renderDriveYardLine = (drive, awayTeam, homeTeam) => {
    if (!drive.start) return null;

    // Get team color
    const teamColor = drive.team?.color ? `#${drive.team.color}` : '#666';
    
    // Determine positions based on drive status (following scoreboard.js logic)
    let startYard, currentYard, driveIsInProgress = false;
    let currentText = '';
    
    startYard = drive.start.yardLine || 0;
    const driveEndYard = drive.end?.yardLine;
    const hasDriveEnded = driveEndYard !== undefined && driveEndYard !== null;
    
    if (hasDriveEnded) {
      // Completed drive
      currentYard = driveEndYard;
      currentText = drive.end?.text || `${driveEndYard}`;
    } else {
      // Drive in progress - find most recent play position
      driveIsInProgress = true;
      currentYard = startYard; // Default to start if no plays
      
      if (drive.plays && drive.plays.length > 0) {
        // Sort plays by sequence to get most recent
        const sortedPlays = [...drive.plays].sort((a, b) => {
          const seqA = parseInt(a.sequenceNumber) || 0;
          const seqB = parseInt(b.sequenceNumber) || 0;
          return seqB - seqA; // Most recent first
        });
        
        const mostRecentPlay = sortedPlays[0];
        if (mostRecentPlay.end?.yardLine !== undefined) {
          currentYard = mostRecentPlay.end.yardLine;
          currentText = mostRecentPlay.end.text || `${currentYard}`;
        }
      }
      
      // Fallback to game situation if available
      if (currentYard === startYard && gameSituation?.possession?.yardLine) {
        currentYard = gameSituation.possession.yardLine;
        currentText = `${currentYard}`;
      }
    }
    
    // Calculate positions (0-100 scale, flip for proper direction)
    const startPosition = Math.max(0, Math.min(100, 100 - startYard));
    const currentPosition = Math.max(0, Math.min(100, 100 - currentYard));
    
    // Calculate fill area for continuous gradient
    const fillStart = Math.min(startPosition, currentPosition);
    const fillEnd = Math.max(startPosition, currentPosition);
    const fillWidth = fillEnd - fillStart;
    
    return (
      <View style={styles.driveYardLineContainer}>
        {/* Drive Progress Bar */}
        <View style={styles.driveProgressBar}>
          {/* Base bar */}
          <View style={[styles.driveBaseBar, { backgroundColor: theme.border, borderColor: theme.border }]} />
          
          {/* Progress fill with solid team color */}
          <View 
            style={[
              styles.driveProgressFill,
              {
                left: `${fillStart}%`,
                width: `${fillWidth}%`,
                backgroundColor: teamColor,
                opacity: 0.8,
              }
            ]}
          />
          
          {/* Start marker - centered */}
          <View 
            style={[
              styles.driveMarker,
              styles.driveStartMarker,
              { 
                left: `${startPosition}%`, 
                borderColor: teamColor,
                transform: [{ translateX: -10 }] // Center the marker,
              }
            ]}
          >
            <Text allowFontScaling={false} style={[styles.driveMarkerText, { color: teamColor }]}>S</Text>
          </View>
          
          {/* Current/End marker - centered */}
          <View 
            style={[
              styles.driveMarker,
              driveIsInProgress ? styles.driveCurrentMarker : styles.driveEndMarker,
              { 
                left: `${currentPosition}%`, 
                borderColor: driveIsInProgress ? colors.primary : teamColor, 
                backgroundColor: driveIsInProgress ? colors.secondary : teamColor,
                transform: [{ translateX: -10 }] // Center the marker
              }
            ]}
          >
            <Text allowFontScaling={false} style={styles.driveMarkerText}>{driveIsInProgress ? 'C' : 'E'}</Text>
          </View>
        </View>
        
        {/* Yard line labels */}
        <View style={styles.driveYardLabels}>
          <Text allowFontScaling={false} style={[styles.driveYardLabel, { color: theme.textTertiary }]}>0</Text>
          <Text allowFontScaling={false} style={[styles.driveYardLabel, { color: theme.textTertiary }]}>50</Text>
          <Text allowFontScaling={false} style={[styles.driveYardLabel, { color: theme.textTertiary }]}>0</Text>
        </View>
      </View>
    );
  };

  // Render position-specific stats like team-page.js
  const renderPositionSpecificStats = (playerStats, position) => {
    if (!playerStats?.splits?.categories) {
      return <Text allowFontScaling={false} style={styles.noStatsText}>No detailed statistics available</Text>;
    }

    // Get team info for header
    const team = selectedPlayer?.team?.team; // Access the nested team object
    const teamLogo = team?.logos?.[0]?.href || team?.logo;
    const teamName = team?.displayName || team?.name || team?.abbreviation;

    // Convert categories to a lookup object
    const statsLookup = {};
    playerStats.splits.categories.forEach(category => {
      statsLookup[category.name] = category.stats || [];
    });

    const passingStats = statsLookup.passing || [];
    const rushingStats = statsLookup.rushing || [];
    const receivingStats = statsLookup.receiving || [];
    const defensiveStats = statsLookup.defensive || [];
    const interceptionStats = statsLookup.interceptions || [];
    const kickingStats = statsLookup.kicking || [];
    const puntingStats = statsLookup.punting || [];

    const renderStatRow = (stats, labels) => {
      // Group stats into rows of 3
      const rows = [];
      for (let i = 0; i < Math.max(stats.length, labels.length); i += 3) {
        const rowStats = stats.slice(i, i + 3);
        const rowLabels = labels.slice(i, i + 3);
        rows.push({ stats: rowStats, labels: rowLabels });
      }

      return rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.statsRow}>
          {row.labels.map((label, index) => {
            // Handle both string/number values and objects with displayValue property
            const statValue = row.stats[index];
            let displayValue = '0';
            
            if (statValue !== undefined && statValue !== null) {
              if (typeof statValue === 'object' && statValue.displayValue) {
                displayValue = statValue.displayValue;
              } else if (typeof statValue === 'object' && statValue.value !== undefined) {
                displayValue = statValue.value.toString();
              } else {
                displayValue = statValue.toString();
              }
            }
            
            return (
              <View key={`${rowIndex}-${index}`} style={styles.statItem}>
                <Text allowFontScaling={false} style={[styles.statValue, { color: theme.text }]}>{displayValue}</Text>
                <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
              </View>
            );
          })}
        </View>
      ));
    };

    const renderCategoryHeader = (categoryTitle) => (
      <View style={[styles.statCategoryHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        {team && (
          <TeamLogoImage 
            team={team}
            style={styles.teamHeaderLogo}
          />
        )}
        <Text allowFontScaling={false} style={[
          styles.teamHeaderName, 
          { color: theme.text }
        ]}>
          {teamName}
        </Text>
      </View>
    );

    // Helper function to format category names properly
    const formatCategoryName = (name) => {
      if (!name) return '';
      
      // Handle compound words like puntReturn, kickReturn, etc.
      const formatted = name
        // Split on capital letters for camelCase
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        // Capitalize first letter of each word
        .replace(/\b\w/g, l => l.toUpperCase());
      
      return formatted;
    };

    // Debug: log the position to see what we're getting

    if (['QB'].includes(position)) {
      // Handle QB stats - check if we have 8 stats and skip the 7th if so
      let qbLabels = ['C/ATT', 'PYDS', 'PAVG', 'PTD', 'INT', 'S-YDSLST', 'RTG'];
      let qbStats = passingStats;

      if (passingStats.length === 8) {
        // Skip the 7th stat (S-YDSLST) and show 1-6 + 8 (RTG)
        qbStats = [
          passingStats[0], // C/ATT
          passingStats[1], // PYDS
          passingStats[2], // PAVG
          passingStats[3], // PTD
          passingStats[4], // INT
          passingStats[5], // S-YDSLST (6th, but will be labeled as 6th)
          passingStats[7]  // RTG (8th stat, but will be 7th in display)
        ];
        qbLabels = ['C/ATT', 'PYDS', 'PAVG', 'PTD', 'INT', 'S-YDSLST', 'RTG'];
      }

      return (
        <View>
          {qbStats.length > 0 && (
            <View style={[styles.statCategory, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>🏈</Text>
                <Text allowFontScaling={false} style={[styles.statCategoryTitle, { color: theme.text }]}>Passing</Text>
              </View>
              {renderStatRow(qbStats, qbLabels)}
            </View>
          )}
          {rushingStats.length > 0 && (
            <View style={[styles.statCategory, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>🏈</Text>
                <Text allowFontScaling={false} style={[styles.statCategoryTitle, { color: theme.text }]}>Rushing</Text>
              </View>
              {renderStatRow(rushingStats, ['CAR', 'RUSH YDS', 'YDS/CAR', 'RUSH TD', 'LNG'])}
            </View>
          )}
        </View>
      );
    } else if (['RB', 'FB'].includes(position)) {
      return (
        <View>
          {rushingStats.length > 0 && (
            <View style={[styles.statCategory, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>🏈</Text>
                <Text allowFontScaling={false} style={[styles.statCategoryTitle, { color: theme.text }]}>Rushing</Text>
              </View>
              {renderStatRow(rushingStats, ['CAR', 'RUSH YDS', 'YDS/CAR', 'RUSH TD', 'LNG'])}
            </View>
          )}
          {receivingStats.length > 0 && (
            <View style={[styles.statCategory, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>🏈</Text>
                <Text allowFontScaling={false} style={[styles.statCategoryTitle, { color: theme.text }]}>Receiving</Text>
              </View>
              {renderStatRow(receivingStats, ['REC', 'REC YDS', 'YDS/REC', 'REC TD', 'LNG', 'TGT'])}
            </View>
          )}
        </View>
      );
    } else if (['WR', 'TE'].includes(position)) {
      return (
        <View>
          {receivingStats.length > 0 && (
            <View style={[styles.statCategory, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>🏈</Text>
                <Text allowFontScaling={false} style={[styles.statCategoryTitle, { color: theme.text }]}>Receiving</Text>
              </View>
              {renderStatRow(receivingStats, ['REC', 'REC YDS', 'YDS/REC', 'REC TD', 'LNG', 'TGT'])}
            </View>
          )}
          {rushingStats.length > 0 && (
            <View style={[styles.statCategory, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>🏈</Text>
                <Text allowFontScaling={false} style={[styles.statCategoryTitle, { color: theme.text }]}>Rushing</Text>
              </View>
              {renderStatRow(rushingStats, ['CAR', 'RUSH YDS', 'YDS/CAR', 'RUSH TD', 'LNG'])}
            </View>
          )}
        </View>
      );
    } else if (['DE', 'DT', 'LB', 'OLB', 'MLB', 'ILB'].includes(position)) {
      return (
        <View>
          {defensiveStats.length > 0 && (
            <View style={[styles.statCategory, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>🏈</Text>
                <Text allowFontScaling={false} style={[styles.statCategoryTitle, { color: theme.text }]}>Defensive</Text>
              </View>
              {renderStatRow(defensiveStats, ['TOT TCKL', 'SOLO', 'SACKS', 'TFL', 'PD', 'QB HIT'])}
            </View>
          )}
        </View>
      );
    } else if (['CB', 'S', 'FS', 'SS', 'DB'].includes(position)) {
      return (
        <View>
          {defensiveStats.length > 0 && (
            <View style={styles.statCategory}>
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>🏈</Text>
                <Text allowFontScaling={false} style={styles.statCategoryTitle}>Defensive</Text>
              </View>
              {renderStatRow(defensiveStats, ['TOT TCKL', 'SOLO', 'PD', 'QB HIT'])}
            </View>
          )}
          {interceptionStats.length > 0 && (
            <View style={styles.statCategory}>
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>🏈</Text>
                <Text allowFontScaling={false} style={styles.statCategoryTitle}>Interceptions</Text>
              </View>
              {renderStatRow(interceptionStats, ['INT', 'INT YDS', 'LNG', 'TD'])}
            </View>
          )}
        </View>
      );
    } else if (['K', 'P', 'PK'].includes(position)) {
      return (
        <View>
          {kickingStats.length > 0 && (
            <View style={styles.statCategory}>
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>🏈</Text>
                <Text allowFontScaling={false} style={styles.statCategoryTitle}>Kicking</Text>
              </View>
              {renderStatRow(kickingStats, ['FG MADE/ATT', 'FG PCT', 'LNG', 'XP MADE/ATT', 'KICK PTS'])}
            </View>
          )}
          {puntingStats.length > 0 && (
            <View style={styles.statCategory}>
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>🏈</Text>
                <Text allowFontScaling={false} style={styles.statCategoryTitle}>Punting</Text>
              </View>
              {renderStatRow(puntingStats, ['PUNTS', 'PUNT YDS', 'AVG', 'LNG', 'IN 20'])}
            </View>
          )}
        </View>
      );
    } else {
      // Default fallback for other positions - use actual stat names instead of "Stat 1, Stat 2"
      return (
        <View>
          {playerStats.splits.categories.map((category, categoryIndex) => {
            // Try to get labels from the category or construct them from stat names
            let statLabels = [];
            
            if (category.labels && category.labels.length > 0) {
              statLabels = category.labels;
            } else if (category.stats && category.stats.length > 0) {
              // Define common stat patterns for different categories
              const categoryName = (category.name || '').toLowerCase();
              
              if (categoryName.includes('fumble')) {
                statLabels = ['Fumbles', 'Lost', 'Recovered'];
              } else if (categoryName.includes('penalty') || categoryName.includes('penalties')) {
                statLabels = ['Penalties', 'Yards', 'First Downs'];
              } else if (categoryName.includes('passing')) {
                // Handle passing stats - check if we have 8 stats and skip the 7th if so
                if (category.stats && category.stats.length === 8) {
                  // Skip the 7th stat (QBR) and show 1-6 + 8 (RTG)
                  // Modify the stats array to exclude the 7th stat
                  category.stats = [
                    category.stats[0], // C/ATT
                    category.stats[1], // YDS
                    category.stats[2], // AVG
                    category.stats[3], // TD
                    category.stats[4], // INT
                    category.stats[5], // SACK
                    category.stats[7]  // RTG (skip QBR at index 6)
                  ];
                  statLabels = ['C/ATT', 'YDS', 'AVG', 'TD', 'INT', 'SACK', 'RTG'];
                } else {
                  // Default 7 stats
                  statLabels = ['C/ATT', 'YDS', 'AVG', 'TD', 'INT', 'SACK', 'RTG'];
                }
              } else if (categoryName.includes('rushing')) {
                statLabels = ['ATT', 'YDS', 'AVG', 'TD', 'LNG'];
              } else if (categoryName.includes('receiving')) {
                statLabels = ['REC', 'YDS', 'AVG', 'TD', 'LNG', 'TGT'];
              } else if (categoryName.includes('defensive') || categoryName.includes('defense')) {
                statLabels = ['TOT', 'SOLO', 'SACK', 'TFL', 'PD', 'QB HIT', 'D TD'];
              } else if (categoryName.includes('kicking')) {
                statLabels = ['FGM/A', 'FG%', 'LNG', 'XPM/A', 'PTS'];
              } else if (categoryName.includes('punting')) {
                statLabels = ['PUNTS', 'YDS', 'AVG', 'TB', 'IN20', 'LNG'];
              } else if (categoryName.includes('return')) {
                statLabels = ['RET', 'YDS', 'AVG', 'LNG', 'TD'];
              } else {
                // Try to extract names from the stats themselves as last resort
                statLabels = category.stats.map((stat, index) => {
                  if (stat && typeof stat === 'object' && stat.name) {
                    return formatCategoryName(stat.name);
                  }
                  if (stat && typeof stat === 'object' && stat.displayName) {
                    return formatCategoryName(stat.displayName);
                  }
                  return `Stat ${index + 1}`;
                });
              }
              
              // Ensure we have enough labels for all stats
              while (statLabels.length < category.stats.length) {
                statLabels.push(`Stat ${statLabels.length + 1}`);
              }
            } else {
              statLabels = ['No Stats'];
            }

            return (
              <View key={categoryIndex} style={styles.statCategory}>
                <View style={styles.statSubcategoryHeader}>
                  <Text allowFontScaling={false} style={styles.footballEmoji}>🏈</Text>
                  <Text allowFontScaling={false} style={styles.statCategoryTitle}>{formatCategoryName(category.displayName || category.name)}</Text>
                </View>
                {category.stats && category.stats.length > 0 ? (
                  renderStatRow(category.stats, statLabels)
                ) : (
                  <Text allowFontScaling={false} style={styles.noStatsText}>No stats available</Text>
                )}
              </View>
            );
          })}
        </View>
      );
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.text }]}>Loading Game Details...</Text>
      </View>
    );
  }

  if (!gameDetails) {
    return (
      <View style={styles.errorContainer}>
        <Text allowFontScaling={false} style={styles.errorText}>Game details not available</Text>
      </View>
    );
  }

  // Get the competition data from the correct path
  const competition = gameDetails.header?.competitions?.[0] || gameDetails.competitions?.[0];
  const homeTeam = competition?.competitors?.find(c => c.homeAway === 'home');
  const awayTeam = competition?.competitors?.find(c => c.homeAway === 'away');
  
  // Get game status, venue, and date - using the direct paths like the web app
  const status = competition.status || gameDetails.header?.status;
  const gameDate = competition?.date || competition.header?.date;
  const venue = gameDetails.gameInfo.venue.fullName || competition?.venue?.fullName;

  // Helper functions for determining losing team styles
  const isGameFinal = status?.type?.completed;
  const awayScore = parseInt(awayTeam?.score || '0');
  const homeScore = parseInt(homeTeam?.score || '0');
  const isAwayTeamLosing = isGameFinal && awayScore < homeScore;
  const isHomeTeamLosing = isGameFinal && homeScore < awayScore;

  const getTeamScoreStyle = (isLosing) => {
    return isLosing ? [styles.teamScore, { color: theme.textSecondary }] : [styles.teamScore, { color: colors.primary }];
  };

  const getTeamNameStyle = (isLosing) => {
    return isLosing ? [styles.teamName, { color: theme.textSecondary }] : [styles.teamName, { color: theme.text }];
  };

  const getStickyTeamScoreStyle = (isLosing) => {
    return isLosing ? [styles.stickyTeamScore, { color: theme.textSecondary }] : [styles.stickyTeamScore, { color: colors.primary }];
  };

  // Helper function to render team stats
  const renderTeamStats = (teams) => {
    if (!teams || teams.length < 2) return null;

    const awayStats = teams[0]?.statistics || [];
    const homeStats = teams[1]?.statistics || [];

    // Common stats to display
    const statsToShow = [
      { key: 'totalYards', label: 'Total Yards' },
      { key: 'netPassingYards', label: 'Passing Yards' },
      { key: 'rushingYards', label: 'Rushing Yards' },
      { key: 'firstDowns', label: 'First Downs' },
      { key: 'thirdDownEff', label: '3rd Down Conv' },
      { key: 'fourthDownEff', label: '4th Down Conv' },
      { key: 'turnovers', label: 'Turnovers' },
      { key: 'totalPenaltiesYards', label: 'Penalties' },
      { key: 'sacksYardsLost', label: 'Sacks' },
      { key: 'possessionTime', label: 'Time of Poss' }
    ];

    const findStatValue = (stats, statKey) => {
      const stat = stats.find(s => s.name === statKey);
      return stat?.displayValue || '-';
    };

    return (
      <View>
        {statsToShow.map((statConfig, index) => {
          const awayValue = findStatValue(awayStats, statConfig.key);
          const homeValue = findStatValue(homeStats, statConfig.key);
          
          return (
            <View key={index} style={[styles.statRow, { borderBottomColor: theme.border }]}>
              <Text allowFontScaling={false} style={[styles.statAwayValue, { color: theme.textSecondary }]}>{awayValue}</Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.text }]}>{statConfig.label}</Text>
              <Text allowFontScaling={false} style={[styles.statHomeValue, { color: theme.textSecondary }]}>{homeValue}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  // Helper function to render game leaders
  const renderGameLeaders = (leaders, awayTeam, homeTeam) => {
    
    if (!leaders || leaders.length === 0) {
      return null;
    }

    // The leaders array contains team objects with their leaders
    const awayTeamLeaders = leaders.find(teamLeader => 
      teamLeader.team?.id === awayTeam?.team?.id || 
      teamLeader.team?.abbreviation === awayTeam?.team?.abbreviation
    );
    
    const homeTeamLeaders = leaders.find(teamLeader => 
      teamLeader.team?.id === homeTeam?.team?.id || 
      teamLeader.team?.abbreviation === homeTeam?.team?.abbreviation
    );

    if (!awayTeamLeaders || !homeTeamLeaders) {
      return null;
    }

    // Get leaders for key categories
    const categories = ['passingYards', 'rushingYards', 'receivingYards'];
    
    return (
      <View>
        {categories.map((category, categoryIndex) => {
          const awayCategoryData = awayTeamLeaders.leaders?.find(l => l.name === category);
          const homeCategoryData = homeTeamLeaders.leaders?.find(l => l.name === category);
          
          if (!awayCategoryData || !homeCategoryData || 
              !awayCategoryData.leaders?.[0] || !homeCategoryData.leaders?.[0]) {
            return null;
          }

          const awayLeader = awayCategoryData.leaders[0];
          const homeLeader = homeCategoryData.leaders[0];

          return (
            <View key={categoryIndex} style={[styles.leaderCategory, { backgroundColor: theme.surface }]}>
              <Text allowFontScaling={false} style={[styles.leaderCategoryTitle, { color: theme.text }]}>{awayCategoryData.displayName || category}</Text>

              {/* Away Team Leader Row */}
              <View style={[styles.leaderPlayerRow, { borderBottomColor: theme.border }]}>
                <View style={styles.leaderTeamLogoContainer}>
                  <TeamLogoImage 
                    team={awayTeam?.team}
                    style={styles.leaderTeamLogo}
                  />
                  <Text allowFontScaling={false} style={[styles.leaderJerseyNumber, { color: theme.textSecondary }]}>{awayLeader.athlete?.jersey || '#'}</Text>
                </View>
                <Image 
                  source={{ uri: awayLeader.athlete?.headshot?.href || 'https://via.placeholder.com/40x40?text=P' }}
                  style={styles.leaderHeadshot}
                  defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=P' }}
                />
                <View style={styles.leaderPlayerInfo}>
                  <View style={styles.leaderNameRow}>
                    <Text allowFontScaling={false} style={[styles.leaderPlayerName, { color: theme.text }]}>{awayLeader.athlete?.shortName || awayLeader.athlete?.displayName}</Text>
                    <Text allowFontScaling={false} style={[styles.leaderPlayerPosition, { color: theme.textSecondary }]}> {awayLeader.athlete?.position?.abbreviation}</Text>
                  </View>
                  <Text allowFontScaling={false} style={[styles.leaderStatsValue, { color: colors.primary }]}>{awayLeader.displayValue}</Text>
                </View>
              </View>

              {/* Home Team Leader Row */}
              <View style={[styles.leaderPlayerRow, { borderBottomColor: theme.border }]}>
                <View style={styles.leaderTeamLogoContainer}>
                  <TeamLogoImage 
                    team={homeTeam?.team}
                    style={styles.leaderTeamLogo}
                  />
                  <Text allowFontScaling={false} style={[styles.leaderJerseyNumber, { color: theme.textSecondary }]}>{homeLeader.athlete?.jersey || '#'}</Text>
                </View>
                <Image 
                  source={{ uri: homeLeader.athlete?.headshot?.href || 'https://via.placeholder.com/40x40?text=P' }}
                  style={styles.leaderHeadshot}
                  defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=P' }}
                />
                <View style={styles.leaderPlayerInfo}>
                  <View style={styles.leaderNameRow}>
                    <Text allowFontScaling={false} style={[styles.leaderPlayerName, { color: theme.text }]}>{homeLeader.athlete?.shortName || homeLeader.athlete?.displayName}</Text>
                    <Text allowFontScaling={false} style={[styles.leaderPlayerPosition, { color: theme.textSecondary }]}> {homeLeader.athlete?.position?.abbreviation}</Text>
                  </View>
                  <Text allowFontScaling={false} style={[styles.leaderStatsValue, { color: colors.primary }]}>{homeLeader.displayValue}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  // Helper function to render individual team stats
  const renderIndividualTeamStats = (team, teamType) => {
    if (!gameDetails.boxscore?.teams) return null;

    const teamIndex = teamType === 'away' ? 0 : 1;
    const teamStats = gameDetails.boxscore.teams[teamIndex]?.statistics || [];

    const statsToShow = [
      { key: 'totalYards', label: 'Total Yards' },
      { key: 'netPassingYards', label: 'Passing Yards' },
      { key: 'rushingYards', label: 'Rushing Yards' },
      { key: 'firstDowns', label: 'First Downs' },
      { key: 'thirdDownEff', label: '3rd Down Conv' },
      { key: 'fourthDownEff', label: '4th Down Conv' },
      { key: 'turnovers', label: 'Turnovers' },
      { key: 'totalPenaltiesYards', label: 'Penalties' },
      { key: 'sacksYardsLost', label: 'Sacks' },
      { key: 'possessionTime', label: 'Time of Poss' }
    ];

    const findStatValue = (stats, statKey) => {
      const stat = stats.find(s => s.name === statKey);
      return stat?.displayValue || '-';
    };

    return (
      <View style={styles.individualStatsContainer}>
        {statsToShow.map((statConfig, index) => {
          const value = findStatValue(teamStats, statConfig.key);
          
          return (
            <View key={index} style={[styles.individualStatRow, { borderBottomColor: theme.border }]}>
              <Text allowFontScaling={false} style={styles.individualStatLabel}>{statConfig.label}</Text>
              <Text allowFontScaling={false} style={styles.individualStatValue}>{value}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  // Helper function to render individual team leaders
  const renderIndividualTeamLeaders = (team, teamType) => {
    if (!gameDetails.leaders) return null;

    const teamLeaders = gameDetails.leaders.find(teamLeader => 
      teamLeader.team?.id === team?.team?.id || 
      teamLeader.team?.abbreviation === team?.team?.abbreviation
    );

    if (!teamLeaders) return null;

    const categories = ['passingYards', 'rushingYards', 'receivingYards'];

    return (
      <View>
        {categories.map((category, categoryIndex) => {
          const categoryData = teamLeaders.leaders?.find(l => l.name === category);
          
          if (!categoryData || !categoryData.leaders?.[0]) {
            return null;
          }

          const leader = categoryData.leaders[0];

          return (
            <View key={categoryIndex} style={styles.individualLeaderCategory}>
              <Text allowFontScaling={false} style={styles.individualLeaderCategoryTitle}>{categoryData.displayName || category}</Text>
              
              <View style={styles.individualLeaderPlayerRow}>
                <Image 
                  source={{ uri: leader.athlete?.headshot?.href || 'https://via.placeholder.com/40x40?text=P' }}
                  style={styles.individualLeaderHeadshot}
                  defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=P' }}
                />
                <View style={styles.individualLeaderPlayerInfo}>
                  <View style={styles.individualLeaderNameRow}>
                    <Text allowFontScaling={false} style={styles.individualLeaderPlayerName}>
                      {leader.athlete?.shortName || leader.athlete?.displayName}
                    </Text>
                    <Text allowFontScaling={false} style={styles.individualLeaderPlayerPosition}>
                      {leader.athlete?.position?.abbreviation}
                    </Text>
                  </View>
                  <Text allowFontScaling={false} style={styles.individualLeaderStatsValue}>{leader.displayValue}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  // Helper function to render stats content
  const renderStatsContent = () => (
    <View>
      {/* Linescore */}
      <View style={[styles.section, { backgroundColor: theme.surface }]}>
        <Text allowFontScaling={false} style={[styles.sectionTitle, { color: colors.primary }]}>Line Score</Text>
        <View style={[styles.linescoreContainer, {backgroundColor: theme.surfaceSecondary}]}>
          <View style={[styles.linescoreTable, { backgroundColor: theme.surfaceSecondary }]}>
            <View style={[styles.linescoreHeader, { backgroundColor: theme.surface }]}>
              <Text allowFontScaling={false} style={[styles.linescoreHeaderCell, { color: theme.textSecondary }]}></Text>
              <Text allowFontScaling={false} style={[styles.linescoreHeaderCell, { color: theme.textSecondary }]}>1</Text>
              <Text allowFontScaling={false} style={[styles.linescoreHeaderCell, { color: theme.textSecondary }]}>2</Text>
              <Text allowFontScaling={false} style={[styles.linescoreHeaderCell, { color: theme.textSecondary }]}>3</Text>
              <Text allowFontScaling={false} style={[styles.linescoreHeaderCell, { color: theme.textSecondary }]}>4</Text>
              <Text allowFontScaling={false} style={[styles.linescoreHeaderCell, { color: theme.textSecondary }]}>T</Text>
            </View>
            <View style={[styles.linescoreRow, { borderBottomColor: theme.border }]}>
              <View style={styles.linescoreTeamContainer}>
                <TeamLogoImage 
                  team={awayTeam?.team}
                  style={styles.linescoreTeamLogo}
                  isLosingTeam={isAwayTeamLosing}
                />
                <Text allowFontScaling={false} style={[styles.linescoreTeamCell, { color: theme.text }]}>{awayTeam?.team?.abbreviation}</Text>
              </View>
              {[0, 1, 2, 3].map(quarterIndex => {
                const score = awayTeam?.linescores?.[quarterIndex]?.displayValue || "-";
                return <Text allowFontScaling={false} key={quarterIndex} style={[styles.linescoreCell, { color: theme.text }]}>{score}</Text>;
              })}
              <Text allowFontScaling={false} style={[styles.linescoreTotalCell, { color: colors.primary }]}>{awayTeam?.score || '0'}</Text>
            </View>
            <View style={[styles.linescoreRow, { borderBottomColor: theme.border }]}>
              <View style={styles.linescoreTeamContainer}>
                <TeamLogoImage 
                  team={homeTeam?.team}
                  style={styles.linescoreTeamLogo}
                  isLosingTeam={isHomeTeamLosing}
                />
                <Text allowFontScaling={false} style={[styles.linescoreTeamCell, { color: theme.text }]}>{homeTeam?.team?.abbreviation}</Text>
              </View>
              {[0, 1, 2, 3].map(quarterIndex => {
                const score = homeTeam?.linescores?.[quarterIndex]?.displayValue || "-";
                return <Text allowFontScaling={false} key={quarterIndex} style={[styles.linescoreCell, { color: theme.text }]}>{score}</Text>;
              })}
              <Text allowFontScaling={false} style={[styles.linescoreTotalCell, { color: colors.primary }]}>{homeTeam?.score || '0'}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Team Stats */}
      <View style={[styles.section, { backgroundColor: theme.surface }]}>
        <Text allowFontScaling={false} style={[styles.sectionTitle, { color: colors.primary }]}>Team Statistics</Text>
        <View style={[styles.statsContainer, { backgroundColor: theme.surfaceSecondary }]}>
          <View style={[styles.statsHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <View style={styles.statsTeamHeader}>
              <TeamLogoImage 
                team={awayTeam?.team}
                style={styles.statsTeamLogo}
                isLosingTeam={isAwayTeamLosing}
              />
              <Text allowFontScaling={false} style={[
                styles.statsTeamName, 
                { color: theme.text }
              ]}>
                {awayTeam?.team?.abbreviation}
              </Text>
            </View>
            <Text allowFontScaling={false} style={[styles.statsLabel, { color: theme.textSecondary }]}>Stat</Text>
            <View style={styles.statsTeamHeader}>
              <Text allowFontScaling={false} style={[
                styles.statsTeamName, 
                { color: theme.text }
              ]}>
                {homeTeam?.team?.abbreviation}
              </Text>
              <TeamLogoImage 
                team={homeTeam?.team}
                style={styles.statsTeamLogo}
                isLosingTeam={isHomeTeamLosing}
              />
            </View>
          </View>
          {gameDetails.boxscore?.teams && renderTeamStats(gameDetails.boxscore.teams)}
        </View>
      </View>

      {/* Game/Team Leaders */}
      <View style={[styles.section, { backgroundColor: theme.surface }]}>
        <Text allowFontScaling={false} style={[styles.sectionTitle, { color: colors.primary }]}>
          {(() => {
            const statusDesc = status?.type?.description?.toLowerCase();
            return statusDesc?.includes('scheduled') ? 'Team Leaders' : 'Game Leaders';
          })()}
        </Text>
        <View style={[styles.leadersContainer, { backgroundColor: theme.surfaceSecondary }]}>
          {gameDetails.leaders && renderGameLeaders(gameDetails.leaders, awayTeam, homeTeam)}
        </View>
      </View>
    </View>
  );

  // Helper function to format position group names
  const formatPositionGroupName = (positionName) => {
    if (!positionName) return 'Position Group';
    
    // Handle compound words like specialTeam, kickReturn, etc.
    const formatted = positionName
      // Split on capital letters for camelCase
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Capitalize first letter of each word
      .replace(/\b\w/g, l => l.toUpperCase());
    
    return formatted;
  };

  // Helper function to render team roster for scheduled games
  const renderTeamRoster = (team) => {
    const isHome = team?.homeAway === 'home';
    const rosterData = isHome ? homeRosterData : awayRosterData;

    if (loadingRoster) {
      return (
        <View style={[styles.rosterContainer, { backgroundColor: theme.surface }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.textSecondary }]}>Loading roster...</Text>
        </View>
      );
    }

    if (!rosterData?.athletes) {
      return (
        <View style={[styles.rosterContainer, { backgroundColor: theme.surface }]}>
          <Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.textSecondary }]}>Roster data not available</Text>
        </View>
      );
    }

    return (
      <View style={[styles.rosterContainer, { backgroundColor: theme.surface }]}>
        {rosterData.athletes
          .filter(positionGroup => 
            positionGroup.position !== 'practiceSquad' && 
            positionGroup.items && 
            positionGroup.items.length > 0
          )
          .map((positionGroup, groupIndex) => (
          <View key={groupIndex} style={styles.rosterSection}>
            <Text allowFontScaling={false} style={[styles.rosterSectionTitle, { color: colors.primary }]}>
              {formatPositionGroupName(positionGroup.position) || `Position Group ${groupIndex + 1}`}
            </Text>
            <View style={styles.rosterPlayersList}>
              {/* Header */}
              
              {positionGroup.items?.map((player, playerIndex) => {
                // Determine status and color
                let statusText = '';
                let statusColor = '#666'; // Default grey
                
                if (player.injuries && player.injuries.length > 0 && player.injuries[0].status) {
                  statusText = player.injuries[0].status;
                  if (statusText.toLowerCase() === 'questionable') {
                    statusColor = '#FFA500'; // Yellow for questionable
                  } else {
                    statusColor = '#FF0000'; // Red for other injury statuses
                  }
                } else if (player.status && player.status.id === "1") {
                  statusText = player.status.name || 'Active';
                  statusColor = '#008000'; // Green for active
                }
                
                return (
                  <View key={playerIndex}>
                    {/* Player Name Row */}
                    <View style={[styles.rosterTableRow, { borderBottomColor: theme.border }]}>
                      <View style={styles.rosterTablePlayerCell}>
                        <Text allowFontScaling={false} style={[styles.rosterTablePlayerName, { color: theme.text }]}>
                          {player.displayName || `${player.firstName || ''} ${player.lastName || ''}`.trim()}
                        </Text>
                        <Text allowFontScaling={false} style={[styles.rosterTablePlayerDetails, { color: theme.textSecondary }]}>
                          <Text allowFontScaling={false} style={[styles.rosterTablePlayerNumber, { color: theme.textTertiary }]}>#{player.jersey || 'N/A'}</Text> • {player.position?.abbreviation || positionGroup.position || 'N/A'}
                        </Text>
                      </View>
                    </View>
                    
                    {/* Status Row */}
                    <View style={[styles.rosterTableStatusRow, { backgroundColor: theme.surfaceSecondary }]}>
                      <Text allowFontScaling={false} style={[styles.rosterTableStatusText, { color: statusColor }]}>
                        {statusText || 'Active'}
                      </Text>
                    </View>
                  </View>
                );
              }) || []}
            </View>
          </View>
        ))}
      </View>
    );
  };

  // Helper function to render team-specific content
  const renderTeamContent = (team, teamType) => {
    const statusDesc = status?.type?.description?.toLowerCase();
    const isScheduled = statusDesc?.includes('scheduled');
    const sectionTitle = isScheduled ? 'Roster' : 'Box Score';
    
    if (!gameDetails.boxscore?.players && !isScheduled) {
      return (
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <View style={styles.teamBoxScoreHeader}>
            <TeamLogoImage 
              team={team?.team}
              style={styles.teamBoxScoreLogo}
            />
            <Text allowFontScaling={false} style={[
              styles.sectionTitle, 
              { color: theme.text }
            ]}>
              {team?.team?.displayName || team?.team?.name} {sectionTitle}
            </Text>
          </View>
          <Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.textSecondary }]}>Box score data not available</Text>
        </View>
      );
    }

    // For scheduled games, show roster instead of box score
    if (isScheduled) {
      return (
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <View style={styles.teamBoxScoreHeader}>
            <TeamLogoImage 
              team={team?.team}
              style={styles.teamBoxScoreLogo}
            />
            <Text allowFontScaling={false} style={[
              styles.sectionTitle, 
              { color: theme.text }
            ]}>
              {team?.team?.displayName || team?.team?.name} {sectionTitle}
            </Text>
          </View>
          <View style={[styles.teamBoxScoreContainer, { backgroundColor: theme.surfaceSecondary }]}>
            {renderTeamRoster(team)}
          </View>
        </View>
      );
    }

    // Find the team's boxscore data by matching team ID
    const teamBoxScore = gameDetails.boxscore.players.find(playerTeam => 
      playerTeam.team?.id === team?.team?.id || 
      playerTeam.team?.abbreviation === team?.team?.abbreviation
    );
    
    if (!teamBoxScore || !teamBoxScore.statistics) {
      return (
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <View style={styles.teamBoxScoreHeader}>
            <TeamLogoImage 
              team={team?.team}
              style={styles.teamBoxScoreLogo}
            />
            <Text allowFontScaling={false} style={[
              styles.sectionTitle, 
              { color: theme.text }
            ]}>
              {team?.team?.displayName || team?.team?.name} {sectionTitle}
            </Text>
          </View>
          <Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.textSecondary }]}>No statistics available for this team</Text>
        </View>
      );
    }

    return (
      <View style={[styles.section, { backgroundColor: theme.surface }]}>
        <View style={styles.teamBoxScoreHeader}>
          <TeamLogoImage 
            team={team?.team}
            style={styles.teamBoxScoreLogo}
          />
          <Text allowFontScaling={false} style={[
            styles.sectionTitle, 
            { color: theme.text }
          ]}>
            {team?.team?.displayName || team?.team?.name} {sectionTitle}
          </Text>
        </View>
        <View style={[styles.teamBoxScoreContainer, { backgroundColor: theme.surfaceSecondary }]}>
          {teamBoxScore.statistics.map((statCategory, categoryIndex) => {
            if (!statCategory.athletes || statCategory.athletes.length === 0) return null;

            return (
              <View key={categoryIndex} style={[styles.statCategoryContainer, { backgroundColor: theme.surface }]}>
                <Text allowFontScaling={false} style={[styles.statCategoryTitle, { color: theme.text }]}>
                  {statCategory.text || statCategory.name.charAt(0).toUpperCase() + statCategory.name.slice(1)}
                </Text>
                
                {/* Header */}
                <View style={[styles.statTableHeader, { backgroundColor: theme.surfaceSecondary }]}>
                  <Text allowFontScaling={false} style={[styles.statTableHeaderPlayer, { color: theme.text }]}>Player</Text>
                  {(statCategory.labels || []).slice(0, 4).map((label, labelIndex) => (
                    <Text allowFontScaling={false} key={labelIndex} style={[styles.statTableHeaderStat, { color: theme.text }]}>
                      {label}
                    </Text>
                  ))}
                </View>

                {/* Players */}
                {statCategory.athletes.map((playerData, playerIndex) => {
                  const player = playerData.athlete;
                  const stats = playerData.stats || [];

                  return (
                    <TouchableOpacity 
                      key={playerIndex} 
                      style={[styles.statTableRow, { borderBottomColor: theme.border }]}
                      onPress={() => handlePlayerPress(player, statCategory, team)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.statTablePlayerCell}>
                        <Text allowFontScaling={false} style={[styles.statTablePlayerName, { color: theme.text }]} numberOfLines={1}>
                          {player.firstName ? `${player.firstName.charAt(0)}. ` : ''}{player.lastName || player.displayName || 'Unknown'}
                        </Text>
                        <Text allowFontScaling={false} style={[styles.statTablePlayerNumber, { color: theme.textTertiary }]} >#{player.jersey || 'N/A'}</Text>
                      </View>
                      {stats.slice(0, 4).map((stat, statIndex) => (
                        <Text allowFontScaling={false} key={statIndex} style={[styles.statTableStatCell, { color: theme.text }]}>{stat || '0'}</Text>
                      ))}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  // Helper function to render drives content
  const renderDrivesContent = () => {
    // Only show loading if we're loading drives AND we don't have existing data
    if (loadingDrives && !drivesData) {
      return (
        <View style={[styles.section, { backgroundColor: theme.background }]}>
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: colors.primary }]}>Drive Information</Text>
          <View style={[styles.drivesContainer, { backgroundColor: theme.surface }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.textSecondary }]}>Loading drives...</Text>
          </View>
        </View>
      );
    }

    if (!drivesData || !drivesData.length) {
      return (
        <View style={[styles.section, { backgroundColor: theme.background }]}>
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: colors.primary }]}>Drive Information</Text>
          <View style={styles.drivesContainer}>
            <Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.textSecondary }]}>
              No drive information available for this game
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.section, { backgroundColor: theme.surface }]}>
        <Text allowFontScaling={false} style={[styles.sectionTitle, { color: colors.primary }]}>Drive Information</Text>
        <ScrollView style={styles.drivesScrollView}>
          {[...drivesData].reverse().map((drive, index) => {
            const driveNumber = drivesData.length - index;
            
            return (
              <TouchableOpacity 
                key={`drive-${drive.id || index}`}
                style={[styles.driveCard, { backgroundColor: theme.surfaceSecondary }]}
                onPress={() => handleDrivePress(drive)}
                activeOpacity={0.7}
              >
                <View style={styles.driveHeader}>
                  <View style={styles.driveTeamInfo}>
                    {drive.team && (
                      <TeamLogoImage 
                        team={drive.team}
                        style={styles.driveTeamLogo}
                      />
                    )}
                    <Text allowFontScaling={false} style={[styles.driveTeamName, { color: theme.text }]}>{drive.team?.displayName || 'Unknown Team'}</Text>
                  </View>
                  <Text allowFontScaling={false} style={[styles.driveNumber, { color: colors.primary }]}>{`Drive ${driveNumber}`}</Text>
                </View>

                <View style={styles.driveDetails}>
                  <Text allowFontScaling={false} style={[styles.driveResult, { color: colors.primary }]}>{drive.displayResult || drive.result || 'In Progress'}</Text>
                  {drive.description && (
                    <Text allowFontScaling={false} style={[styles.driveDescription, { color: theme.textTertiary }]}>{drive.description}</Text>
                  )}
                </View>

                {/* Visual Yard Line Display */}
                {renderDriveYardLine(drive, awayTeam, homeTeam)}

                <View style={[styles.driveStats, { backgroundColor: theme.surface }]}>
                  <View style={styles.driveStatItem}>
                    <Text allowFontScaling={false} style={[styles.driveStatLabel, { color: theme.textSecondary }]}>Start</Text>
                    <Text allowFontScaling={false} style={[styles.driveStatValue, { color: theme.text }]}>{drive.start?.text || 'N/A'}</Text>
                  </View>
                  
                  {/* Show End for completed drives or Current for drives in progress */}
                  {(() => {
                    const driveEnded = drive.end?.text;
                    
                    if (driveEnded) {
                      return (
                        <View style={styles.driveStatItem}>
                          <Text allowFontScaling={false} style={[styles.driveStatLabel, { color: theme.textSecondary }]}>End</Text>
                          <Text allowFontScaling={false} style={[styles.driveStatValue, { color: theme.text }]}>{drive.end.text}</Text>
                        </View>
                      );
                    } else {
                      // Drive in progress - find current position
                      let currentPosition = 'N/A';
                      
                      if (drive.plays && drive.plays.length > 0) {
                        const sortedPlays = [...drive.plays].sort((a, b) => {
                          const seqA = parseInt(a.sequenceNumber) || 0;
                          const seqB = parseInt(b.sequenceNumber) || 0;
                          return seqB - seqA;
                        });
                        const mostRecentPlay = sortedPlays[0];
                        
                        if (mostRecentPlay.end?.text) {
                          currentPosition = mostRecentPlay.end.text;
                        } else if (mostRecentPlay.end?.yardLine !== undefined) {
                          // Format yard line with team abbreviation like "CHI 33" or "MIN 24"
                          const yardLine = mostRecentPlay.end.yardLine;
                          if (yardLine === 50) {
                            currentPosition = "50";
                          } else if (yardLine > 50) {
                            const yardLineFromGoal = 100 - yardLine;
                            const opponentTeam = drive.team?.abbreviation === homeTeam?.team?.abbreviation ? awayTeam : homeTeam;
                            currentPosition = `${opponentTeam?.team?.abbreviation || opponentTeam?.abbreviation} ${yardLineFromGoal}`;
                          } else {
                            currentPosition = `${mostRecentPlay.end.possessionText}`;
                          }
                        }
                      }
                      
                      // Fallback to start position if no current found
                      if (currentPosition === 'N/A' && drive.start?.text) {
                        currentPosition = drive.start.text;
                      }
                      
                      return (
                        <View style={styles.driveStatItem}>
                          <Text allowFontScaling={false} style={[styles.driveStatLabel, { color: theme.textSecondary }]}>Current</Text>
                          <Text allowFontScaling={false} style={[styles.driveStatValue, { color: theme.text }]}>{currentPosition}</Text>
                        </View>
                      );
                    }
                  })()}
                  
                  {drive.timeElapsed?.displayValue && (
                    <View style={styles.driveStatItem}>
                      <Text allowFontScaling={false} style={[styles.driveStatLabel, { color: theme.textSecondary }]}>Time</Text>
                      <Text allowFontScaling={false} style={[styles.driveStatValue, { color: theme.text }]}>{drive.timeElapsed.displayValue}</Text>
                    </View>
                  )}
                  {drive.plays && drive.plays.length > 0 && (
                    <View style={styles.driveStatItem}>
                      <Text allowFontScaling={false} style={[styles.driveStatLabel, { color: theme.textSecondary }]}>Plays</Text>
                      <Text allowFontScaling={false} style={[styles.driveStatValue, { color: theme.text }]}>{drive.plays.length}</Text>
                    </View>
                  )}
                </View>

                {/* Tap indicator */}
                <View style={[styles.tapIndicator, { borderTopColor: theme.border }]}>
                  <Text allowFontScaling={false} style={[styles.tapIndicatorText, { color: theme.textSecondary }]}>Tap to view plays</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  // Helper function to render summary content
  const renderSummaryContent = () => {
    if (loadingSummary) {
      return (
        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>Game Summary</Text>
          <View style={styles.summaryContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text allowFontScaling={false} style={styles.placeholderText}>Loading summary...</Text>
          </View>
        </View>
      );
    }

    if (!summaryData) {
      return (
        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>Game Summary</Text>
          <View style={styles.summaryContainer}>
            <Text allowFontScaling={false} style={styles.placeholderText}>
              No summary information available for this game
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.section}>
        <Text allowFontScaling={false} style={styles.sectionTitle}>Game Summary</Text>
        <ScrollView style={styles.summaryScrollView}>
          {/* Game Recap */}
          {summaryData.recap && (
            <View style={styles.summaryCard}>
              <Text allowFontScaling={false} style={styles.summarySectionTitle}>Recap</Text>
              <Text allowFontScaling={false} style={styles.summaryText}>
                {summaryData.recap.headline || summaryData.recap.description || 'No recap available'}
              </Text>
            </View>
          )}

          {/* Highlights */}
          {summaryData.highlights && summaryData.highlights.length > 0 && (
            <View style={styles.summaryCard}>
              <Text allowFontScaling={false} style={styles.summarySectionTitle}>Highlights</Text>
              {summaryData.highlights.map((highlight, index) => (
                <View key={index} style={[styles.highlightItem, { borderBottomColor: theme.border }]}>
                  <Text allowFontScaling={false} style={styles.highlightTitle}>{highlight.headline || highlight.title}</Text>
                  <Text allowFontScaling={false} style={styles.highlightDescription}>
                    {highlight.description || 'No description available'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* News */}
          {summaryData.news && summaryData.news.length > 0 && (
            <View style={styles.summaryCard}>
              <Text allowFontScaling={false} style={styles.summarySectionTitle}>News</Text>
              {summaryData.news.slice(0, 3).map((article, index) => (
                <View key={index} style={styles.newsItem}>
                  <Text allowFontScaling={false} style={styles.newsTitle}>{article.headline}</Text>
                  <Text allowFontScaling={false} style={styles.newsDescription}>
                    {article.description || 'No description available'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Win Probability */}
          {summaryData.winprobability && (
            <View style={styles.summaryCard}>
              <Text allowFontScaling={false} style={styles.summarySectionTitle}>Win Probability</Text>
              <Text allowFontScaling={false} style={styles.summaryText}>
                Win probability data available (chart display would require additional implementation)
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  // Helper function to render plays content
  const renderPlaysContent = () => {
    if (loadingPlays) {
      return (
        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>Play-by-Play</Text>
          <View style={styles.playsContainer}>
            <ActivityIndicator size="small" color="#013369" />
            <Text allowFontScaling={false} style={styles.placeholderText}>Loading plays...</Text>
          </View>
        </View>
      );
    }

    if (!playsData || playsData.length === 0) {
      return (
        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>Play-by-Play</Text>
          <View style={styles.playsContainer}>
            <Text allowFontScaling={false} style={styles.placeholderText}>
              No play-by-play information available for this game
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.section}>
        <Text allowFontScaling={false} style={styles.sectionTitle}>Play-by-Play</Text>
        <ScrollView style={styles.playsScrollView}>
          {playsData.reverse().map((play, index) => (
            <View key={`play-${play.id || index}`} style={styles.playCard}>
              <View style={styles.playHeader}>
                <Text allowFontScaling={false} style={styles.playSequence}>Play {playsData.length - index}</Text>
                {play.clock?.displayValue && play.period?.number && (
                  <Text allowFontScaling={false} style={styles.playTime}>
                    Q{play.period.number} {play.clock.displayValue}
                  </Text>
                )}
              </View>
              
              <Text allowFontScaling={false} style={styles.playText}>
                {play.text || 'No play description available'}
              </Text>
              
              {/* Down and Distance Info */}
              {(play.down?.number || play.distance?.yards || play.type?.text) && (
                <View style={styles.playDetails}>
                  <Text allowFontScaling={false} style={styles.playDetailsText}>
                    {[
                      play.down?.number && play.distance?.yards && 
                        `${play.down.number}${play.down.number === 1 ? 'st' : play.down.number === 2 ? 'nd' : play.down.number === 3 ? 'rd' : 'th'} & ${play.distance.yards}`,
                      play.type?.text,
                      play.scoringPlay && 'SCORING PLAY'
                    ].filter(Boolean).join(' • ')}
                  </Text>
                </View>
              )}

              {/* Field Position */}
              {(play.start?.yardLine !== undefined || play.end?.yardLine !== undefined) && (
                <View style={styles.playFieldPosition}>
                  <Text allowFontScaling={false} style={styles.playFieldText}>
                    {play.start?.text && play.end?.text && 
                      `${play.start.text} → ${play.end.text}`}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  // Helper function to render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'stats':
        return renderStatsContent();
      case 'away':
        return renderTeamContent(awayTeam, 'away');
      case 'home':
        return renderTeamContent(homeTeam, 'home');
      case 'drives':
        return renderDrivesContent();
      default:
        return renderStatsContent();
    }
  };

  // Sticky header component
  const renderStickyHeader = () => {
    return (
      <Animated.View 
        style={[
          styles.stickyHeader, 
          { 
            opacity: stickyHeaderOpacity,
            transform: [{ 
              translateY: stickyHeaderOpacity.interpolate({
                inputRange: [0, 1],
                outputRange: [-20, 0], // Smaller, more subtle slide effect
              })
            }]
          },
          { backgroundColor: theme.surfaceSecondary, borderBottomColor: theme.border }
        ]}
        pointerEvents={showStickyHeader ? 'auto' : 'none'}
      >
        {/* Away Team */}
        <View style={styles.stickyTeamAway}>
          <TeamLogoImage 
            team={awayTeam?.team}
            style={styles.stickyTeamLogo}
            isLosingTeam={isAwayTeamLosing}
          />
          <Text allowFontScaling={false} style={getStickyTeamScoreStyle(isAwayTeamLosing)}>{awayTeam?.score || '0'}</Text>
          <Text allowFontScaling={false} style={[
            styles.stickyTeamName, 
            { color: isFavorite(getNFLTeamId(awayTeam?.team)) ? colors.primary : (isAwayTeamLosing ? theme.textSecondary : theme.text) }
          ]}>
            {isFavorite(getNFLTeamId(awayTeam?.team)) && '★ '}
            {getNFLTeamAbbreviation(awayTeam?.team) || 'AWAY'}
          </Text>
          {/* Possession indicator for away team */}
          {(() => {
            // Find possession from drives data
            if (!drivesData || status?.type?.description === 'Halftime') return null;
            
            const currentDrive = drivesData.find(drive => 
              !drive.end?.text && drive.result !== 'End of Game'
            );
            
            const possessionTeamId = currentDrive?.team?.id;
            const showPossession = possessionTeamId === awayTeam?.team?.id;
            
            return showPossession ? (
              <Text allowFontScaling={false} style={styles.stickyPossessionIndicator}>🏈</Text>
            ) : null;
          })()}
        </View>

        {/* Status and Time */}
        <View style={styles.stickyStatus}>
          <Text allowFontScaling={false} style={[styles.stickyStatusText, { color: colors.primary }]}>
            {status?.type?.completed ? 'Final' :
             status?.type?.description === 'Halftime' ? 'Halftime' :
             status?.period && status?.period > 0 && !status?.type?.completed ? 
             (status.period <= 4 ? `${['1st', '2nd', '3rd', '4th'][status.period - 1]} Quarter` : `OT ${status.period - 4}`) :
             status?.type?.description || status?.type?.name || 'Scheduled'}
          </Text>
          {/* Show clock for in-progress games or start time for scheduled games */}
          {status?.displayClock && !status?.type?.completed && status?.type?.description !== 'Halftime' ? (
            <Text allowFontScaling={false} style={[styles.stickyClock, { color: theme.textSecondary }]}>
              {status.displayClock}
            </Text>
          ) : (!status?.type?.completed && !status?.period && gameDate) ? (
            <Text allowFontScaling={false} style={[styles.stickyClock, { color: theme.textSecondary }]}>
              {new Date(gameDate).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })}
            </Text>
          ) : null}
        </View>

        {/* Home Team */}
        <View style={styles.stickyTeamHome}>
          {/* Possession indicator for home team */}
          {(() => {
            // Find possession from drives data
            if (!drivesData || status?.type?.description === 'Halftime') return null;
            
            const currentDrive = drivesData.find(drive => 
              !drive.end?.text && drive.result !== 'End of Game'
            );
            
            const possessionTeamId = currentDrive?.team?.id;
            const showPossession = possessionTeamId === homeTeam?.team?.id;
            
            return showPossession ? (
              <Text allowFontScaling={false} style={styles.stickyPossessionIndicator}>🏈</Text>
            ) : null;
          })()}
          <Text allowFontScaling={false} style={[
            styles.stickyTeamName, 
            { color: isFavorite(getNFLTeamId(homeTeam?.team)) ? colors.primary : (isHomeTeamLosing ? theme.textSecondary : theme.text) }
          ]}>
            {isFavorite(getNFLTeamId(homeTeam?.team)) && '★ '}
            {getNFLTeamAbbreviation(homeTeam?.team) || 'HOME'}
          </Text>
          <Text allowFontScaling={false} style={getStickyTeamScoreStyle(isHomeTeamLosing)}>{homeTeam?.score || '0'}</Text>
          <TeamLogoImage 
            team={homeTeam?.team}
            style={styles.stickyTeamLogo}
            isLosingTeam={isHomeTeamLosing}
          />
        </View>
      </Animated.View>
    );
  };

  // Handle scroll events
  const handleScroll = (event) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    
    // Define the transition range - moved earlier
    const fadeStartY = 100; // Start fading in when scrolled past this point
    const fadeEndY = 150;   // Fully visible at this point
    
    // Calculate opacity based on scroll position within the transition range
    let opacity = 0;
    if (scrollY >= fadeStartY) {
      if (scrollY >= fadeEndY) {
        opacity = 1; // Fully visible
      } else {
        // Gradual transition between fadeStartY and fadeEndY
        opacity = (scrollY - fadeStartY) / (fadeEndY - fadeStartY);
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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Sticky Header - Always render but animated */}
      {renderStickyHeader()}
      
      {/* Main Content */}
      <ScrollView 
        style={[styles.scrollView, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
      {/* Game Header */}
      <View style={[styles.gameHeader, { backgroundColor: theme.surface }]}>
        <View style={styles.teamContainer}>
          {/* Debug possession data */}
          {(() => {
            // Find possession from drives data like the yard line graphic does
            let possessionTeamId = null;
            if (drivesData) {
              const currentDrive = drivesData.find(drive => 
                !drive.end?.text && drive.result !== 'End of Game'
              );
              if (currentDrive?.team?.id) {
                possessionTeamId = currentDrive.team.id;
              }
            }
            
            console.log('=== POSSESSION DEBUG ===');
            console.log('drivesData found current drive possession team ID:', possessionTeamId);
            console.log('awayTeam.team.id:', awayTeam?.team?.id);
            console.log('homeTeam.team.id:', homeTeam?.team?.id);
            console.log('Possession match away:', possessionTeamId === awayTeam?.team?.id);
            console.log('Possession match home:', possessionTeamId === homeTeam?.team?.id);
            console.log('status.type.description:', status?.type?.description);
            console.log('========================');
            return null;
          })()}
          {/* Away Team */}
          <View style={styles.team}>
            <Text allowFontScaling={false} style={getTeamScoreStyle(isAwayTeamLosing)}>{awayTeam?.score || '0'}</Text>
            <View style={styles.teamLogoContainer}>
              {/* Possession indicator for away team (not during halftime) */}
              {(() => {
                // Find possession from drives data
                if (!drivesData || status?.type?.description === 'Halftime') return null;
                
                const currentDrive = drivesData.find(drive => 
                  !drive.end?.text && drive.result !== 'End of Game'
                );
                
                const possessionTeamId = currentDrive?.team?.id;
                const showPossession = possessionTeamId === awayTeam?.team?.id;
                
                return showPossession ? (
                  <Text allowFontScaling={false} style={[styles.possessionIndicator, styles.awayPossession]}>🏈</Text>
                ) : null;
              })()}
              <TeamLogoImage 
                team={awayTeam?.team}
                style={styles.teamLogo}
                isLosingTeam={isAwayTeamLosing}
              />
            </View>
            <View style={styles.teamNameContainer}>
              <Text allowFontScaling={false} style={[
                getTeamNameStyle(isAwayTeamLosing), 
                { color: isFavorite(getNFLTeamId(awayTeam?.team)) ? colors.primary : (isAwayTeamLosing ? theme.textSecondary : theme.text) }
              ]}>
                {isFavorite(getNFLTeamId(awayTeam?.team)) && '★ '}
                {awayTeam?.team?.abbreviation || awayTeam?.team?.shortDisplayName || awayTeam?.team?.name}
              </Text>
            </View>
          </View>

          {/* VS/Quarter Info */}
          <View style={styles.vsContainer}>
            <Text allowFontScaling={false} style={[styles.vsText, { color: theme.textSecondary }]}>VS</Text>
            <Text allowFontScaling={false} style={[styles.gameStatus, { color: colors.primary }]}>
              {status?.type?.completed ? 'Final' :
               status?.type?.description === 'Halftime' ? 'Halftime' :
               status?.period && status?.period > 0 && !status?.type?.completed ? 
               (status.period <= 4 ? `${['1st', '2nd', '3rd', '4th'][status.period - 1]} Quarter` : `OT ${status.period - 4}`) :
               status?.type?.description || status?.type?.name || 'Scheduled'}
            </Text>
            {/* Show clock for in-progress games or start time for scheduled games */}
            {status?.displayClock && !status?.type?.completed && status?.type?.description !== 'Halftime' ? (
              <Text allowFontScaling={false} style={[styles.gameClock, { color: theme.textSecondary }]}>
                {status.displayClock}
              </Text>
            ) : (!status?.type?.completed && !status?.period && gameDate) ? (
              <Text allowFontScaling={false} style={[styles.gameClock, { color: theme.textSecondary }]}>
                {new Date(gameDate).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
              </Text>
            ) : null}
          </View>

          {/* Home Team */}
          <View style={styles.team}>
            <Text allowFontScaling={false} style={getTeamScoreStyle(isHomeTeamLosing)}>{homeTeam?.score || '0'}</Text>
            <View style={styles.teamLogoContainer}>
              <TeamLogoImage 
                team={homeTeam?.team}
                style={styles.teamLogo}
                isLosingTeam={isHomeTeamLosing}
              />
              {/* Possession indicator for home team (not during halftime) */}
              {(() => {
                // Find possession from drives data
                if (!drivesData || status?.type?.description === 'Halftime') return null;
                
                const currentDrive = drivesData.find(drive => 
                  !drive.end?.text && drive.result !== 'End of Game'
                );
                
                const possessionTeamId = currentDrive?.team?.id;
                const showPossession = possessionTeamId === homeTeam?.team?.id;
                
                return showPossession ? (
                  <Text allowFontScaling={false} style={[styles.possessionIndicator, styles.homePossession]}>🏈</Text>
                ) : null;
              })()}
            </View>
            <View style={styles.teamNameContainer}>
              <Text allowFontScaling={false} style={[
                getTeamNameStyle(isHomeTeamLosing), 
                { color: isFavorite(getNFLTeamId(homeTeam?.team)) ? colors.primary : (isHomeTeamLosing ? theme.textSecondary : theme.text) }
              ]}>
                {isFavorite(getNFLTeamId(homeTeam?.team)) && '★ '}
                {homeTeam?.team?.abbreviation || homeTeam?.team?.shortDisplayName || homeTeam?.team?.name}
              </Text>
            </View>
          </View>
        </View>

        {/* Game Info or Yard Line */}
        {!status?.type?.completed && status?.period && status?.period > 0 ? (
          <View style={styles.yardLineContainer}>
            {/* Football Field - always show during active game */}
            <View style={styles.yardLineField}>
              {/* Field yard lines - proper football field layout (Away left, Home right) */}
              {[0, 10, 20, 30, 40, 50, 40, 30, 20, 10, 0].map((yard, index) => {
                const isLeftEndZone = index === 0;
                const isRightEndZone = index === 10;
                const isLastYardLine = index === 10;
                
                return (
                  <View 
                    key={index} 
                    style={[
                      styles.yardLineMark,
                      isLastYardLine && styles.lastYardLineMark
                    ]}
                  >
                    {isLeftEndZone ? (
                      // Away team end zone (left)
                      <TeamLogoImage 
                        team={awayTeam?.team}
                        style={styles.endZoneLogo}
                      />
                    ) : isRightEndZone ? (
                      // Home team end zone (right)
                      <TeamLogoImage 
                        team={homeTeam?.team}
                        style={styles.endZoneLogo}
                      />
                    ) : (
                      <Text allowFontScaling={false} style={styles.yardLineNumber}>
                        {yard}
                      </Text>
                    )}
                  </View>
                );
              })}
              
              {/* Ball position indicator - use drives data */}
              {status?.type?.description !== 'Halftime' && drivesData && (() => {
                // Find the current drive in progress
                const currentDrive = drivesData.find(drive => 
                  !drive.end?.text && drive.result !== 'End of Game'
                );
                
                if (!currentDrive?.plays?.length) return null;
                
                // Get the most recent play
                const sortedPlays = [...currentDrive.plays].sort((a, b) => {
                  const seqA = parseInt(a.sequenceNumber) || 0;
                  const seqB = parseInt(b.sequenceNumber) || 0;
                  return seqB - seqA;
                });
                const mostRecentPlay = sortedPlays[0];
                
                if (!mostRecentPlay?.end) return null;
                
                // Get the possession team abbreviation and yard line
                const possessionText = mostRecentPlay.end.possessionText; // e.g., "LV 22"
                const yardLine = mostRecentPlay.end.yardLine; // e.g., 22
                
                if (!possessionText || yardLine === undefined) return null;
                
                // Extract team abbreviation from possessionText (e.g., "LV" from "LV 22")
                const teamAbbr = possessionText.split(' ')[0];
                
                console.log('Ball Position Debug:', {
                  possessionText,
                  teamAbbr,
                  yardLine,
                  homeTeamAbbr: homeTeam?.team?.abbreviation,
                  awayTeamAbbr: awayTeam?.team?.abbreviation
                });
                
                // Determine which side of the field the ball is on
                let ballPosition = 50; // default to midfield
                
                // NFL field logic: Away team (left) = 0-50%, Home team (right) = 50-100%
                // possessionText like "LV 7" means the ball is at LV's 7-yard line (7 yards from LV's goal)
                if (teamAbbr === homeTeam?.team?.abbreviation) {
                  // Ball is on HOME team's side of field (right side, 50-100%)
                  // "LV 7" = 7 yards from home endzone = 93% from left edge
                  // Formula: 100 - (yardLine / 50 * 50) = 100 - yardLine
                  ballPosition = 100 - yardLine;
                } else if (teamAbbr === awayTeam?.team?.abbreviation) {
                  // Ball is on AWAY team's side of field (left side, 0-50%)
                  // "LAC 7" = 7 yards from away endzone = 7% from left edge
                  // Formula: yardLine / 50 * 50 = yardLine
                  ballPosition = 100 - yardLine;
                } else {
                  // Fallback: try to determine based on possession team
                  const possessionTeam = currentDrive.team?.abbreviation;
                  if (possessionTeam === homeTeam?.team?.abbreviation) {
                    // Home team has possession - ball is on home side
                    ballPosition = 100 - yardLine;
                  } else if (possessionTeam === awayTeam?.team?.abbreviation) {
                    // Away team has possession - ball is on away side
                    ballPosition = yardLine;
                  }
                }
                
                console.log('Calculated ball position:', ballPosition);
                
                return (
                  <View 
                    style={[
                      styles.ballPosition, 
                      { left: `${Math.max(2, Math.min(98, ballPosition))}%` }
                    ]}
                  >
                    <Text allowFontScaling={false} style={styles.ballIcon}>🏈</Text>
                  </View>
                );
              })()}
            </View>
            
            {/* Down and Distance Info - show under the yard line graphic */}
            {status?.type?.description !== 'Halftime' && drivesData && (() => {
              // Find the current drive in progress
              const currentDrive = drivesData.find(drive => 
                !drive.end?.text && drive.result !== 'End of Game'
              );
              
              if (!currentDrive?.plays?.length) return null;
              
              // Get the most recent play
              const sortedPlays = [...currentDrive.plays].sort((a, b) => {
                const seqA = parseInt(a.sequenceNumber) || 0;
                const seqB = parseInt(b.sequenceNumber) || 0;
                return seqB - seqA;
              });
              const mostRecentPlay = sortedPlays[0];
              
              if (!mostRecentPlay?.end) return null;
              
              // Extract down, distance, and position from the play end data
              const down = mostRecentPlay.end.down;
              const distance = mostRecentPlay.end.distance;
              const shortDownDistanceText = mostRecentPlay.end.shortDownDistanceText; // e.g., "1st & 10"
              const possessionText = mostRecentPlay.end.possessionText; // e.g., "LV 22"
              
              if (!down || distance === undefined) return null;
              
              return (
                <View style={styles.headerDownAndDistance}>
                  <Text allowFontScaling={false} style={[styles.headerDownText, { color: colors.primary }]}>
                    {shortDownDistanceText || `${['1st', '2nd', '3rd', '4th'][down - 1]} & ${distance}`}
                  </Text>
                  {possessionText && (
                    <Text allowFontScaling={false} style={[styles.headerPossessionText, { color: theme.textSecondary }]}>
                      {possessionText}
                    </Text>
                  )}
                </View>
              );
            })()}
          </View>
        ) : (
          <View style={styles.gameInfo}>
            <Text allowFontScaling={false} style={[styles.venue, { color: theme.textSecondary }]}>
              {venue || competition?.venue || 'TBD'}
            </Text>
            <Text allowFontScaling={false} style={[styles.date, { color: theme.textSecondary }]}>
              {gameDate ? new Date(gameDate).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              }) : 'TBD'}
            </Text>
          </View>
        )}
      </View>

      {/* Tab Navigation */}
      <View style={[styles.tabContainer, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity 
          style={[
            styles.tabButton, 
            { backgroundColor: activeTab === 'stats' ? colors.primary : 'transparent' , borderRightColor: theme.border }
          ]}
          onPress={() => setActiveTab('stats')}
        >
          <Text allowFontScaling={false} style={[
            styles.tabText, 
            { color: activeTab === 'stats' ? '#fff' : theme.text }
          ]}>Stats</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[
            styles.tabButton, 
            { backgroundColor: activeTab === 'away' ? colors.primary : 'transparent', borderRightColor: theme.border }
          ]}
          onPress={() => setActiveTab('away')}
        >
          <Text allowFontScaling={false} style={[
            styles.tabText, 
            { color: activeTab === 'away' ? '#fff' : theme.text }
          ]}>Away</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[
            styles.tabButton, 
            { backgroundColor: activeTab === 'home' ? colors.primary : 'transparent', borderRightColor: theme.border }
          ]}
          onPress={() => setActiveTab('home')}
        >
          <Text allowFontScaling={false} style={[
            styles.tabText, 
            { color: activeTab === 'home' ? '#fff' : theme.text }
          ]}>Home</Text>
        </TouchableOpacity>
        {/* Only show drives tab for non-scheduled games */}
        {(() => {
          const statusDesc = status?.type?.description?.toLowerCase();
          const isScheduled = statusDesc?.includes('scheduled');
          return !isScheduled;
        })() && (
          <TouchableOpacity 
            style={[
              styles.tabButton, 
              { backgroundColor: activeTab === 'drives' ? colors.primary : 'transparent' , borderRightColor: 'transparent' }
            ]}
            onPress={() => setActiveTab('drives')}
          >
            <Text allowFontScaling={false} style={[
              styles.tabText, 
              { color: activeTab === 'drives' ? '#fff' : theme.text }
            ]}>Drives</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tab Content */}
      {renderTabContent()}

      {/* Player Details Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={playerModalVisible}
        onRequestClose={closePlayerModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            {/* Close Button */}
            <TouchableOpacity style={[styles.modalCloseButton, { backgroundColor: theme.error }]} onPress={closePlayerModal}>
              <Text allowFontScaling={false} style={[styles.modalCloseText, { color: '#fff' }]}>×</Text>
            </TouchableOpacity>

            {selectedPlayer && (
              <>
                {/* Player Header */}
                <View style={styles.playerHeader}>
                  <Image 
                    source={{ 
                      uri: NFLService.convertToHttps(selectedPlayer.headshot?.href || selectedPlayer.headshot) 
                    }}
                    style={styles.playerHeadshot}
                    defaultSource={{ uri: 'https://via.placeholder.com/80x80?text=Player' }}
                  />
                  <View style={styles.playerInfo}>
                    <Text allowFontScaling={false} style={[styles.playerName, { color: theme.text }]}>
                      {selectedPlayer.displayName || `${selectedPlayer.firstName || ''} ${selectedPlayer.lastName || ''}`.trim()} <Text allowFontScaling={false} style={[styles.playerDetails, { color: theme.textSecondary }]}>#{selectedPlayer.jersey || 'N/A'}</Text>
                    </Text>
                    <View style={styles.playerTeamInfo}>
                      {selectedPlayer.team?.team && (
                        <TeamLogoImage 
                          team={selectedPlayer.team.team}
                          style={styles.playerTeamLogo}
                        />
                      )}
                      <Text allowFontScaling={false} style={[styles.playerTeamName, { color: theme.textSecondary }]}>
                        {selectedPlayer.team?.team?.displayName || selectedPlayer.team?.team?.name || selectedPlayer.team?.team?.abbreviation || 'No team info'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Player Stats */}
                <View style={styles.playerStatsContainer}>
                  {loadingPlayerStats ? (
                    <View style={styles.playerStatsLoading}>
                      <ActivityIndicator size="large" color={colors.primary} />
                      <Text allowFontScaling={false} style={styles.loadingText}>Loading player stats...</Text>
                    </View>
                  ) : playerStats ? (
                    <View style={styles.playerStatsContent}>
                      {renderPositionSpecificStats(playerStats, selectedPlayer?.position?.abbreviation || selectedPlayer?.position)}
                    </View>
                  ) : (
                    <Text allowFontScaling={false} style={styles.noStatsText}>Unable to load player statistics</Text>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Drive Details Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={driveModalVisible}
        onRequestClose={closeDriveModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            {/* Close Button */}
            <TouchableOpacity style={[styles.modalCloseButton, { backgroundColor: theme.error }]} onPress={closeDriveModal}>
              <Text allowFontScaling={false} style={[styles.modalCloseText, { color: '#fff' }]}>×</Text>
            </TouchableOpacity>

            {selectedDrive && (
              <>
                {/* Drive Header */}
                <View style={styles.driveModalHeader}>
                  <View style={styles.driveModalTeamInfo}>
                    {selectedDrive.team && (
                      <TeamLogoImage 
                        team={selectedDrive.team}
                        style={styles.driveModalTeamLogo}
                      />
                    )}
                    <View>
                      <Text allowFontScaling={false} style={[styles.driveModalTeamName, {color: theme.text}]}>{selectedDrive.team?.displayName || 'Unknown Team'}</Text>
                      <Text allowFontScaling={false} style={[styles.driveModalResult, {color: colors.primary}]}>{selectedDrive.displayResult || selectedDrive.result || 'In Progress'}</Text>
                    </View>
                  </View>
                  <View style={styles.driveModalDescriptionContainer}>
                    <Text allowFontScaling={false} style={[styles.driveModalDescription, {color: theme.textSecondary}]}>
                      {getDriveSummary(selectedDrive)}
                    </Text>
                  </View>
                </View>

                {/* Drive Visual */}
                {renderDriveYardLine(selectedDrive, awayTeam, homeTeam)}

                {/* Drive Stats */}
                <View style={[styles.driveModalStats, { backgroundColor: theme.surfaceSecondary }]}>
                  <View style={styles.driveModalStatItem}>
                    <Text allowFontScaling={false} style={[styles.driveModalStatLabel, { color: theme.textSecondary }]}>Start</Text>
                    <Text allowFontScaling={false} style={[styles.driveModalStatValue, { color: theme.text }]}>{selectedDrive.start?.text || 'N/A'}</Text>
                  </View>
                  
                  {/* Show End for completed drives or Current for drives in progress */}
                  {(() => {
                    const driveEnded = selectedDrive.end?.text;
                    const driveInProgress = !driveEnded;
                    
                    if (driveEnded) {
                      return (
                        <View style={styles.driveModalStatItem}>
                          <Text allowFontScaling={false} style={[styles.driveModalStatLabel, { color: theme.textSecondary }]}>End</Text>
                          <Text allowFontScaling={false} style={[styles.driveModalStatValue, { color: theme.text }]}>{selectedDrive.end.text}</Text>
                        </View>
                      );
                    } else if (driveInProgress) {
                      // Find most recent play for current position
                      let currentPosition = 'N/A';
                      
                      if (selectedDrive.plays && selectedDrive.plays.length > 0) {
                        const sortedPlays = [...selectedDrive.plays].sort((a, b) => {
                          const seqA = parseInt(a.sequenceNumber) || 0;
                          const seqB = parseInt(b.sequenceNumber) || 0;
                          return seqB - seqA;
                        });
                        const mostRecentPlay = sortedPlays[0];
                        
                        if (mostRecentPlay.end?.text) {
                          currentPosition = mostRecentPlay.end.text;
                        } else if (mostRecentPlay.end?.yardLine !== undefined) {
                          // Format yard line with team abbreviation like "CHI 33" or "MIN 24"
                          const yardLine = mostRecentPlay.end.yardLine;
                          if (yardLine === 50) {
                            currentPosition = "50";
                          } else if (yardLine > 50) {
                            const yardLineFromGoal = 100 - yardLine;
                            const opponentTeam = selectedDrive.team?.abbreviation === homeTeam?.team?.abbreviation ? awayTeam : homeTeam;
                            currentPosition = `${opponentTeam?.team?.abbreviation || opponentTeam?.abbreviation} ${yardLineFromGoal}`;
                          } else {
                            currentPosition = `${selectedDrive.team?.abbreviation} ${yardLine}`;
                          }
                        }
                      }
                      
                      // Fallback to game situation
                      if (currentPosition === 'N/A' && gameSituation?.possession?.yardLine !== undefined) {
                        currentPosition = `${gameSituation.possession.yardLine}`;
                      }
                      
                      // Final fallback to start position
                      if (currentPosition === 'N/A' && selectedDrive.start?.text) {
                        currentPosition = selectedDrive.start.text;
                      }
                      
                      return (
                        <View style={styles.driveModalStatItem}>
                          <Text allowFontScaling={false} style={[styles.driveModalStatLabel, { color: theme.textSecondary }]}>Current</Text>
                          <Text allowFontScaling={false} style={[styles.driveModalStatValue, { color: theme.text }]}>{currentPosition}</Text>
                        </View>
                      );
                    }
                    return null;
                  })()}
                  
                  {selectedDrive.timeElapsed?.displayValue && (
                    <View style={styles.driveModalStatItem}>
                      <Text allowFontScaling={false} style={[styles.driveModalStatLabel, { color: theme.textSecondary }]}>Time</Text>
                      <Text allowFontScaling={false} style={[styles.driveModalStatValue, { color: theme.text }]}>{selectedDrive.timeElapsed.displayValue}</Text>
                    </View>
                  )}
                </View>

                {/* Plays List */}
                <View style={[styles.driveModalPlaysContainer, { backgroundColor: theme.surfaceSecondary }]}>
                  <Text allowFontScaling={false} style={[styles.driveModalPlaysTitle, { color: colors.primary }]}>
                    Plays ({selectedDrive.plays?.length || 0})
                  </Text>
                  <ScrollView style={styles.driveModalPlaysList}>
                    {/* Show loading if drive doesn't have plays data and plays array is empty */}
                    {!selectedDrive.hasPlaysData && (!selectedDrive.plays || selectedDrive.plays.length === 0) ? (
                      <View style={styles.playerStatsLoading}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.textSecondary }]}>Loading plays...</Text>
                      </View>
                    ) : selectedDrive.plays && selectedDrive.plays.length > 0 ? (
                      [...selectedDrive.plays].reverse().map((play, index) => (
                        <View key={index} style={[styles.driveModalPlayItem, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                          <View style={styles.driveModalPlayHeader}>
                            <Text allowFontScaling={false} style={[styles.driveModalPlayNumber, { color: colors.primary }]}>Play {selectedDrive.plays.length - index}</Text>
                            {play.clock?.displayValue && play.period?.number && (
                              <Text allowFontScaling={false} style={[styles.driveModalPlayTime, { color: theme.textSecondary }]}>
                                Q{play.period.number} {play.clock.displayValue}
                              </Text>
                            )}
                          </View>
                          <Text allowFontScaling={false} style={[styles.driveModalPlayText, { color: theme.text }]}>
                            {play.text || 'No description available'}
                          </Text>
                          {/* Down and Yard information similar to scoreboard copycard */}
                          {(() => {
                            const downDistanceText = play.start?.downDistanceText || play.end?.downDistanceText || '';
                            return (downDistanceText || play.scoringPlay || play.type?.text) && (
                              <Text allowFontScaling={false} style={[styles.driveModalPlayYards, { color: theme.textSecondary }]}>
                                {[
                                  downDistanceText,
                                  play.type?.text
                                ].filter(Boolean).join(' • ')}
                              </Text>
                            );
                          })()}
                          
                          {/* Probability indicator in bottom right like scoreboard copy card */}
                          {play.probability?.$ref && (
                            <PlayProbability 
                              probabilityRef={play.probability.$ref}
                              driveTeam={selectedDrive.team}
                              homeTeam={homeTeam?.team}
                              awayTeam={awayTeam?.team}
                            />
                          )}
                        </View>
                      ))
                    ) : (
                      <Text allowFontScaling={false} style={[styles.driveModalNoPlays, { color: theme.textSecondary }]}>No plays available for this drive</Text>
                    )}
                  </ScrollView>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
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
    color: '#013369',
    minWidth: 35,
    textAlign: 'center',
  },
  stickyTeamName: {
    fontSize: 14,
    fontWeight: '600',
    marginHorizontal: 8,
  },
  stickyStatus: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  stickyStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#013369',
    textAlign: 'center',
  },
  stickyClock: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 2,
  },
  stickyPossessionIndicator: {
    fontSize: 12,
    marginHorizontal: 4,
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
  },
  gameHeader: {
    padding: 20,
    marginBottom: 10,
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
  teamLogoContainer: {
    position: 'relative',
    alignItems: 'center',
  },
  teamLogo: {
    width: 50,
    height: 50,
    marginVertical: 8,
  },
  possessionIndicator: {
    fontSize: 12,
    position: 'absolute',
    zIndex: 10,
  },
  awayPossession: {
    right: -5,
    top: -2,
  },
  homePossession: {
    left: -5,
    top: -2,
  },
  teamName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  teamNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
    gap: 5,
  },
  teamScore: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#013369',
    marginBottom: 5,
  },
  losingTeamScore: {
    color: '#999',
  },
  losingTeamName: {
    color: '#999',
  },
  losingStickyTeamScore: {
    color: '#999',
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
    color: '#013369',
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
  // Yard Line Graphics Styles
  yardLineContainer: {
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 15,
  },
  yardLineField: {
    flexDirection: 'row',
    width: '100%',
    height: 40,
    backgroundColor: '#2d5a2d',
    borderRadius: 4,
    alignItems: 'center',
    position: 'relative',
    paddingHorizontal: 5,
  },
  yardLineMark: {
    flex: 1,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.3)',
    height: '100%',
    justifyContent: 'center',
  },
  lastYardLineMark: {
    borderRightWidth: 0,
  },
  yardLineNumber: {
    color: 'white',
    fontSize: 8,
    fontWeight: 'bold',
    textShadow: '1px 1px 1px rgba(0, 0, 0, 0.5)',
  },
  endZoneLogo: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  ballPosition: {
    position: 'absolute',
    top: -5,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ballIcon: {
    fontSize: 16,
  },
  downAndDistance: {
    marginBottom: 10,
    alignItems: 'center',
  },
  downText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#013369',
  },
  possessionText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
    marginTop: 2,
  },
  // Tab Navigation Styles
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 10,
    borderRadius: 8,
    margin: 10,
    overflow: 'hidden',
    elevation: 2,
    boxShadow: '0 2px 3.84px rgba(0, 0, 0, 0.1)',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e9ecef',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    backgroundColor: 'white',
    padding: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  summaryText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  // Linescore styles
  linescoreContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
  },
  linescoreTable: {
    backgroundColor: 'white',
    borderRadius: 6,
    overflow: 'hidden',
  },
  linescoreHeader: {
    flexDirection: 'row',
    backgroundColor: '#e9ecef',
    paddingVertical: 8,
  },
  linescoreHeaderCell: {
    flex: 1,
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 12,
    color: '#495057',
  },
  linescoreRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    paddingVertical: 8,
    alignItems: 'center',
  },
  linescoreTeamContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linescoreTeamLogo: {
    width: 20,
    height: 20,
    marginRight: 5,
  },
  linescoreTeamCell: {
    fontWeight: '600',
    fontSize: 14,
    color: '#333',
  },
  linescoreCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    color: '#333',
  },
  linescoreTotalCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 'bold',
    color: '#013369',
  },
  // Team stats styles
  statsContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
  },
  statsHeader: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#013369',
    marginBottom: 5,
    alignItems: 'center',
  },
  statsTeamHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsTeamLogo: {
    width: 20,
    height: 20,
    marginHorizontal: 5,
  },
  statsTeamName: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#013369',
  },
  statsLabel: {
    flex: 2,
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 14,
    color: '#013369',
  },
  statRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  statAwayValue: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    color: '#333',
  },
  statLabel: {
    flex: 2,
    textAlign: 'center',
    fontSize: 13,
    color: '#666',
  },
  statHomeValue: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    color: '#333',
  },
  // Leaders styles
  leadersContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
  },
  leaderCategory: {
    marginBottom: 15,
    backgroundColor: 'white',
    borderRadius: 6,
    padding: 10,
  },
  leaderCategoryTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#013369',
    textAlign: 'center',
    marginBottom: 10,
  },
  leaderPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  leaderHeadshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 8,
  },
  leaderTeamLogoContainer: {
    alignItems: 'center',
    marginRight: 12,
  },
  leaderTeamLogo: {
    width: 18,
    height: 18,
    marginBottom: 2,
  },
  leaderJerseyNumber: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
  },
  leaderPlayerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  leaderNameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  leaderPlayerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  leaderPlayerPosition: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  leaderStatsContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 80,
  },
  leaderStatsValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#013369',
    textAlign: 'right',
  },
  // Individual Team Content Styles
  teamDetailsContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 15,
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
  },
  teamDetailLogo: {
    width: 60,
    height: 60,
    marginRight: 15,
  },
  teamDetailName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  teamRecord: {
    fontSize: 14,
    color: '#666',
  },
  individualTeamStats: {
    marginBottom: 20,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#013369',
    marginBottom: 10,
  },
  individualStatsContainer: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 10,
  },
  individualStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  individualStatLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  individualStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'right',
  },
  individualTeamLeaders: {
    marginBottom: 10,
  },
  individualLeaderCategory: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  individualLeaderCategoryTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#013369',
    textAlign: 'center',
    marginBottom: 10,
  },
  individualLeaderPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  individualLeaderHeadshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  individualLeaderPlayerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  individualLeaderNameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  individualLeaderPlayerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  individualLeaderPlayerPosition: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  individualLeaderStatsValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#013369',
  },
  // Drives Content Styles
  drivesContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
  },
  drivesScrollView: {
    maxHeight: 600,
  },
  driveCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  driveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  driveTeamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driveTeamLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  driveTeamName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  driveNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#013369',
  },
  driveDetails: {
    marginBottom: 10,
  },
  driveResult: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#013369',
    marginBottom: 5,
  },
  driveDescription: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  driveStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
    paddingVertical: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
  },
  driveStatItem: {
    alignItems: 'center',
  },
  driveStatLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  driveStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  drivePlaysList: {
    marginTop: 10,
  },
  drivePlaysTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#013369',
    marginBottom: 8,
  },
  drivePlayItem: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  drivePlayText: {
    fontSize: 13,
    color: '#333',
    marginBottom: 2,
  },
  drivePlayTime: {
    fontSize: 11,
    color: '#666',
  },
  driveMorePlays: {
    fontSize: 12,
    color: '#013369',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },
  // Team Box Score Styles
  teamBoxScoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  teamBoxScoreLogo: {
    width: 30,
    height: 30,
    marginRight: 12,
    marginTop: -15,
  },
  teamBoxScoreContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
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
    color: '#013369',
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
  placeholderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
    marginBottom: 10,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Player Modal Styles
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
    boxShadow: '0 2px 3.84px rgba(0, 0, 0, 0.25)',
    elevation: 5,
    display: 'flex',
    flexDirection: 'column',
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
    fontSize: 18,
    color: '#666',
    marginBottom: 3,
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
    color: '#013369',
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
  noStatsText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    padding: 40,
  },
  // Drive Yard Line Graphic Styles
  driveYardLineContainer: {
    marginVertical: 15,
    paddingHorizontal: 5,
  },
  driveProgressBar: {
    width: '100%',
    height: 20,
    position: 'relative',
    marginBottom: 10,
  },
  driveBaseBar: {
    width: '100%',
    height: '100%',
    backgroundColor: '#e0e0e0',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  driveProgressFill: {
    position: 'absolute',
    top: 1,
    height: 18,
    borderRadius: 9,
  },
  driveYardLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
  },
  driveYardLabel: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
  },
  driveGradientLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '100%',
  },
  driveGradientSegment: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  driveMarker: {
    position: 'absolute',
    top: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  driveStartMarker: {
    backgroundColor: 'white',
  },
  driveEndMarker: {
    borderColor: 'white',
  },
  driveCurrentMarker: {
    backgroundColor: 'orange',
    borderColor: 'orange',
  },
  driveMarkerText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: 'white',
  },
  tapIndicator: {
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    marginTop: 10,
  },
  tapIndicatorText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  // Drive Modal Styles
  driveModalHeader: {
    marginBottom: 20,
    marginTop: 10,
  },
  driveModalTeamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  driveModalTeamLogo: {
    width: 40,
    height: 40,
    marginRight: 15,
  },
  driveModalTeamName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  driveModalResult: {
    fontSize: 14,
    color: '#013369',
    fontWeight: '600',
  },
  driveModalDescription: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  driveModalDescriptionContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  driveModalStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 15,
    marginVertical: 15,
  },
  driveModalStatItem: {
    alignItems: 'center',
  },
  driveModalStatLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
  },
  driveModalStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  driveModalPlaysContainer: {
    marginTop: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 15,
    maxHeight: 450,
    minHeight: 200,
  },
  driveModalPlaysTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#013369',
    marginBottom: 15,
  },
  driveModalPlaysList: {
    maxHeight: 300,
  },
  driveModalPlayItem: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e1e5e9',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
    elevation: 2,
    position: 'relative',
  },
  driveModalPlayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  driveModalPlayNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#013369',
  },
  driveModalPlayTime: {
    fontSize: 12,
    color: '#666',
  },
  driveModalPlayText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 22,
    marginBottom: 8,
  },
  driveModalPlayYards: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    paddingTop: 5,
  },
  driveModalNoPlays: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    padding: 40,
    fontStyle: 'italic',
  },
  // Probability Styles
  playProbabilityContainer: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  playProbabilityLogo: {
    width: 14,
    height: 14,
    marginRight: 4,
  },
  playProbabilityText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  // Summary Content Styles
  summaryContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
  },
  summaryScrollView: {
    maxHeight: 600,
  },
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  summarySectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#013369',
    marginBottom: 10,
  },
  summaryText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  highlightItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  highlightTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#013369',
    marginBottom: 5,
  },
  highlightDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  newsItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  newsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  newsDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  // Plays Content Styles
  playsContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
  },
  playsScrollView: {
    maxHeight: 600,
  },
  playCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  playHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  playSequence: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#013369',
  },
  playTime: {
    fontSize: 12,
    color: '#666',
  },
  playText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 8,
  },
  playDetails: {
    backgroundColor: '#f8f9fa',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 5,
  },
  playDetailsText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  playFieldPosition: {
    paddingTop: 4,
  },
  playFieldText: {
    fontSize: 12,
    color: '#013369',
    fontStyle: 'italic',
  },
  // New position-specific stats styles
  statCategory: {
    marginBottom: 8,
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamHeaderLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  teamHeaderName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#013369',
  },
  statCategoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  statSubcategoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  footballEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  statCategoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
  },
  debugText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    color: '#777',
    textAlign: 'center',
  },
  // Roster styles
  rosterContainer: {
    padding: 16,
  },
  rosterSection: {
    marginBottom: 20,
  },
  rosterSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#013369',
    marginBottom: 12,
  },
  rosterPlayersList: {
    flex: 1,
  },
  rosterPlayerCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 8,
    minWidth: 100,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  rosterPlayerNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#013369',
    marginBottom: 2,
  },
  rosterPlayerName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 2,
  },
  rosterPlayerPosition: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
  },
  rosterPositionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rosterPosition: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    minWidth: 40,
    textAlign: 'center',
  },
  // Roster table styles
  rosterTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#e9ecef',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginBottom: 5,
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
  rosterTableStatusRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fafafa',
  },
  rosterTableStatusText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  // Down and distance styles
  headerDownAndDistance: {
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  headerDownText: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  headerPossessionText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
});

export default GameDetailsScreen;
