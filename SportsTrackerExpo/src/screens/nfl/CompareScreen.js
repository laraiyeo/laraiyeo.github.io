import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  Image, 
  ActivityIndicator, 
  StyleSheet,
  Modal,
  TextInput,
  FlatList
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import NFLDataService from '../../services/NFLDataService';

const CompareScreen = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors, isDarkMode, getTeamLogoUrl } = useTheme();
  
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
  
  // NFL data loading state
  const [nflDataLoading, setNflDataLoading] = useState(true);
  const [allNFLPlayers, setAllNFLPlayers] = useState([]);

  // Generate year options
  const currentYear = new Date().getFullYear();
  const startYear = 2020;
  const yearOptions = Array.from({length: currentYear - startYear + 1}, (_, i) => currentYear - i);

  useEffect(() => {
    const unsubscribe = initializeNFLData();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (player1 && player2 && player1Year && player2Year) {
      loadComparison();
    }
  }, [player1, player2, player1Year, player2Year]);

  const initializeNFLData = () => {
    const data = NFLDataService.getData();
    setNflDataLoading(data.isInitializing);
    setAllNFLPlayers(NFLDataService.getAllPlayers());

    // Listen for data updates
    const handleDataUpdate = (data) => {
      setNflDataLoading(data.isInitializing);
      setAllNFLPlayers(NFLDataService.getAllPlayers());
    };

    const unsubscribe = NFLDataService.addListener(handleDataUpdate);

    // Only initialize if data is not fully loaded
    if (!NFLDataService.isDataFullyLoaded()) {
      console.log('CompareScreen: Data not fully loaded, initializing...');
      NFLDataService.initializeData();
    } else {
      console.log('CompareScreen: Data already loaded, using cache');
    }

    // Cleanup listener on unmount
    return unsubscribe;
  };

  const searchPlayers = (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    const results = NFLDataService.searchPlayers(query);
    setSearchResults(results.slice(0, 20));
  };

  const selectPlayer = (player, playerNumber) => {
    if (playerNumber === 1) {
      setPlayer1(player);
    } else {
      setPlayer2(player);
    }
    setShowSearchModal(false);
    setSearchText('');
    setSearchResults([]);
  };

  const clearPlayer = (playerNumber) => {
    if (playerNumber === 1) {
      setPlayer1(null);
      setComparisonStats(null);
    } else {
      setPlayer2(null);
      setComparisonStats(null);
    }
  };

  const openPlayerSearch = (playerNumber) => {
    setSearchingForPlayer(playerNumber);
    setShowSearchModal(true);
  };

  const loadComparison = async () => {
    if (!player1 || !player2) return;
    
    setLoading(true);
    
    try {
      // Check if players are in the same position group
      const position1 = getPositionGroup(player1.position?.displayName);
      const position2 = getPositionGroup(player2.position?.displayName);
      
      console.log(`Player 1: ${player1.displayName} - Position: "${player1.position?.displayName}" - Group: ${position1}`);
      console.log(`Player 2: ${player2.displayName} - Position: "${player2.position?.displayName}" - Group: ${position2}`);
      
      if (position1 !== position2) {
        setComparisonStats({
          error: `Cannot compare players from different position groups (${position1} vs ${position2})`
        });
        setLoading(false);
        return;
      }

      // Fetch stats for both players
      const [player1StatsData, player2StatsData] = await Promise.all([
        fetchPlayerStats(player1.id, player1Year),
        fetchPlayerStats(player2.id, player2Year)
      ]);

      if (!player1StatsData || !player2StatsData) {
        setComparisonStats({
          error: 'Unable to load stats for one or both players'
        });
        setLoading(false);
        return;
      }

      // Get position-specific stats
      const player1Stats = getPositionStats(position1, player1StatsData);
      const player2Stats = getPositionStats(position1, player2StatsData);

      setComparisonStats({
        position: position1,
        player1Stats,
        player2Stats
      });
    } catch (error) {
      console.error('Error loading comparison:', error);
      setComparisonStats({
        error: 'Failed to load player comparison'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPlayerStats = async (playerId, year) => {
    try {
      const statsUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${year}/types/2/athletes/${playerId}/statistics`;
      const response = await fetch(statsUrl);
      
      if (!response.ok) {
        // Try regular season stats instead
        const regularSeasonUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${year}/types/1/athletes/${playerId}/statistics`;
        const regularResponse = await fetch(regularSeasonUrl);
        
        if (!regularResponse.ok) return null;
        
        const regularData = await regularResponse.json();
        return regularData.splits?.categories || null;
      }
      
      const data = await response.json();
      return data.splits?.categories || null;
    } catch (error) {
      console.error('Error fetching player stats:', error);
      return null;
    }
  };

  // NFL Position Groupings (adapted from NFLPlayerPageScreen.js to handle full position names)
  const getPositionGroup = (position) => {
    if (!position || typeof position !== 'string') {
      return 'OTHER';
    }
    
    const p = position.toLowerCase();
    
    // Handle full position names from roster data
    if (p.includes('quarter') || p.includes('qb')) return 'QB';
    if (p.includes('running') || p === 'rb' || p.includes('running back') || p.includes('fullback') || p === 'fb') return 'RB';
    if (p.includes('wide') || p.includes('receiver') || p === 'wr' || p.includes('wing') || p.includes('tight') || p === 'te') return 'WR/TE';
    if (p.includes('offensive') && (p.includes('line') || p.includes('tackle') || p.includes('guard') || p.includes('center'))) return 'OL';
    if (p === 'ot' || p === 'g' || p === 'c' || p === 'ol') return 'OL';
    if (p.includes('defensive') && (p.includes('line') || p.includes('tackle') || p.includes('end'))) return 'DL/LB';
    if (p.includes('lineback') || p.includes('lb')) return 'DL/LB';
    if (p === 'de' || p === 'dt' || p === 'olb' || p === 'mlb' || p === 'ilb') return 'DL/LB';
    if (p.includes('safety') || p.includes('corner') || p.includes('db') || p.includes('defensive back')) return 'DB';
    if (p === 'cb' || p === 's' || p === 'fs' || p === 'ss') return 'DB';
    if (p.includes('kicker') || p === 'k' || p.includes('pk') || p.includes('punt') || p === 'p' || p.includes('punter')) return 'K/P';
    if (p.includes('long snapper') || p === 'ls') return 'LS';
    
    // Fallback to original abbreviation-based logic
    const positionGroups = {
      'QB': 'QB',
      'RB': 'RB', 'FB': 'RB',
      'WR': 'WR/TE', 'TE': 'WR/TE',
      'OT': 'OL', 'G': 'OL', 'C': 'OL', 'OL': 'OL',
      'DE': 'DL/LB', 'DT': 'DL/LB', 'LB': 'DL/LB', 'OLB': 'DL/LB', 'MLB': 'DL/LB', 'ILB': 'DL/LB',
      'CB': 'DB', 'S': 'DB', 'FS': 'DB', 'SS': 'DB', 'DB': 'DB',
      'K': 'K/P', 'P': 'K/P', 'PK': 'K/P',
      'LS': 'LS'
    };
    
    const normalizedPosition = position.toUpperCase().trim();
    return positionGroups[normalizedPosition] || 'OTHER';
  };

  // Get relevant stats for each position group (adapted from team-page.js)
  const getPositionStats = (positionGroup, categories) => {
    const statMappings = {
      'QB': [
        { key: 'gamesPlayed', label: 'Games Played', category: 'general' },
        { key: 'passingYards', label: 'Pass Yards', category: 'passing' },
        { key: 'passingTouchdowns', label: 'Pass TDs', category: 'passing' },
        { key: 'interceptions', label: 'Interceptions', category: 'passing' },
        { key: 'completionPct', label: 'Completion %', category: 'passing' },
        { key: 'QBRating', label: 'QB Rating', category: 'passing' },
        { key: 'rushingYards', label: 'Rush Yards', category: 'rushing' },
        { key: 'rushingTouchdowns', label: 'Rush TDs', category: 'rushing' }
      ],
      'RB': [
        { key: 'gamesPlayed', label: 'Games Played', category: 'general' },
        { key: 'rushingAttempts', label: 'Rush Attempts', category: 'rushing' },
        { key: 'rushingYards', label: 'Rush Yards', category: 'rushing' },
        { key: 'rushingTouchdowns', label: 'Rush TDs', category: 'rushing' },
        { key: 'yardsPerRushAttempt', label: 'Yards/Carry', category: 'rushing' },
        { key: 'receptions', label: 'Receptions', category: 'receiving' },
        { key: 'receivingYards', label: 'Rec Yards', category: 'receiving' },
        { key: 'receivingTouchdowns', label: 'Rec TDs', category: 'receiving' }
      ],
      'WR/TE': [
        { key: 'gamesPlayed', label: 'Games Played', category: 'general' },
        { key: 'receptions', label: 'Receptions', category: 'receiving' },
        { key: 'receivingYards', label: 'Rec Yards', category: 'receiving' },
        { key: 'receivingTouchdowns', label: 'Rec TDs', category: 'receiving' },
        { key: 'yardsPerGame', label: 'Yards/Game', category: 'receiving' },
        { key: 'receivingTargets', label: 'Targets', category: 'receiving' },
        { key: 'longReception', label: 'Long Rec', category: 'receiving' },
        { key: 'receivingFirstDowns', label: 'Rec 1st Downs', category: 'receiving' }
      ],
      'DL/LB': [
        { key: 'gamesPlayed', label: 'Games Played', category: 'general' },
        { key: 'totalTackles', label: 'Total Tackles', category: 'defensive' },
        { key: 'soloTackles', label: 'Solo Tackles', category: 'defensive' },
        { key: 'sacks', label: 'Sacks', category: 'defensive' },
        { key: 'tacklesForLoss', label: 'TFL', category: 'defensive' },
        { key: 'QBHits', label: 'QB Hits', category: 'defensive' },
        { key: 'passesDefended', label: 'Pass Defended', category: 'defensive' },
        { key: 'fumblesForced', label: 'Forced Fumbles', category: 'general' }
      ],
      'DB': [
        { key: 'gamesPlayed', label: 'Games Played', category: 'general' },
        { key: 'totalTackles', label: 'Total Tackles', category: 'defensive' },
        { key: 'interceptions', label: 'Interceptions', category: 'defensiveInterceptions' },
        { key: 'passesDefended', label: 'Pass Defended', category: 'defensive' },
        { key: 'interceptionYards', label: 'INT Yards', category: 'defensiveInterceptions' },
        { key: 'sackYards', label: 'Sack YDS', category: 'defensive' },
        { key: 'fumblesRecovered', label: 'Fumbles Rec', category: 'general' },
        { key: 'stuffs', label: 'Stuffs', category: 'defensive' }
      ],
      'K/P': [
        { key: 'gamesPlayed', label: 'Games Played', category: 'general' },
        { key: 'fieldGoals', label: 'FG Made', category: 'scoring' },
        { key: 'kickExtraPoints', label: 'XP Made', category: 'scoring' },
        { key: 'grossAvgPuntYards', label: 'Punt Avg', category: 'punting' },
        { key: 'touchbacks', label: 'Touchbacks', category: 'punting' },
        { key: 'netTotalYards', label: 'Total Yards', category: 'passing' }
      ]
    };

    const positionStatConfig = statMappings[positionGroup] || statMappings['DL/LB']; // Default to defensive stats
    const playerStats = [];

    // Ensure categories is an array
    const validCategories = Array.isArray(categories) ? categories : [];

    positionStatConfig.forEach(config => {
      const category = validCategories.find(c => c && c.name === config.category);
      if (category && category.stats && Array.isArray(category.stats)) {
        const stat = category.stats.find(s => s && s.name === config.key);
        if (stat) {
          playerStats.push({
            label: config.label,
            value: stat.displayValue || '0',
            rank: stat.rankDisplayValue || null
          });
        } else {
          // If stat not found, show as 0
          playerStats.push({
            label: config.label,
            value: '0',
            rank: null
          });
        }
      } else {
        // If category not found, show as 0
        playerStats.push({
          label: config.label,
          value: '0',
          rank: null
        });
      }
    });

    return playerStats;
  };

  const getNFLTeamAbbreviation = (team) => {
    const teamMapping = {
      '1': 'ATL', '2': 'BUF', '3': 'CHI', '4': 'CIN', '5': 'CLE', '6': 'DAL',
      '7': 'DEN', '8': 'DET', '9': 'GB', '10': 'TEN', '11': 'IND', '12': 'KC',
      '13': 'LV', '14': 'LAR', '15': 'MIA', '16': 'MIN', '17': 'NE', '18': 'NO',
      '19': 'NYG', '20': 'NYJ', '21': 'PHI', '22': 'ARI', '23': 'PIT', '24': 'LAC',
      '25': 'SF', '26': 'SEA', '27': 'TB', '28': 'WAS', '29': 'CAR', '30': 'JAX',
      '33': 'BAL', '34': 'HOU'
    };

    if (team?.abbreviation) return team.abbreviation;
    return teamMapping[team?.id?.toString()] || team?.name?.substring(0, 3)?.toUpperCase() || 'NFL';
  };

  const getTeamLogo = (player) => {
    const teamAbbr = getNFLTeamAbbreviation(player.team);
    return isDarkMode ? `https://a.espncdn.com/i/teamlogos/nfl/500-dark/${teamAbbr.toLowerCase()}.png` : `https://a.espncdn.com/i/teamlogos/nfl/500/${teamAbbr.toLowerCase()}.png`;
  };

  const renderPlayerCard = (player, playerNumber) => {
    const isPlayer1 = playerNumber === 1;
    const year = isPlayer1 ? player1Year : player2Year;
    const showYearPicker = isPlayer1 ? showYear1Picker : showYear2Picker;
    const setShowYearPicker = isPlayer1 ? setShowYear1Picker : setShowYear2Picker;
    const setYear = isPlayer1 ? setPlayer1Year : setPlayer2Year;

    if (!player) {
      return (
        <TouchableOpacity
          style={[styles.playerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => openPlayerSearch(playerNumber)}
        >
          <View style={styles.addPlayerButton}>
            <Text allowFontScaling={false} style={[styles.addPlayerIcon, { color: colors.primary }]}>+</Text>
            <Text allowFontScaling={false} style={[styles.addPlayerText, { color: colors.primary }]}>
              Add Player {playerNumber}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <View style={[styles.playerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TouchableOpacity
          style={styles.clearButton}
          onPress={() => clearPlayer(playerNumber)}
        >
          <Text allowFontScaling={false} style={styles.clearButtonText}>×</Text>
        </TouchableOpacity>

        <View style={styles.teamHeader}>
          <Image
            source={{ uri: getTeamLogo(player) }}
            style={styles.teamLogo}
          />
          <Text allowFontScaling={false} style={[styles.teamName, { color: theme.text }]}>
            {getNFLTeamAbbreviation(player.team)}
          </Text>
        </View>

        <View style={styles.playerImageContainer}>
          <Image
            source={{ 
              uri: player.headshot?.href || `https://a.espncdn.com/i/headshots/nfl/players/full/${player.id}.png`
            }}
            style={styles.playerImage}
          />
        </View>

        <View style={styles.playerNameContainer}>
          <Text allowFontScaling={false} style={[styles.playerName, { color: theme.text }]}>
            {player.displayName}
          </Text>
          <Text allowFontScaling={false} style={[styles.playerDetails, { color: theme.textSecondary }]}>
            {player.position?.displayName || 'Player'} • #{player.jersey || 'N/A'}
          </Text>
        </View>

        <View style={styles.yearSelector}>
          <Text allowFontScaling={false} style={[styles.yearLabel, { color: theme.textSecondary }]}>Season</Text>
          <TouchableOpacity
            style={[styles.yearButton, { borderColor: theme.border, backgroundColor: theme.background }]}
            onPress={() => setShowYearPicker(true)}
          >
            <Text allowFontScaling={false} style={[styles.yearButtonText, { color: theme.text }]}>{year}</Text>
            <Text allowFontScaling={false} style={[styles.yearButtonArrow, { color: theme.textSecondary }]}>▼</Text>
          </TouchableOpacity>
        </View>

        <Modal visible={showYearPicker} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.yearPickerModal, { backgroundColor: theme.surface }]}>
              <Text allowFontScaling={false} style={[styles.yearPickerTitle, { color: theme.text, borderBottomColor: theme.border }]}>
                Select Season
              </Text>
              <ScrollView style={styles.yearOptions}>
                {yearOptions.map((yearOption) => (
                  <TouchableOpacity
                    key={yearOption}
                    style={styles.yearOption}
                    onPress={() => {
                      setYear(yearOption);
                      setShowYearPicker(false);
                    }}
                  >
                    <Text allowFontScaling={false} style={[styles.yearOptionText, { color: theme.text }]}>
                      {yearOption}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={[styles.yearPickerCancel, { borderTopColor: theme.border }]}
                onPress={() => setShowYearPicker(false)}
              >
                <Text allowFontScaling={false} style={[styles.yearPickerCancelText, { color: colors.primary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  };

  const renderComparisonStats = () => {
    if (!comparisonStats) return null;

    if (comparisonStats.error) {
      return (
        <View style={styles.errorContainer}>
          <Text allowFontScaling={false} style={[styles.errorText, { color: theme.textSecondary }]}>
            {comparisonStats.error}
          </Text>
        </View>
      );
    }

    if (!comparisonStats.player1Stats || !comparisonStats.player2Stats) return null;

    return (
      <View style={styles.statsContainer}>
        <View style={[styles.comparisonHeader, { backgroundColor: theme.surface }]}>
          <Text allowFontScaling={false} style={[styles.comparisonType, { color: colors.primary }]}>
            {comparisonStats.position} Comparison
          </Text>
        </View>

        {comparisonStats.player1Stats.map((stat1, index) => {
          const stat2 = comparisonStats.player2Stats[index] || { label: 'N/A', value: 'N/A', rank: null };
          
          // Determine which stat is better (varies by stat type)
          let player1Better = false;
          let player2Better = false;
          
          if (stat1.value !== "N/A" && stat2.value !== "N/A") {
            const val1 = parseFloat(stat1.value) || 0;
            const val2 = parseFloat(stat2.value) || 0;
            
            // Stats where lower is better
            const lowerIsBetter = stat1.label.includes('Interceptions') || 
                                 stat1.label.includes('Sacks Allowed') || 
                                 stat1.label.includes('Hurries Allowed') || 
                                 stat1.label.includes('QB Hits Allowed') ||
                                 stat1.label.includes('Penalties') ||
                                 stat1.label.includes('Penalty Yards');
            
            if (lowerIsBetter) {
              player1Better = val1 < val2 && val1 > 0;
              player2Better = val2 < val1 && val2 > 0;
            } else {
              player1Better = val1 > val2;
              player2Better = val2 > val1;
            }
          }

          return (
            <View key={index} style={[styles.statRow, { backgroundColor: theme.surface }]}>
              <View style={[
                styles.statBox, 
                { 
                  backgroundColor: player1Better ? '#e8f5e8' : theme.background,
                  borderColor: player1Better ? '#28a745' : theme.border,
                  borderWidth: player1Better ? 2 : 1
                }
              ]}>
                <Text allowFontScaling={false} style={[
                  styles.statValue, 
                  { color: player1Better ? '#28a745' : theme.text }
                ]}>
                  {stat1.value}
                </Text>
                {stat1.rank && (
                  <Text allowFontScaling={false} style={[styles.statRank, { color: '#28a745' }]}>
                    {stat1.rank}
                  </Text>
                )}
              </View>
              
              <View style={styles.statLabelContainer}>
                <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.text }]}>
                  {stat1.label}
                </Text>
              </View>
              
              <View style={[
                styles.statBox, 
                { 
                  backgroundColor: player2Better ? '#e8f5e8' : theme.background,
                  borderColor: player2Better ? '#28a745' : theme.border,
                  borderWidth: player2Better ? 2 : 1
                }
              ]}>
                <Text allowFontScaling={false} style={[
                  styles.statValue, 
                  { color: player2Better ? '#28a745' : theme.text }
                ]}>
                  {stat2.value}
                </Text>
                {stat2.rank && (
                  <Text allowFontScaling={false} style={[styles.statRank, { color: '#28a745' }]}>
                    {stat2.rank}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {nflDataLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading NFL data...
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text allowFontScaling={false} style={[styles.title, { color: colors.primary }]}>
              Player Comparison
            </Text>
            <Text allowFontScaling={false} style={[styles.subtitle, { color: theme.textSecondary }]}>
              Compare NFL players by position
            </Text>
          </View>

          <View style={styles.playersHeader}>
            {renderPlayerCard(player1, 1)}
            
            <View style={styles.vsContainer}>
              <Text allowFontScaling={false} style={[styles.vsText, { color: colors.primary }]}>VS</Text>
            </View>
            
            {renderPlayerCard(player2, 2)}
          </View>

          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.textSecondary }]}>
                Loading comparison...
              </Text>
            </View>
          )}

          {renderComparisonStats()}
        </ScrollView>
      )}

      {/* Player Search Modal */}
      <Modal 
        visible={showSearchModal} 
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSearchModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <Text allowFontScaling={false} style={[styles.modalTitle, { color: theme.text }]}>
              Select Player {searchingForPlayer}
            </Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowSearchModal(false)}
            >
              <Text allowFontScaling={false} style={[styles.modalCloseText, { color: colors.primary }]}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <TextInput
              style={[styles.searchInput, { 
                backgroundColor: theme.surface, 
                borderColor: theme.border, 
                color: theme.text 
              }]}
              placeholder="Search for players..."
              placeholderTextColor={theme.textSecondary}
              value={searchText}
              onChangeText={(text) => {
                setSearchText(text);
                searchPlayers(text);
              }}
              autoFocus
            />
          </View>

          <FlatList
            style={styles.searchResults}
            data={searchResults}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.searchResultItem, { backgroundColor: theme.surface }]}
                onPress={() => selectPlayer(item, searchingForPlayer)}
              >
                <View style={[styles.searchResultImage, { backgroundColor: theme.border }]}>
                  <Text style={[styles.searchResultInitials, { color: theme.textSecondary }]}>
                    {item.displayName?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </Text>
                </View>
                <View style={styles.searchResultInfo}>
                  <Text allowFontScaling={false} style={[styles.searchResultName, { color: theme.text }]}>
                    {item.displayName}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.searchResultDetails, { color: theme.textSecondary }]}>
                    {item.position?.displayName || 'Player'} • #{item.jersey || 'N/A'}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.searchResultTeam, { color: theme.textTertiary }]}>
                    {getNFLTeamAbbreviation(item.team)}
                  </Text>
                </View>
                <Image
                  source={{ uri: getTeamLogo(item) }}
                  style={styles.searchResultTeamLogo}
                />
              </TouchableOpacity>
            )}
          />
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
    minHeight: 240,
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
  playerImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 12,
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
    borderRadius: 8,
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
  statRank: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
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
  searchResultImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultInitials: {
    fontSize: 14,
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

export default CompareScreen;
