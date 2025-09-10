import React, { useState, useEffect, useRef } from 'react';
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

const GameDetailsScreen = ({ route }) => {
  const { gameId, sport } = route.params;
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
  const [selectedDrive, setSelectedDrive] = useState(null);
  const [driveModalVisible, setDriveModalVisible] = useState(false);
  const [updateInterval, setUpdateInterval] = useState(null);
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [awayRosterData, setAwayRosterData] = useState(null);
  const [homeRosterData, setHomeRosterData] = useState(null);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const stickyHeaderOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadGameDetails();
  }, [gameId]);

  // Separate effect to handle drives preloading after gameDetails is loaded
  useEffect(() => {
    if (gameDetails) {
      const competition = gameDetails.header?.competitions?.[0] || gameDetails.competitions?.[0];
      const status = competition?.status || gameDetails.header?.status;
      const statusDesc = status?.type?.description?.toLowerCase();
      if (!statusDesc?.includes('scheduled')) {
        loadDrives();
      }
    }
  }, [gameDetails]);

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

  useEffect(() => {
    // Set up continuous fetching for live games - only once on mount
    const interval = setInterval(() => {
      if (gameDetails) {
        const competition = gameDetails.header?.competitions?.[0] || gameDetails.competitions?.[0];
        const status = competition?.status || gameDetails.header?.status;
        if (!status?.type?.completed) {
          const statusDesc = status?.type?.description?.toLowerCase();
          const isScheduled = statusDesc?.includes('scheduled');
          
          loadGameDetails(true); // Silent update - this will update all game data including stats
          
          // Only update drives if the drives tab is active OR if we haven't loaded drives yet, and game is not scheduled
          if ((activeTab === 'drives' || !drivesData) && !isScheduled) {
            loadDrives(true); // Silent update drives
          }
          
          // Only load game situation for non-scheduled games
          if (!isScheduled) {
            loadGameSituation(true); // Silent update
          }
        }
      }
    }, 2000);
    
    setUpdateInterval(interval);
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, []); // Empty dependency array - only run once on mount

  // Separate effect to monitor game status and clear interval when game is final
  useEffect(() => {
    if (gameDetails) {
      const competition = gameDetails.header?.competitions?.[0] || gameDetails.competitions?.[0];
      const status = competition?.status || gameDetails.header?.status;
      if (status?.type?.completed && updateInterval) {
        clearInterval(updateInterval);
        setUpdateInterval(null);
        console.log('Game is final, stopping updates');
      }
    }
  }, [gameDetails, updateInterval]); // Only run when gameDetails or updateInterval changes

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
      // Load game situation for in-progress games only (not scheduled)
      if (!status?.type?.completed && !isScheduled) {
        loadGameSituation();
      }
    }
  }, [activeTab, gameId, gameDetails]);

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
      setGameSituation(situation);
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
      
      // Debug team records and status
      const competition = details.header?.competitions?.[0] || details.competitions?.[0];
      const homeTeam = competition?.competitors?.find(c => c.homeAway === 'home');
      const awayTeam = competition?.competitors?.find(c => c.homeAway === 'away');
      
      const status = competition?.status || details.header?.status;
      console.log('Game status:', status?.type?.description);
      console.log('Game details status object:', status);
      console.log('Competition status:', competition?.status);
      console.log('Header status:', details.header?.status);
      
      setGameDetails(details);
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
      const drives = await NFLService.getDrives(gameId);
      
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
      console.log('Fetching game stats for player ID:', player.id, 'in game:', gameId);
      const gameStats = await NFLService.getPlayerGameStats(gameId, player.id);
      console.log('Game stats received:', gameStats);
      
      if (gameStats && gameStats.splits && gameStats.splits.categories) {
        setPlayerStats(gameStats);
      } else {
        // Fallback to season stats if game stats not available
        console.log('Game stats not available, trying season stats');
        const seasonStats = await NFLService.getPlayerStats(player.id);
        console.log('Season stats received:', seasonStats);
        
        if (seasonStats && seasonStats.splits && seasonStats.splits.categories) {
          setPlayerStats(seasonStats);
        } else {
          console.log('No valid stats data received');
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

  const handleDrivePress = (drive) => {
    setSelectedDrive(drive);
    setDriveModalVisible(true);
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
          <View style={styles.driveBaseBar} />
          
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
                transform: [{ translateX: -10 }] // Center the marker
              }
            ]}
          >
            <Text style={[styles.driveMarkerText, { color: teamColor }]}>S</Text>
          </View>
          
          {/* Current/End marker - centered */}
          <View 
            style={[
              styles.driveMarker,
              driveIsInProgress ? styles.driveCurrentMarker : styles.driveEndMarker,
              { 
                left: `${currentPosition}%`, 
                borderColor: driveIsInProgress ? '#FFA500' : teamColor, 
                backgroundColor: driveIsInProgress ? '#FFA500' : teamColor,
                transform: [{ translateX: -10 }] // Center the marker
              }
            ]}
          >
            <Text style={styles.driveMarkerText}>{driveIsInProgress ? 'C' : 'E'}</Text>
          </View>
        </View>
        
        {/* Yard line labels */}
        <View style={styles.driveYardLabels}>
          <Text style={styles.driveYardLabel}>0</Text>
          <Text style={styles.driveYardLabel}>50</Text>
          <Text style={styles.driveYardLabel}>100</Text>
        </View>
      </View>
    );
  };

  // Render position-specific stats like team-page.js
  const renderPositionSpecificStats = (playerStats, position) => {
    if (!playerStats?.splits?.categories) {
      return <Text style={styles.noStatsText}>No detailed statistics available</Text>;
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
                <Text style={styles.statValue}>{displayValue}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            );
          })}
        </View>
      ));
    };

    const renderCategoryHeader = (categoryTitle) => (
      <View style={styles.statCategoryHeader}>
        {teamLogo && (
          <Image 
            source={{ uri: NFLService.convertToHttps(teamLogo) }}
            style={styles.teamHeaderLogo}
            defaultSource={{ uri: 'https://via.placeholder.com/24x24?text=NFL' }}
          />
        )}
        <Text style={styles.teamHeaderName}>{teamName}</Text>
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
    console.log('Player position:', position, 'Type:', typeof position);

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
            <View style={styles.statCategory}>
              <View style={styles.statSubcategoryHeader}>
                <Text style={styles.footballEmoji}>🏈</Text>
                <Text style={styles.statCategoryTitle}>Passing</Text>
              </View>
              {renderStatRow(qbStats, qbLabels)}
            </View>
          )}
          {rushingStats.length > 0 && (
            <View style={styles.statCategory}>
              <View style={styles.statSubcategoryHeader}>
                <Text style={styles.footballEmoji}>🏈</Text>
                <Text style={styles.statCategoryTitle}>Rushing</Text>
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
            <View style={styles.statCategory}>
              <View style={styles.statSubcategoryHeader}>
                <Text style={styles.footballEmoji}>🏈</Text>
                <Text style={styles.statCategoryTitle}>Rushing</Text>
              </View>
              {renderStatRow(rushingStats, ['CAR', 'RUSH YDS', 'YDS/CAR', 'RUSH TD', 'LNG'])}
            </View>
          )}
          {receivingStats.length > 0 && (
            <View style={styles.statCategory}>
              <View style={styles.statSubcategoryHeader}>
                <Text style={styles.footballEmoji}>🏈</Text>
                <Text style={styles.statCategoryTitle}>Receiving</Text>
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
            <View style={styles.statCategory}>
              <View style={styles.statSubcategoryHeader}>
                <Text style={styles.footballEmoji}>🏈</Text>
                <Text style={styles.statCategoryTitle}>Receiving</Text>
              </View>
              {renderStatRow(receivingStats, ['REC', 'REC YDS', 'YDS/REC', 'REC TD', 'LNG', 'TGT'])}
            </View>
          )}
          {rushingStats.length > 0 && (
            <View style={styles.statCategory}>
              <View style={styles.statSubcategoryHeader}>
                <Text style={styles.footballEmoji}>🏈</Text>
                <Text style={styles.statCategoryTitle}>Rushing</Text>
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
            <View style={styles.statCategory}>
              <View style={styles.statSubcategoryHeader}>
                <Text style={styles.footballEmoji}>🏈</Text>
                <Text style={styles.statCategoryTitle}>Defensive</Text>
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
                <Text style={styles.footballEmoji}>🏈</Text>
                <Text style={styles.statCategoryTitle}>Defensive</Text>
              </View>
              {renderStatRow(defensiveStats, ['TOT TCKL', 'SOLO', 'PD', 'QB HIT'])}
            </View>
          )}
          {interceptionStats.length > 0 && (
            <View style={styles.statCategory}>
              <View style={styles.statSubcategoryHeader}>
                <Text style={styles.footballEmoji}>🏈</Text>
                <Text style={styles.statCategoryTitle}>Interceptions</Text>
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
                <Text style={styles.footballEmoji}>🏈</Text>
                <Text style={styles.statCategoryTitle}>Kicking</Text>
              </View>
              {renderStatRow(kickingStats, ['FG MADE/ATT', 'FG PCT', 'LNG', 'XP MADE/ATT', 'KICK PTS'])}
            </View>
          )}
          {puntingStats.length > 0 && (
            <View style={styles.statCategory}>
              <View style={styles.statSubcategoryHeader}>
                <Text style={styles.footballEmoji}>🏈</Text>
                <Text style={styles.statCategoryTitle}>Punting</Text>
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
            
            console.log('Category:', category.name, 'Labels:', category.labels, 'Stats:', category.stats);
            
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
                  <Text style={styles.footballEmoji}>🏈</Text>
                  <Text style={styles.statCategoryTitle}>{formatCategoryName(category.displayName || category.name)}</Text>
                </View>
                {category.stats && category.stats.length > 0 ? (
                  renderStatRow(category.stats, statLabels)
                ) : (
                  <Text style={styles.noStatsText}>No stats available</Text>
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#013369" />
        <Text style={styles.loadingText}>Loading Game Details...</Text>
      </View>
    );
  }

  if (!gameDetails) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Game details not available</Text>
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
    return isLosing ? [styles.teamScore, styles.losingTeamScore] : styles.teamScore;
  };

  const getTeamNameStyle = (isLosing) => {
    return isLosing ? [styles.teamName, styles.losingTeamName] : styles.teamName;
  };

  const getStickyTeamScoreStyle = (isLosing) => {
    return isLosing ? [styles.stickyTeamScore, styles.losingStickyTeamScore] : styles.stickyTeamScore;
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
            <View key={index} style={styles.statRow}>
              <Text style={styles.statAwayValue}>{awayValue}</Text>
              <Text style={styles.statLabel}>{statConfig.label}</Text>
              <Text style={styles.statHomeValue}>{homeValue}</Text>
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
            <View key={categoryIndex} style={styles.leaderCategory}>
              <Text style={styles.leaderCategoryTitle}>{awayCategoryData.displayName || category}</Text>
              
              {/* Away Team Leader Row */}
              <View style={styles.leaderPlayerRow}>
                <View style={styles.leaderTeamLogoContainer}>
                  <Image 
                    source={{ uri: NFLService.convertToHttps(awayTeam?.team?.logo || awayTeam?.team?.logos?.[0]?.href) }}
                    style={styles.leaderTeamLogo}
                    defaultSource={{ uri: 'https://via.placeholder.com/20x20?text=NFL' }}
                  />
                  <Text style={styles.leaderJerseyNumber}>{awayLeader.athlete?.jersey || '#'}</Text>
                </View>
                <Image 
                  source={{ uri: awayLeader.athlete?.headshot?.href || 'https://via.placeholder.com/40x40?text=P' }}
                  style={styles.leaderHeadshot}
                  defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=P' }}
                />
                <View style={styles.leaderPlayerInfo}>
                  <View style={styles.leaderNameRow}>
                    <Text style={styles.leaderPlayerName}>{awayLeader.athlete?.shortName || awayLeader.athlete?.displayName}</Text>
                    <Text style={styles.leaderPlayerPosition}> {awayLeader.athlete?.position?.abbreviation}</Text>
                  </View>
                  <Text style={styles.leaderStatsValue}>{awayLeader.displayValue}</Text>
                </View>
              </View>

              {/* Home Team Leader Row */}
              <View style={styles.leaderPlayerRow}>
                <View style={styles.leaderTeamLogoContainer}>
                  <Image 
                    source={{ uri: NFLService.convertToHttps(homeTeam?.team?.logo || homeTeam?.team?.logos?.[0]?.href) }}
                    style={styles.leaderTeamLogo}
                    defaultSource={{ uri: 'https://via.placeholder.com/20x20?text=NFL' }}
                  />
                  <Text style={styles.leaderJerseyNumber}>{homeLeader.athlete?.jersey || '#'}</Text>
                </View>
                <Image 
                  source={{ uri: homeLeader.athlete?.headshot?.href || 'https://via.placeholder.com/40x40?text=P' }}
                  style={styles.leaderHeadshot}
                  defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=P' }}
                />
                <View style={styles.leaderPlayerInfo}>
                  <View style={styles.leaderNameRow}>
                    <Text style={styles.leaderPlayerName}>{homeLeader.athlete?.shortName || homeLeader.athlete?.displayName}</Text>
                    <Text style={styles.leaderPlayerPosition}> {homeLeader.athlete?.position?.abbreviation}</Text>
                  </View>
                  <Text style={styles.leaderStatsValue}>{homeLeader.displayValue}</Text>
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
            <View key={index} style={styles.individualStatRow}>
              <Text style={styles.individualStatLabel}>{statConfig.label}</Text>
              <Text style={styles.individualStatValue}>{value}</Text>
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
              <Text style={styles.individualLeaderCategoryTitle}>{categoryData.displayName || category}</Text>
              
              <View style={styles.individualLeaderPlayerRow}>
                <Image 
                  source={{ uri: leader.athlete?.headshot?.href || 'https://via.placeholder.com/40x40?text=P' }}
                  style={styles.individualLeaderHeadshot}
                  defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=P' }}
                />
                <View style={styles.individualLeaderPlayerInfo}>
                  <View style={styles.individualLeaderNameRow}>
                    <Text style={styles.individualLeaderPlayerName}>
                      {leader.athlete?.shortName || leader.athlete?.displayName}
                    </Text>
                    <Text style={styles.individualLeaderPlayerPosition}>
                      {leader.athlete?.position?.abbreviation}
                    </Text>
                  </View>
                  <Text style={styles.individualLeaderStatsValue}>{leader.displayValue}</Text>
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
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Line Score</Text>
        <View style={styles.linescoreContainer}>
          <View style={styles.linescoreTable}>
            <View style={styles.linescoreHeader}>
              <Text style={styles.linescoreHeaderCell}></Text>
              <Text style={styles.linescoreHeaderCell}>1</Text>
              <Text style={styles.linescoreHeaderCell}>2</Text>
              <Text style={styles.linescoreHeaderCell}>3</Text>
              <Text style={styles.linescoreHeaderCell}>4</Text>
              <Text style={styles.linescoreHeaderCell}>T</Text>
            </View>
            <View style={styles.linescoreRow}>
              <View style={styles.linescoreTeamContainer}>
                <Image 
                  source={{ uri: NFLService.convertToHttps(awayTeam?.team?.logo || awayTeam?.team?.logos?.[0]?.href) }}
                  style={styles.linescoreTeamLogo}
                  defaultSource={{ uri: 'https://via.placeholder.com/20x20?text=NFL' }}
                />
                <Text style={styles.linescoreTeamCell}>{awayTeam?.team?.abbreviation}</Text>
              </View>
              {[0, 1, 2, 3].map(quarterIndex => {
                const score = awayTeam?.linescores?.[quarterIndex]?.displayValue || "-";
                return <Text key={quarterIndex} style={styles.linescoreCell}>{score}</Text>;
              })}
              <Text style={styles.linescoreTotalCell}>{awayTeam?.score || '0'}</Text>
            </View>
            <View style={styles.linescoreRow}>
              <View style={styles.linescoreTeamContainer}>
                <Image 
                  source={{ uri: NFLService.convertToHttps(homeTeam?.team?.logo || homeTeam?.team?.logos?.[0]?.href) }}
                  style={styles.linescoreTeamLogo}
                  defaultSource={{ uri: 'https://via.placeholder.com/20x20?text=NFL' }}
                />
                <Text style={styles.linescoreTeamCell}>{homeTeam?.team?.abbreviation}</Text>
              </View>
              {[0, 1, 2, 3].map(quarterIndex => {
                const score = homeTeam?.linescores?.[quarterIndex]?.displayValue || "-";
                return <Text key={quarterIndex} style={styles.linescoreCell}>{score}</Text>;
              })}
              <Text style={styles.linescoreTotalCell}>{homeTeam?.score || '0'}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Team Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Team Statistics</Text>
        <View style={styles.statsContainer}>
          <View style={styles.statsHeader}>
            <View style={styles.statsTeamHeader}>
              <Image 
                source={{ uri: NFLService.convertToHttps(awayTeam?.team?.logo || awayTeam?.team?.logos?.[0]?.href) }}
                style={styles.statsTeamLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/20x20?text=NFL' }}
              />
              <Text style={styles.statsTeamName}>{awayTeam?.team?.abbreviation}</Text>
            </View>
            <Text style={styles.statsLabel}>Stat</Text>
            <View style={styles.statsTeamHeader}>
              <Text style={styles.statsTeamName}>{homeTeam?.team?.abbreviation}</Text>
              <Image 
                source={{ uri: NFLService.convertToHttps(homeTeam?.team?.logo || homeTeam?.team?.logos?.[0]?.href) }}
                style={styles.statsTeamLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/20x20?text=NFL' }}
              />
            </View>
          </View>
          {gameDetails.boxscore?.teams && renderTeamStats(gameDetails.boxscore.teams)}
        </View>
      </View>

      {/* Game/Team Leaders */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {(() => {
            const statusDesc = status?.type?.description?.toLowerCase();
            console.log('Status description for leaders:', statusDesc);
            return statusDesc?.includes('scheduled') ? 'Team Leaders' : 'Game Leaders';
          })()}
        </Text>
        <View style={styles.leadersContainer}>
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
        <View style={styles.rosterContainer}>
          <ActivityIndicator size="small" color="#013369" />
          <Text style={styles.placeholderText}>Loading roster...</Text>
        </View>
      );
    }

    if (!rosterData?.athletes) {
      return (
        <View style={styles.rosterContainer}>
          <Text style={styles.placeholderText}>Roster data not available</Text>
        </View>
      );
    }

    return (
      <View style={styles.rosterContainer}>
        {rosterData.athletes
          .filter(positionGroup => 
            positionGroup.position !== 'practiceSquad' && 
            positionGroup.items && 
            positionGroup.items.length > 0
          )
          .map((positionGroup, groupIndex) => (
          <View key={groupIndex} style={styles.rosterSection}>
            <Text style={styles.rosterSectionTitle}>
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
                    <View style={styles.rosterTableRow}>
                      <View style={styles.rosterTablePlayerCell}>
                        <Text style={styles.rosterTablePlayerName}>
                          {player.displayName || `${player.firstName || ''} ${player.lastName || ''}`.trim()}
                        </Text>
                        <Text style={styles.rosterTablePlayerDetails}>
                          <Text style={styles.rosterTablePlayerNumber}>#{player.jersey || 'N/A'}</Text> • {player.position?.abbreviation || positionGroup.position || 'N/A'}
                        </Text>
                      </View>
                    </View>
                    
                    {/* Status Row */}
                    <View style={styles.rosterTableStatusRow}>
                      <Text style={[styles.rosterTableStatusText, { color: statusColor }]}>
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
    console.log('Status description for team content:', statusDesc);
    console.log('Is scheduled (team content):', isScheduled);
    const sectionTitle = isScheduled ? 'Roster' : 'Box Score';
    
    if (!gameDetails.boxscore?.players && !isScheduled) {
      return (
        <View style={styles.section}>
          <View style={styles.teamBoxScoreHeader}>
            <Image 
              source={{ uri: NFLService.convertToHttps(team?.team?.logo || team?.team?.logos?.[0]?.href) }}
              style={styles.teamBoxScoreLogo}
              defaultSource={{ uri: 'https://via.placeholder.com/30x30?text=NFL' }}
            />
            <Text style={styles.sectionTitle}>{team?.team?.displayName || team?.team?.name} {sectionTitle}</Text>
          </View>
          <Text style={styles.placeholderText}>Box score data not available</Text>
        </View>
      );
    }

    // For scheduled games, show roster instead of box score
    if (isScheduled) {
      return (
        <View style={styles.section}>
          <View style={styles.teamBoxScoreHeader}>
            <Image 
              source={{ uri: NFLService.convertToHttps(team?.team?.logo || team?.team?.logos?.[0]?.href) }}
              style={styles.teamBoxScoreLogo}
              defaultSource={{ uri: 'https://via.placeholder.com/30x30?text=NFL' }}
            />
            <Text style={styles.sectionTitle}>{team?.team?.displayName || team?.team?.name} {sectionTitle}</Text>
          </View>
          <View style={styles.teamBoxScoreContainer}>
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
        <View style={styles.section}>
          <View style={styles.teamBoxScoreHeader}>
            <Image 
              source={{ uri: NFLService.convertToHttps(team?.team?.logo || team?.team?.logos?.[0]?.href) }}
              style={styles.teamBoxScoreLogo}
              defaultSource={{ uri: 'https://via.placeholder.com/30x30?text=NFL' }}
            />
            <Text style={styles.sectionTitle}>{team?.team?.displayName || team?.team?.name} {sectionTitle}</Text>
          </View>
          <Text style={styles.placeholderText}>No statistics available for this team</Text>
        </View>
      );
    }

    return (
      <View style={styles.section}>
        <View style={styles.teamBoxScoreHeader}>
          <Image 
            source={{ uri: NFLService.convertToHttps(team?.team?.logo || team?.team?.logos?.[0]?.href) }}
            style={styles.teamBoxScoreLogo}
            defaultSource={{ uri: 'https://via.placeholder.com/30x30?text=NFL' }}
          />
          <Text style={styles.sectionTitle}>{team?.team?.displayName || team?.team?.name} {sectionTitle}</Text>
        </View>
        <View style={styles.teamBoxScoreContainer}>
          {teamBoxScore.statistics.map((statCategory, categoryIndex) => {
            if (!statCategory.athletes || statCategory.athletes.length === 0) return null;

            return (
              <View key={categoryIndex} style={styles.statCategoryContainer}>
                <Text style={styles.statCategoryTitle}>
                  {statCategory.text || statCategory.name.charAt(0).toUpperCase() + statCategory.name.slice(1)}
                </Text>
                
                {/* Header */}
                <View style={styles.statTableHeader}>
                  <Text style={styles.statTableHeaderPlayer}>Player</Text>
                  {(statCategory.labels || []).slice(0, 4).map((label, labelIndex) => (
                    <Text key={labelIndex} style={styles.statTableHeaderStat}>{label}</Text>
                  ))}
                </View>

                {/* Players */}
                {statCategory.athletes.map((playerData, playerIndex) => {
                  const player = playerData.athlete;
                  const stats = playerData.stats || [];

                  return (
                    <TouchableOpacity 
                      key={playerIndex} 
                      style={styles.statTableRow}
                      onPress={() => handlePlayerPress(player, statCategory, team)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.statTablePlayerCell}>
                        <Text style={styles.statTablePlayerName} numberOfLines={1}>
                          {player.firstName ? `${player.firstName.charAt(0)}. ` : ''}{player.lastName || player.displayName || 'Unknown'}
                        </Text>
                        <Text style={styles.statTablePlayerNumber}>#{player.jersey || 'N/A'}</Text>
                      </View>
                      {stats.slice(0, 4).map((stat, statIndex) => (
                        <Text key={statIndex} style={styles.statTableStatCell}>{stat || '0'}</Text>
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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Drive Information</Text>
          <View style={styles.drivesContainer}>
            <ActivityIndicator size="small" color="#013369" />
            <Text style={styles.placeholderText}>Loading drives...</Text>
          </View>
        </View>
      );
    }

    if (!drivesData || !drivesData.length) {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Drive Information</Text>
          <View style={styles.drivesContainer}>
            <Text style={styles.placeholderText}>
              No drive information available for this game
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Drive Information</Text>
        <ScrollView style={styles.drivesScrollView}>
          {[...drivesData].reverse().map((drive, index) => {
            const driveNumber = drivesData.length - index;
            
            return (
              <TouchableOpacity 
                key={`drive-${drive.id || index}`}
                style={styles.driveCard}
                onPress={() => handleDrivePress(drive)}
                activeOpacity={0.7}
              >
                <View style={styles.driveHeader}>
                  <View style={styles.driveTeamInfo}>
                    {drive.team?.logos?.[0]?.href && (
                      <Image 
                        source={{ uri: NFLService.convertToHttps(drive.team.logos[0]?.href) }}
                        style={styles.driveTeamLogo}
                        defaultSource={{ uri: 'https://via.placeholder.com/24x24?text=NFL' }}
                      />
                    )}
                    <Text style={styles.driveTeamName}>{drive.team?.displayName || 'Unknown Team'}</Text>
                  </View>
                  <Text style={styles.driveNumber}>Drive {driveNumber}</Text>
                </View>

                <View style={styles.driveDetails}>
                  <Text style={styles.driveResult}>{drive.displayResult || drive.result || 'In Progress'}</Text>
                  {drive.description && (
                    <Text style={styles.driveDescription}>{drive.description}</Text>
                  )}
                </View>

                {/* Visual Yard Line Display */}
                {renderDriveYardLine(drive, awayTeam, homeTeam)}

                <View style={styles.driveStats}>
                  <View style={styles.driveStatItem}>
                    <Text style={styles.driveStatLabel}>Start</Text>
                    <Text style={styles.driveStatValue}>{drive.start?.text || 'N/A'}</Text>
                  </View>
                  
                  {/* Show End for completed drives or Current for drives in progress */}
                  {(() => {
                    const driveEnded = drive.end?.text;
                    
                    if (driveEnded) {
                      return (
                        <View style={styles.driveStatItem}>
                          <Text style={styles.driveStatLabel}>End</Text>
                          <Text style={styles.driveStatValue}>{drive.end.text}</Text>
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
                            currentPosition = `${drive.team?.abbreviation} ${yardLine}`;
                          }
                        }
                      }
                      
                      // Fallback to start position if no current found
                      if (currentPosition === 'N/A' && drive.start?.text) {
                        currentPosition = drive.start.text;
                      }
                      
                      return (
                        <View style={styles.driveStatItem}>
                          <Text style={styles.driveStatLabel}>Current</Text>
                          <Text style={styles.driveStatValue}>{currentPosition}</Text>
                        </View>
                      );
                    }
                  })()}
                  
                  {drive.timeElapsed?.displayValue && (
                    <View style={styles.driveStatItem}>
                      <Text style={styles.driveStatLabel}>Time</Text>
                      <Text style={styles.driveStatValue}>{drive.timeElapsed.displayValue}</Text>
                    </View>
                  )}
                  {drive.plays && drive.plays.length > 0 && (
                    <View style={styles.driveStatItem}>
                      <Text style={styles.driveStatLabel}>Plays</Text>
                      <Text style={styles.driveStatValue}>{drive.plays.length}</Text>
                    </View>
                  )}
                </View>

                {/* Tap indicator */}
                <View style={styles.tapIndicator}>
                  <Text style={styles.tapIndicatorText}>Tap to view plays</Text>
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
          <Text style={styles.sectionTitle}>Game Summary</Text>
          <View style={styles.summaryContainer}>
            <ActivityIndicator size="small" color="#013369" />
            <Text style={styles.placeholderText}>Loading summary...</Text>
          </View>
        </View>
      );
    }

    if (!summaryData) {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Game Summary</Text>
          <View style={styles.summaryContainer}>
            <Text style={styles.placeholderText}>
              No summary information available for this game
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Game Summary</Text>
        <ScrollView style={styles.summaryScrollView}>
          {/* Game Recap */}
          {summaryData.recap && (
            <View style={styles.summaryCard}>
              <Text style={styles.summarySectionTitle}>Recap</Text>
              <Text style={styles.summaryText}>
                {summaryData.recap.headline || summaryData.recap.description || 'No recap available'}
              </Text>
            </View>
          )}

          {/* Highlights */}
          {summaryData.highlights && summaryData.highlights.length > 0 && (
            <View style={styles.summaryCard}>
              <Text style={styles.summarySectionTitle}>Highlights</Text>
              {summaryData.highlights.map((highlight, index) => (
                <View key={index} style={styles.highlightItem}>
                  <Text style={styles.highlightTitle}>{highlight.headline || highlight.title}</Text>
                  <Text style={styles.highlightDescription}>
                    {highlight.description || 'No description available'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* News */}
          {summaryData.news && summaryData.news.length > 0 && (
            <View style={styles.summaryCard}>
              <Text style={styles.summarySectionTitle}>News</Text>
              {summaryData.news.slice(0, 3).map((article, index) => (
                <View key={index} style={styles.newsItem}>
                  <Text style={styles.newsTitle}>{article.headline}</Text>
                  <Text style={styles.newsDescription}>
                    {article.description || 'No description available'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Win Probability */}
          {summaryData.winprobability && (
            <View style={styles.summaryCard}>
              <Text style={styles.summarySectionTitle}>Win Probability</Text>
              <Text style={styles.summaryText}>
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
          <Text style={styles.sectionTitle}>Play-by-Play</Text>
          <View style={styles.playsContainer}>
            <ActivityIndicator size="small" color="#013369" />
            <Text style={styles.placeholderText}>Loading plays...</Text>
          </View>
        </View>
      );
    }

    if (!playsData || playsData.length === 0) {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Play-by-Play</Text>
          <View style={styles.playsContainer}>
            <Text style={styles.placeholderText}>
              No play-by-play information available for this game
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Play-by-Play</Text>
        <ScrollView style={styles.playsScrollView}>
          {playsData.reverse().map((play, index) => (
            <View key={`play-${play.id || index}`} style={styles.playCard}>
              <View style={styles.playHeader}>
                <Text style={styles.playSequence}>Play {playsData.length - index}</Text>
                {play.clock?.displayValue && play.period?.number && (
                  <Text style={styles.playTime}>
                    Q{play.period.number} {play.clock.displayValue}
                  </Text>
                )}
              </View>
              
              <Text style={styles.playText}>
                {play.text || 'No play description available'}
              </Text>
              
              {/* Down and Distance Info */}
              {(play.down?.number || play.distance?.yards || play.type?.text) && (
                <View style={styles.playDetails}>
                  <Text style={styles.playDetailsText}>
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
                  <Text style={styles.playFieldText}>
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
          }
        ]}
        pointerEvents={showStickyHeader ? 'auto' : 'none'}
      >
        {/* Away Team */}
        <View style={styles.stickyTeamAway}>
          <Image 
            source={{ uri: NFLService.convertToHttps(awayTeam?.team?.logo || awayTeam?.team?.logos?.[0]?.href) }} 
            style={styles.stickyTeamLogo} 
            defaultSource={{ uri: 'https://via.placeholder.com/30x30?text=NFL' }}
          />
          <Text style={getStickyTeamScoreStyle(isAwayTeamLosing)}>{awayTeam?.score || '0'}</Text>
          {/* Possession indicator for away team */}
          {gameSituation?.possession === awayTeam?.id && 
           status?.type?.description !== 'Halftime' && (
            <Text style={styles.stickyPossessionIndicator}>🏈</Text>
          )}
        </View>

        {/* Status and Time */}
        <View style={styles.stickyStatus}>
          <Text style={styles.stickyStatusText}>
            {status?.type?.completed ? 'Final' :
             status?.type?.description === 'Halftime' ? 'Halftime' :
             status?.period && status?.period > 0 && !status?.type?.completed ? 
             (status.period <= 4 ? `${['1st', '2nd', '3rd', '4th'][status.period - 1]} Quarter` : `OT ${status.period - 4}`) :
             status?.type?.description || status?.type?.name || 'Scheduled'}
          </Text>
          {/* Show clock for in-progress games or start time for scheduled games */}
          {status?.displayClock && !status?.type?.completed && status?.type?.description !== 'Halftime' ? (
            <Text style={styles.stickyClock}>
              {status.displayClock}
            </Text>
          ) : (!status?.type?.completed && !status?.period && gameDate) ? (
            <Text style={styles.stickyClock}>
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
          {gameSituation?.possession === homeTeam?.id && 
           status?.type?.description !== 'Halftime' && (
            <Text style={styles.stickyPossessionIndicator}>🏈</Text>
          )}
          <Text style={getStickyTeamScoreStyle(isHomeTeamLosing)}>{homeTeam?.score || '0'}</Text>
          <Image 
            source={{ uri: NFLService.convertToHttps(homeTeam?.team?.logo || homeTeam?.team?.logos?.[0]?.href) }} 
            style={styles.stickyTeamLogo} 
            defaultSource={{ uri: 'https://via.placeholder.com/30x30?text=NFL' }}
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
    <View style={styles.container}>
      {/* Sticky Header - Always render but animated */}
      {renderStickyHeader()}
      
      {/* Main Content */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
      {/* Game Header */}
      <View style={styles.gameHeader}>
        <View style={styles.teamContainer}>
          {/* Away Team */}
          <View style={styles.team}>
            <Text style={getTeamScoreStyle(isAwayTeamLosing)}>{awayTeam?.score || '0'}</Text>
            <View style={styles.teamLogoContainer}>
              <Image 
                source={{ uri: NFLService.convertToHttps(awayTeam?.team?.logo || awayTeam?.team?.logos?.[0]?.href) }} 
                style={styles.teamLogo} 
                defaultSource={{ uri: 'https://via.placeholder.com/60x60?text=NFL' }}
              />
            </View>
            <View style={styles.teamNameContainer}>
              <Text style={getTeamNameStyle(isAwayTeamLosing)}>{awayTeam?.team?.abbreviation || awayTeam?.team?.shortDisplayName || awayTeam?.team?.name}</Text>
              {/* Possession indicator for away team (not during halftime) */}
              {gameSituation?.possession === awayTeam?.id && 
               status?.type?.description !== 'Halftime' && (
                <Text style={[styles.possessionIndicator, styles.awayPossession]}>🏈</Text>
              )}
            </View>
          </View>

          {/* VS/Quarter Info */}
          <View style={styles.vsContainer}>
            <Text style={styles.vsText}>VS</Text>
            <Text style={styles.gameStatus}>
              {status?.type?.completed ? 'Final' :
               status?.type?.description === 'Halftime' ? 'Halftime' :
               status?.period && status?.period > 0 && !status?.type?.completed ? 
               (status.period <= 4 ? `${['1st', '2nd', '3rd', '4th'][status.period - 1]} Quarter` : `OT ${status.period - 4}`) :
               status?.type?.description || status?.type?.name || 'Scheduled'}
            </Text>
            {/* Show clock for in-progress games or start time for scheduled games */}
            {status?.displayClock && !status?.type?.completed && status?.type?.description !== 'Halftime' ? (
              <Text style={styles.gameClock}>
                {status.displayClock}
              </Text>
            ) : (!status?.type?.completed && !status?.period && gameDate) ? (
              <Text style={styles.gameClock}>
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
            <Text style={getTeamScoreStyle(isHomeTeamLosing)}>{homeTeam?.score || '0'}</Text>
            <View style={styles.teamLogoContainer}>
              <Image 
                source={{ uri: NFLService.convertToHttps(homeTeam?.team?.logo || homeTeam?.team?.logos?.[0]?.href) }} 
                style={styles.teamLogo} 
                defaultSource={{ uri: 'https://via.placeholder.com/60x60?text=NFL' }}
              />
            </View>
            <View style={styles.teamNameContainer}>
              <Text style={getTeamNameStyle(isHomeTeamLosing)}>{homeTeam?.team?.abbreviation || homeTeam?.team?.shortDisplayName || homeTeam?.team?.name}</Text>
              {/* Possession indicator for home team (not during halftime) */}
              {gameSituation?.possession === homeTeam?.id && 
               status?.type?.description !== 'Halftime' && (
                <Text style={[styles.possessionIndicator, styles.homePossession]}>🏈</Text>
              )}
            </View>
          </View>
        </View>

        {/* Game Info or Yard Line */}
        {!status?.type?.completed && status?.period && status?.period > 0 ? (
          <View style={styles.yardLineContainer}>
            {/* Down and Distance Info - only show if not halftime and have valid data */}
            {status?.type?.description !== 'Halftime' && 
             gameSituation && 
             gameSituation.down && gameSituation.down > 0 && 
             gameSituation.distance !== undefined && gameSituation.distance !== null &&
             gameSituation.yardLine && typeof gameSituation.yardLine === 'number' && (
              <View style={styles.downAndDistance}>
                <Text style={styles.downText}>
                  {gameSituation.shortDownDistanceText || 
                   `${['1st', '2nd', '3rd', '4th'][gameSituation.down - 1]} & ${gameSituation.distance}`}
                </Text>
                {gameSituation.possessionText && (
                  <Text style={styles.possessionText}>
                    {gameSituation.possessionText}
                  </Text>
                )}
              </View>
            )}
            
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
                      <Image 
                        source={{ uri: NFLService.convertToHttps(awayTeam?.team?.logo || awayTeam?.team?.logos?.[0]?.href) }} 
                        style={styles.endZoneLogo} 
                      />
                    ) : isRightEndZone ? (
                      // Home team end zone (right)
                      <Image 
                        source={{ uri: NFLService.convertToHttps(homeTeam?.team?.logo || homeTeam?.team?.logos?.[0]?.href) }} 
                        style={styles.endZoneLogo} 
                      />
                    ) : (
                      <Text style={styles.yardLineNumber}>
                        {yard}
                      </Text>
                    )}
                  </View>
                );
              })}
              
              {/* Ball position indicator - only show if not halftime and we have valid yard line data */}
              {status?.type?.description !== 'Halftime' &&
               gameSituation && 
               gameSituation.yardLine && 
               typeof gameSituation.yardLine === 'number' && 
               gameSituation.yardLine >= 0 && 
               gameSituation.yardLine <= 100 && (
                <View 
                  style={[
                    styles.ballPosition, 
                    { left: `${Math.max(2, Math.min(98, gameSituation.yardLine))}%` }
                  ]}
                >
                  <Text style={styles.ballIcon}>🏈</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.gameInfo}>
            <Text style={styles.venue}>
              {venue || competition?.venue || 'TBD'}
            </Text>
            <Text style={styles.date}>
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
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'stats' && styles.activeTabButton]}
          onPress={() => setActiveTab('stats')}
        >
          <Text style={[styles.tabText, activeTab === 'stats' && styles.activeTabText]}>Stats</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'away' && styles.activeTabButton]}
          onPress={() => setActiveTab('away')}
        >
          <Text style={[styles.tabText, activeTab === 'away' && styles.activeTabText]}>Away</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'home' && styles.activeTabButton]}
          onPress={() => setActiveTab('home')}
        >
          <Text style={[styles.tabText, activeTab === 'home' && styles.activeTabText]}>Home</Text>
        </TouchableOpacity>
        {/* Only show drives tab for non-scheduled games */}
        {(() => {
          const statusDesc = status?.type?.description?.toLowerCase();
          console.log('Status description for drives tab:', statusDesc);
          const isScheduled = statusDesc?.includes('scheduled');
          console.log('Is scheduled (drives tab):', isScheduled);
          return !isScheduled;
        })() && (
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'drives' && styles.activeTabButton]}
            onPress={() => setActiveTab('drives')}
          >
            <Text style={[styles.tabText, activeTab === 'drives' && styles.activeTabText]}>Drives</Text>
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
          <View style={styles.modalContent}>
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
                      uri: NFLService.convertToHttps(selectedPlayer.headshot?.href || selectedPlayer.headshot) 
                    }}
                    style={styles.playerHeadshot}
                    defaultSource={{ uri: 'https://via.placeholder.com/80x80?text=Player' }}
                  />
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>
                      {selectedPlayer.displayName || `${selectedPlayer.firstName || ''} ${selectedPlayer.lastName || ''}`.trim()} <Text style={styles.playerDetails}>#{selectedPlayer.jersey || 'N/A'}</Text>
                    </Text>
                    <View style={styles.playerTeamInfo}>
                      {(selectedPlayer.team?.team?.logo || selectedPlayer.team?.team?.logos?.[0]?.href) && (
                        <Image 
                          source={{ uri: NFLService.convertToHttps(selectedPlayer.team.team.logo || selectedPlayer.team.team.logos?.[0]?.href) }}
                          style={styles.playerTeamLogo}
                          defaultSource={{ uri: 'https://via.placeholder.com/20x20?text=NFL' }}
                        />
                      )}
                      <Text style={styles.playerTeamName}>
                        {selectedPlayer.team?.team?.displayName || selectedPlayer.team?.team?.name || selectedPlayer.team?.team?.abbreviation || 'No team info'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Player Stats */}
                <View style={styles.playerStatsContainer}>
                  {loadingPlayerStats ? (
                    <View style={styles.playerStatsLoading}>
                      <ActivityIndicator size="large" color="#013369" />
                      <Text style={styles.loadingText}>Loading player stats...</Text>
                    </View>
                  ) : playerStats ? (
                    <View style={styles.playerStatsContent}>
                      {renderPositionSpecificStats(playerStats, selectedPlayer?.position?.abbreviation || selectedPlayer?.position)}
                    </View>
                  ) : (
                    <Text style={styles.noStatsText}>Unable to load player statistics</Text>
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
          <View style={styles.modalContent}>
            {/* Close Button */}
            <TouchableOpacity style={styles.modalCloseButton} onPress={closeDriveModal}>
              <Text style={styles.modalCloseText}>×</Text>
            </TouchableOpacity>

            {selectedDrive && (
              <>
                {/* Drive Header */}
                <View style={styles.driveModalHeader}>
                  <View style={styles.driveModalTeamInfo}>
                    {selectedDrive.team?.logos?.[0]?.href && (
                      <Image 
                        source={{ uri: NFLService.convertToHttps(selectedDrive.team.logos[0].href) }}
                        style={styles.driveModalTeamLogo}
                        defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=NFL' }}
                      />
                    )}
                    <View>
                      <Text style={styles.driveModalTeamName}>{selectedDrive.team?.displayName || 'Unknown Team'}</Text>
                      <Text style={styles.driveModalResult}>{selectedDrive.displayResult || selectedDrive.result || 'In Progress'}</Text>
                    </View>
                  </View>
                  <View style={styles.driveModalDescriptionContainer}>
                    <Text style={styles.driveModalDescription}>
                      {getDriveSummary(selectedDrive)}
                    </Text>
                  </View>
                </View>

                {/* Drive Visual */}
                {renderDriveYardLine(selectedDrive, awayTeam, homeTeam)}

                {/* Drive Stats */}
                <View style={styles.driveModalStats}>
                  <View style={styles.driveModalStatItem}>
                    <Text style={styles.driveModalStatLabel}>Start</Text>
                    <Text style={styles.driveModalStatValue}>{selectedDrive.start?.text || 'N/A'}</Text>
                  </View>
                  
                  {/* Show End for completed drives or Current for drives in progress */}
                  {(() => {
                    const driveEnded = selectedDrive.end?.text;
                    const driveInProgress = !driveEnded;
                    
                    if (driveEnded) {
                      return (
                        <View style={styles.driveModalStatItem}>
                          <Text style={styles.driveModalStatLabel}>End</Text>
                          <Text style={styles.driveModalStatValue}>{selectedDrive.end.text}</Text>
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
                          <Text style={styles.driveModalStatLabel}>Current</Text>
                          <Text style={styles.driveModalStatValue}>{currentPosition}</Text>
                        </View>
                      );
                    }
                    return null;
                  })()}
                  
                  {selectedDrive.timeElapsed?.displayValue && (
                    <View style={styles.driveModalStatItem}>
                      <Text style={styles.driveModalStatLabel}>Time</Text>
                      <Text style={styles.driveModalStatValue}>{selectedDrive.timeElapsed.displayValue}</Text>
                    </View>
                  )}
                </View>

                {/* Plays List */}
                <View style={styles.driveModalPlaysContainer}>
                  <Text style={styles.driveModalPlaysTitle}>
                    Plays ({selectedDrive.plays?.length || 0})
                  </Text>
                  <ScrollView style={styles.driveModalPlaysList}>
                    {selectedDrive.plays && selectedDrive.plays.length > 0 ? (
                      selectedDrive.plays.map((play, index) => (
                        <View key={index} style={styles.driveModalPlayItem}>
                          <View style={styles.driveModalPlayHeader}>
                            <Text style={styles.driveModalPlayNumber}>Play {index + 1}</Text>
                            {play.clock?.displayValue && play.period?.number && (
                              <Text style={styles.driveModalPlayTime}>
                                Q{play.period.number} {play.clock.displayValue}
                              </Text>
                            )}
                          </View>
                          <Text style={styles.driveModalPlayText}>
                            {play.text || 'No description available'}
                          </Text>
                          {/* Down and Yard information similar to scoreboard copycard */}
                          {(() => {
                            const downDistanceText = play.start?.downDistanceText || play.end?.downDistanceText || '';
                            return (downDistanceText || play.scoringPlay || play.type?.text) && (
                              <Text style={styles.driveModalPlayYards}>
                                {[
                                  downDistanceText,
                                  play.type?.text
                                ].filter(Boolean).join(' • ')}
                              </Text>
                            );
                          })()}
                        </View>
                      ))
                    ) : (
                      <Text style={styles.driveModalNoPlays}>No plays available for this drive</Text>
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
    backgroundColor: 'white',
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
    marginHorizontal: 3,
  },
  awayPossession: {
    // Inline with team name
  },
  homePossession: {
    // Inline with team name
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
    backgroundColor: 'white',
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
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e9ecef',
  },
  activeTabButton: {
    backgroundColor: '#013369',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  activeTabText: {
    color: 'white',
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
});

export default GameDetailsScreen;
