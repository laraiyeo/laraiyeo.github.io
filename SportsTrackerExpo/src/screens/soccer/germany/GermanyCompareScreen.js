import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GermanyServiceEnhanced } from '../../../services/soccer/GermanyServiceEnhanced';
import { useTheme } from '../../../context/ThemeContext';

// Convert HTTP URLs to HTTPS to avoid mixed content issues
const convertToHttps = (url) => {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
};

const GermanyCompareScreen = ({ navigation, route }) => {
  const { theme, colors, getTeamLogoUrl, isDarkMode } = useTheme();
  
  // State for player comparison
  const [player1, setPlayer1] = useState(null);
  const [player2, setPlayer2] = useState(null);
  const [player1Year, setPlayer1Year] = useState(new Date().getFullYear());
  const [player2Year, setPlayer2Year] = useState(new Date().getFullYear());
  const [comparisonStats, setComparisonStats] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // State for player search
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchingForPlayer, setSearchingForPlayer] = useState(null); // 1 or 2
  
  // State for year selectors
  const [showYear1Picker, setShowYear1Picker] = useState(false);
  const [showYear2Picker, setShowYear2Picker] = useState(false);
  
  // All Ligue 1 players cache
  const [allLigue1Players, setAllLigue1Players] = useState([]);

  // Generate year options
  const currentYear = new Date().getFullYear();
  const startYear = 2021;
  const yearOptions = Array.from({length: currentYear - startYear + 1}, (_, i) => currentYear - i);

  useEffect(() => {
    fetchAllLigue1Players();
  }, []);

  useEffect(() => {
    if (player1 && player2) {
      loadComparison();
    }
  }, [player1, player2, player1Year, player2Year]);

  const TeamLogoImage = ({ teamId, style }) => {
    const [logoSource, setLogoSource] = useState(null);
    const [failedUrls, setFailedUrls] = useState(new Set());
    
    useEffect(() => {
      setFailedUrls(new Set());
      const logos = getTeamLogo(teamId, isDarkMode);
      setLogoSource({ uri: logos.primaryUrl });
    }, [teamId, isDarkMode]);

    const handleImageError = () => {
      const logos = getTeamLogo(teamId, isDarkMode);
      const currentUrl = logoSource?.uri;
      
      if (currentUrl) {
        const newFailedUrls = new Set(failedUrls);
        newFailedUrls.add(currentUrl);
        setFailedUrls(newFailedUrls);
        
        if (!newFailedUrls.has(logos.fallbackUrl)) {
          setLogoSource({ uri: logos.fallbackUrl });
        } else {
          // Final fallback - use actual logo URL first if teamId exists
          if (teamId) {
            const finalFallbackUrl = `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
            setLogoSource({ uri: finalFallbackUrl });
          } else {
            setLogoSource(require('../../../../assets/soccer.png'));
          }
        }
      }
    };

    return (
      <Image 
        source={logoSource || (teamId ? { uri: getTeamLogo(teamId, isDarkMode).primaryUrl } : require('../../../../assets/soccer.png'))}
        style={style}
        onError={handleImageError}
      />
    );
  };

  const getTeamLogo = (teamId, isDarkMode) => {
    // Try dark logo first if in dark mode, otherwise try light logo
    const primaryUrl = isDarkMode 
      ? `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`
      : `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
    
    // Fallback to opposite theme logo
    const fallbackUrl = isDarkMode
      ? `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`
      : `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`;
    
    // Final fallback to local soccer ball image
    const finalFallback = '../../../assets/soccer.png';
    
    return { primaryUrl, fallbackUrl, finalFallback };
  };

  const fetchAllLigue1Players = async () => {
    try {
      console.log('Fetching all Ligue 1 players...');
      const allPlayers = await GermanyServiceEnhanced.searchPlayers('');
      
      // Filter out any invalid player data - use the same structure as GermanySearchScreen
      const validPlayers = allPlayers.filter(player => 
        player && 
        (player.name || player.displayName || player.fullName) && 
        typeof (player.name || player.displayName || player.fullName) === 'string' && 
        player.id
      );
      
      console.log(`Fetched ${validPlayers.length} valid Ligue 1 players for comparison (${allPlayers.length} total)`);
      setAllLigue1Players(validPlayers);
    } catch (error) {
      console.error('Error fetching all Ligue 1 players:', error);
    }
  };

  const searchPlayers = (query) => {
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }

    const filteredPlayers = allLigue1Players
      .filter(player => {
        // Add null check for player name - handle different name properties like GermanySearchScreen
        if (!player) {
          return false;
        }
        
        // Get the player name from different possible properties
        const playerName = player.name || player.displayName || player.fullName || '';
        
        if (!playerName || typeof playerName !== 'string') {
          return false;
        }
        
        const fullName = playerName.toLowerCase();
        return fullName.includes(query.toLowerCase());
      }); // Removed the .slice(0, 10) limit to show all matching players

    setSearchResults(filteredPlayers);
  };

  // Helper function to determine player type (matching team-page.js logic)
  const getPlayerType = (position) => {
    if (!position || typeof position !== 'string') {
      return 'field'; // Default to field player for unknown positions
    }
    const goalkeepers = ['Goalkeeper', 'GK', 'G'];
    return goalkeepers.includes(position) ? 'goalkeeper' : 'field';
  };

  const selectPlayer = (player, playerNumber) => {
    console.log('Selected player:', player);
    
    // Get the player name from different possible properties (matching GermanySearchScreen structure)
    const playerName = player.name || player.displayName || player.fullName || '';
    
    // Add safety checks for player data
    if (!player || !player.id || !playerName) {
      console.error('Invalid player data:', player);
      Alert.alert('Error', 'Invalid player data. Please try selecting another player.');
      return;
    }
    
    const playerData = {
      id: player.id,
      name: playerName,
      position: player.position || 'Unknown',
      jersey: player.jersey || 'N/A',
      headshot: player.headshot || 'https://via.placeholder.com/60x60?text=Soccer',
      teamName: player.teamName || player.team || 'Unknown Team', // Handle both teamName and team properties
      teamAbbr: player.teamAbbr || 'UNK',
      teamId: player.teamId,
      teamColor: player.teamColor, // Store the raw team color data for processing
      playerType: getPlayerType(player.position || 'Unknown')
    };

    if (playerNumber === 1) {
      setPlayer1(playerData);
    } else {
      setPlayer2(playerData);
    }

    setShowSearchModal(false);
    setSearchText('');
    setSearchResults([]);
  };

  const clearPlayer = (playerNumber) => {
    if (playerNumber === 1) {
      setPlayer1(null);
    } else {
      setPlayer2(null);
    }
    setComparisonStats(null);
  };

  const openPlayerSearch = (playerNumber) => {
    setSearchingForPlayer(playerNumber);
    setShowSearchModal(true);
  };

  const loadComparison = async () => {
    if (!player1 || !player2) return;

    setLoading(true);
    try {
      console.log('Loading comparison for:', player1.name, 'vs', player2.name);
      
      // Check if both players are the same type (goalkeeper vs field player) using the same logic as team-page.js
      const player1Type = getPlayerType(player1.position);
      const player2Type = getPlayerType(player2.position);

      // Only allow comparison between same types
      if (player1Type !== player2Type) {
        Alert.alert(
          'Invalid Comparison', 
          `Cannot compare ${player1Type}s with ${player2Type} players.`
        );
        setComparisonStats(null);
        setLoading(false);
        return;
      }

      // Fetch player statistics for both players
      const [player1Stats, player2Stats] = await Promise.all([
        fetchPlayerStats(player1.id, player1Year),
        fetchPlayerStats(player2.id, player2Year)
      ]);

      if (!player1Stats && !player2Stats) {
        setComparisonStats({ error: 'No statistics available for comparison' });
        setLoading(false);
        return;
      }

      // Define stats to compare based on player type
      let statsToCompare;
      if (player1Type === 'goalkeeper') {
        // Goalkeeper statistics
        statsToCompare = [
          { key: 'appearances', label: 'Apps', type: 'number' },
          { key: 'saves', label: 'Saves', type: 'number' },
          { key: 'cleanSheets', label: 'Clean Sheets', type: 'number' },
          { key: 'goalsConceded', label: 'Goals Conceded', type: 'number', lowerIsBetter: true },
          { key: 'savePercentage', label: 'Save %', type: 'percentage' },
          { key: 'penaltiesSaved', label: 'Penalties Saved', type: 'number' }
        ];
      } else {
        // Field player statistics
        statsToCompare = [
          { key: 'appearances', label: 'Apps', type: 'number' },
          { key: 'goals', label: 'Goals', type: 'number' },
          { key: 'assists', label: 'Assists', type: 'number' },
          { key: 'shots', label: 'Shots', type: 'number' },
          { key: 'shotsOnTarget', label: 'Shots on Target', type: 'number' },
          { key: 'passAccuracy', label: 'Pass %', type: 'percentage' },
          { key: 'tackles', label: 'Tackles', type: 'number' },
          { key: 'interceptions', label: 'Interceptions', type: 'number' },
          { key: 'yellowCards', label: 'Yellow Cards', type: 'number', lowerIsBetter: true },
          { key: 'redCards', label: 'Red Cards', type: 'number', lowerIsBetter: true }
        ];
      }

      // Process comparison data
      const comparisonData = statsToCompare.map(statDef => {
        const player1Value = player1Stats?.[statDef.key] ?? 0;
        const player2Value = player2Stats?.[statDef.key] ?? 0;

        let player1Better = false;
        let player2Better = false;

        if (player1Value !== player2Value) {
          if (statDef.lowerIsBetter) {
            player1Better = player1Value < player2Value && player1Value > 0;
            player2Better = player2Value < player1Value && player2Value > 0;
          } else {
            player1Better = player1Value > player2Value;
            player2Better = player2Value > player1Value;
          }
        }

        return {
          label: statDef.label,
          player1Value: statDef.type === 'percentage' ? 
            `${(parseFloat(player1Value) || 0).toFixed(3) * 100}%` : 
            (player1Value || 0).toString(),
          player2Value: statDef.type === 'percentage' ? 
            `${(parseFloat(player2Value) || 0).toFixed(3) * 100}%` : 
            (player2Value || 0).toString(),
          player1Better,
          player2Better
        };
      });

      setComparisonStats({
        isGoalkeeper: player1Type === 'goalkeeper',
        stats: comparisonData,
        comparisonType: player1Type === 'goalkeeper' ? 'Goalkeeper' : 'Field Player'
      });

    } catch (error) {
      console.error('Error loading comparison:', error);
      setComparisonStats({ error: 'Error loading comparison statistics' });
    }
    setLoading(false);
  };

  const fetchPlayerStats = async (playerId, year) => {
    try {
      console.log(`Fetching real stats for player ${playerId} for year ${year}`);
      
      // Define competitions like in GermanyPlayerPageScreen
      const competitions = [
        { code: 'ger.1', name: 'Bundesliga', seasonType: '0' },
        { code: 'ger.dfb_pokal', name: 'DFB Pokal', seasonType: '0' },
        { code: 'ger.super_cup', name: 'German Super Cup', seasonType: '0' }
      ];
      
      let combinedStats = null;
      
      // Try to fetch stats from each competition
      for (const competition of competitions) {
        try {
          const statsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${competition.code}/seasons/${year}/types/${competition.seasonType}/athletes/${playerId}/statistics?lang=en&region=us`;
          console.log(`Trying to fetch stats from: ${statsUrl}`);
          
          const response = await fetch(convertToHttps(statsUrl));
          if (response.ok) {
            const data = await response.json();
            console.log(`Successfully fetched ${competition.name} stats for player ${playerId}`);
            
            // Process the stats using the same logic as GermanyPlayerPageScreen
            const processedStats = processPlayerStats(data);
            if (processedStats && Object.keys(processedStats).length > 0) {
              if (!combinedStats) {
                combinedStats = processedStats;
              } else {
                // Combine stats from multiple competitions
                combinedStats = combineStatsForComparison(combinedStats, processedStats);
              }
            }
          }
        } catch (error) {
          console.log(`Failed to fetch ${competition.name} stats:`, error.message);
        }
      }
      
      // If no stats found, return null
      if (!combinedStats) {
        console.log(`No stats found for player ${playerId} in year ${year}`);
        return null;
      }
      
      return combinedStats;
      
    } catch (error) {
      console.error('Error fetching player stats:', error);
      return null;
    }
  };

  // Process player stats similar to GermanyPlayerPageScreen
  const processPlayerStats = (statsData) => {
    const stats = {};
    
    if (statsData.splits && statsData.splits.categories) {
      statsData.splits.categories.forEach(category => {
        if (category.stats) {
          category.stats.forEach(stat => {
            // Convert stat names to comparison-friendly format
            const statName = stat.name;
            const statValue = parseFloat(stat.value) || 0;
            
            // Map ESPN stat names to comparison stat names
            switch (statName) {
              case 'appearances':
                stats.appearances = statValue;
                break;
              case 'totalGoals':
                stats.goals = statValue;
                break;
              case 'goalAssists':
                stats.assists = statValue;
                break;
              case 'totalShots':
                stats.shots = statValue;
                break;
              case 'shotsOnTarget':
                stats.shotsOnTarget = statValue;
                break;
              case 'passPct':
                stats.passAccuracy = statValue;
                break;
              case 'totalTackles':
                stats.tackles = statValue;
                break;
              case 'interceptions':
                stats.interceptions = statValue;
                break;
              case 'yellowCards':
                stats.yellowCards = statValue;
                break;
              case 'redCards':
                stats.redCards = statValue;
                break;
              case 'saves':
                stats.saves = statValue;
                break;
              case 'cleanSheet':
                stats.cleanSheets = statValue;
                break;
              case 'goalsConceded':
                stats.goalsConceded = statValue;
                break;
              case 'savePercentage':
                stats.savePercentage = statValue;
                break;
              case 'penaltyKicksSaved':
                stats.penaltiesSaved = statValue;
                break;
              default:
                // Store other stats as well
                stats[statName] = statValue;
                break;
            }
          });
        }
      });
    }
    
    return stats;
  };

  // Combine stats from multiple competitions for comparison
  const combineStatsForComparison = (stats1, stats2) => {
    const combined = { ...stats1 };
    
    Object.keys(stats2).forEach(key => {
      if (combined[key] !== undefined) {
        // Add numerical stats together
        if (typeof combined[key] === 'number' && typeof stats2[key] === 'number') {
          // For percentage stats, calculate weighted average (approximation)
          if (key.includes('Percentage') || key.includes('Accuracy')) {
            combined[key] = (combined[key] + stats2[key]) / 2;
          } else {
            combined[key] = combined[key] + stats2[key];
          }
        }
      } else {
        combined[key] = stats2[key];
      }
    });
    
    return combined;
  };

  // Get team color like in GermanySearchScreen
  const getTeamColor = (teamColorInfo) => {
    if (!teamColorInfo) return colors.primary;
    
    // Use alternate color if main color is too light/problematic
    const isUsingAlternateColor = ["ffffff", "ffee00", "ffff00", "81f733", "000000", "f7f316", "eef209", "ece83a", "1c31ce", "ffd700"].includes(teamColorInfo.color);
    
    if (isUsingAlternateColor && teamColorInfo.alternateColor) {
      return `#${teamColorInfo.alternateColor}`;
    } else if (teamColorInfo.color && teamColorInfo.color !== "000000") {
      return `#${teamColorInfo.color}`;
    }
    
    return colors.primary;
  };

  const renderPlayerCard = (player, playerNumber) => {
    const isPlayer1 = playerNumber === 1;
    
    return (
      <View style={[styles.playerCard, { backgroundColor: theme.surface }]}>
        {player ? (
          <>
            <TouchableOpacity 
              style={styles.clearButton}
              onPress={() => clearPlayer(playerNumber)}
            >
              <Text style={styles.clearButtonText}>×</Text>
            </TouchableOpacity>
            
            {/* Team Logo and Name */}
            {player.teamAbbr && (
              <View style={styles.teamHeader}>
                <TeamLogoImage
                  teamId={player.teamId}
                  style={styles.teamLogo}
                />
                <Text style={[styles.teamName, { color: theme.text }]}>
                  {player.teamAbbr}
                </Text>
              </View>
            )}
            
            {/* Player Avatar Container with team color and initials */}
            <View style={styles.playerImageContainer}>
              <View style={[
                styles.playerImageCircle,
                { backgroundColor: getTeamColor(player.teamColor) }
              ]}>
                <Text style={styles.playerInitials}>
                  {player.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                </Text>
              </View>
            </View>
            
            {/* Player Name Container */}
            <View style={styles.playerNameContainer}>
              <Text style={[styles.playerName, { color: theme.text }]} numberOfLines={2}>
                {player.name}
              </Text>
              <Text style={[styles.playerDetails, { color: theme.textSecondary }]}>
                #{player.jersey} | {player.position}
              </Text>
            </View>
            
            <View style={styles.yearSelector}>
              <Text style={[styles.yearLabel, { color: theme.text }]}>Season:</Text>
              <TouchableOpacity 
                style={[styles.yearButton, { 
                  backgroundColor: theme.surface,
                  borderColor: theme.border 
                }]}
                onPress={() => {
                  if (isPlayer1) {
                    setShowYear1Picker(true);
                  } else {
                    setShowYear2Picker(true);
                  }
                }}
              >
                <Text style={[styles.yearButtonText, { color: theme.text }]}>
                  {isPlayer1 ? player1Year : player2Year}
                </Text>
                <Text style={[styles.yearButtonArrow, { color: theme.textSecondary }]}>▼</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <TouchableOpacity 
            style={styles.addPlayerButton}
            onPress={() => openPlayerSearch(playerNumber)}
          >
            <Text style={[styles.addPlayerIcon, { color: colors.primary }]}>
              +
            </Text>
            <Text style={[styles.addPlayerText, { color: colors.primary }]}>
              Add Player {playerNumber}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderComparisonStats = () => {
    if (!comparisonStats) return null;
    
    if (comparisonStats.error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>
            {comparisonStats.error}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.statsContainer}>
        {/* Comparison Type Header */}
        {comparisonStats.comparisonType && (
          <View style={styles.comparisonHeader}>
            <Text style={[styles.comparisonType, { color: theme.text }]}>
              {comparisonStats.comparisonType} Statistics
            </Text>
          </View>
        )}
        
        {comparisonStats.stats.map((stat, index) => (
          <View key={index} style={[styles.statRow, { backgroundColor: theme.surface }]}>
            {/* Player 1 Stat */}
            <View style={[
              styles.statBox,
              { 
                backgroundColor: stat.player1Better ? colors.secondary + '20' : theme.background,
                borderColor: stat.player1Better ? colors.secondary : theme.border,
                borderWidth: stat.player1Better ? 2 : 1
              }
            ]}>
              <Text style={[
                styles.statValue,
                { color: stat.player1Better ? colors.secondary : theme.text }
              ]}>
                {stat.player1Value}
              </Text>
            </View>
            
            {/* Stat Label */}
            <View style={styles.statLabelContainer}>
              <Text style={[styles.statLabel, { color: theme.text }]}>
                {stat.label}
              </Text>
            </View>
            
            {/* Player 2 Stat */}
            <View style={[
              styles.statBox,
              { 
                backgroundColor: stat.player2Better ? colors.secondary + '20' : theme.background,
                borderColor: stat.player2Better ? colors.secondary : theme.border,
                borderWidth: stat.player2Better ? 2 : 1
              }
            ]}>
              <Text style={[
                styles.statValue,
                { color: stat.player2Better ? colors.secondary : theme.text }
              ]}>
                {stat.player2Value}
              </Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderSearchModal = () => (
    <Modal
      visible={showSearchModal}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowSearchModal(false)}
    >
      <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
        <View style={[styles.modalHeader, { backgroundColor: theme.surface }]}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>
            Select Player {searchingForPlayer}
          </Text>
          <TouchableOpacity
            onPress={() => setShowSearchModal(false)}
            style={styles.modalCloseButton}
          >
            <Text style={[styles.modalCloseText, { color: colors.primary }]}>Close</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.searchContainer}>
          <TextInput
            style={[styles.searchInput, { 
              backgroundColor: theme.surface, 
              color: theme.text,
              borderColor: theme.border
            }]}
            placeholder="Search for a player..."
            placeholderTextColor={theme.textSecondary}
            value={searchText}
            onChangeText={(text) => {
              setSearchText(text);
              searchPlayers(text);
            }}
            autoFocus
          />
        </View>
        
        <ScrollView style={styles.searchResults}>
          {searchResults.map((player) => {
            // Get the player name from different possible properties
            const playerName = player.name || player.displayName || player.fullName || 'Unknown Player';
            
            // Generate player initials like in GermanySearchScreen
            const playerInitials = playerName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            
            // Get team color using the same logic as GermanySearchScreen
            const teamColor = getTeamColor(player.teamColor);
            
            return (
              <TouchableOpacity
                key={player.id}
                style={[styles.searchResultItem, { backgroundColor: theme.surface }]}
                onPress={() => selectPlayer(player, searchingForPlayer)}
              >
                <View style={[
                  styles.searchResultAvatar,
                  { backgroundColor: teamColor }
                ]}>
                  <Text style={styles.searchResultInitials}>
                    {playerInitials}
                  </Text>
                </View>
                <View style={styles.searchResultInfo}>
                  <Text style={[styles.searchResultName, { color: theme.text }]}>
                    {playerName}
                  </Text>
                  <Text style={[styles.searchResultDetails, { color: theme.textSecondary }]}>
                    #{player.jersey || '--'} | {player.position || 'N/A'}
                  </Text>
                  {(player.teamName || player.team) && (
                    <Text style={[styles.searchResultTeam, { color: theme.textSecondary }]}>
                      {player.teamName || player.team}
                    </Text>
                  )}
                </View>
                {player.teamId && (
                  <TeamLogoImage
                    teamId={player.teamId}
                    style={styles.searchResultTeamLogo}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.primary }]}>Player Comparison</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Compare Ligue 1 players side by side
          </Text>
        </View>

        {/* Players Header */}
        <View style={styles.playersHeader}>
          {renderPlayerCard(player1, 1)}
          
          <View style={styles.vsContainer}>
            <Text style={[styles.vsText, { color: theme.text }]}>VS</Text>
          </View>
          
          {renderPlayerCard(player2, 2)}
        </View>

        {/* Comparison Stats */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              Loading comparison...
            </Text>
          </View>
        ) : (
          renderComparisonStats()
        )}
      </ScrollView>

      {renderSearchModal()}
      
      {/* Year Picker Modals */}
      <Modal
        visible={showYear1Picker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowYear1Picker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.yearPickerModal, { backgroundColor: theme.surface }]}>
            <Text style={[styles.yearPickerTitle, { color: theme.text }]}>
              Select Season for {player1?.name}
            </Text>
            <ScrollView style={styles.yearOptions}>
              {yearOptions.map(year => (
                <TouchableOpacity
                  key={year}
                  style={[
                    styles.yearOption,
                    { backgroundColor: year === player1Year ? colors.primary : 'transparent' }
                  ]}
                  onPress={() => {
                    setPlayer1Year(year);
                    setShowYear1Picker(false);
                  }}
                >
                  <Text style={[
                    styles.yearOptionText,
                    { color: year === player1Year ? 'white' : theme.text }
                  ]}>
                    {year}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.yearPickerCancel, { borderTopColor: theme.border }]}
              onPress={() => setShowYear1Picker(false)}
            >
              <Text style={[styles.yearPickerCancelText, { color: colors.primary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showYear2Picker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowYear2Picker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.yearPickerModal, { backgroundColor: theme.surface }]}>
            <Text style={[styles.yearPickerTitle, { color: theme.text }]}>
              Select Season for {player2?.name}
            </Text>
            <ScrollView style={styles.yearOptions}>
              {yearOptions.map(year => (
                <TouchableOpacity
                  key={year}
                  style={[
                    styles.yearOption,
                    { backgroundColor: year === player2Year ? colors.primary : 'transparent' }
                  ]}
                  onPress={() => {
                    setPlayer2Year(year);
                    setShowYear2Picker(false);
                  }}
                >
                  <Text style={[
                    styles.yearOptionText,
                    { color: year === player2Year ? 'white' : theme.text }
                  ]}>
                    {year}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.yearPickerCancel, { borderTopColor: theme.border }]}
              onPress={() => setShowYear2Picker(false)}
            >
              <Text style={[styles.yearPickerCancelText, { color: colors.primary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  playersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 16,
  },
  playerCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    position: 'relative',
    minHeight: 260,
    justifyContent: 'flex-start',
  },
  teamHeader: {
    alignItems: 'center',
    marginBottom: 8,
  },
  teamLogo: {
    width: 28,
    height: 28,
    marginBottom: 4,
  },
  teamName: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  playerImageContainer: {
    alignItems: 'center',
    marginBottom: 6,
  },
  playerImageCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  playerInitials: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  playerNameContainer: {
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  clearButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#dc3545',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  clearButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  playerName: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  playerDetails: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  yearSelector: {
    alignItems: 'center',
    gap: 8,
  },
  yearLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  yearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 80,
  },
  yearButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  yearButtonArrow: {
    fontSize: 12,
    marginLeft: 8,
  },
  addPlayerButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  addPlayerIcon: {
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  addPlayerText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  vsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statsContainer: {
    gap: 8,
    marginTop: 8,
  },
  comparisonHeader: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 12,
  },
  comparisonType: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 12,
  },
  statBox: {
    flex: 1,
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statLabelContainer: {
    width: 80,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  errorContainer: {
    padding: 20,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    padding: 8,
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '500',
  },
  searchContainer: {
    padding: 16,
  },
  searchInput: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  searchResults: {
    flex: 1,
    padding: 16,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    gap: 12,
  },
  searchResultAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchResultInitials: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchResultInfo: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchResultDetails: {
    fontSize: 14,
    marginTop: 2,
  },
  searchResultTeam: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  searchResultTeamLogo: {
    width: 24,
    height: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  yearPickerModal: {
    width: 280,
    maxHeight: 400,
    borderRadius: 12,
    margin: 20,
  },
  yearPickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  yearOptions: {
    maxHeight: 250,
  },
  yearOption: {
    padding: 16,
    alignItems: 'center',
  },
  yearOptionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  yearPickerCancel: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
  },
  yearPickerCancelText: {
    fontSize: 16,
    fontWeight: '500',
  },
});

export default GermanyCompareScreen;
