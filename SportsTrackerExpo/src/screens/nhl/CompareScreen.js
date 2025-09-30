import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Alert
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import NHLDataService from '../../services/NHLDataService';

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
  
  // NHL data loading state
  const [nhlDataLoading, setNhlDataLoading] = useState(true);
  const [allNHLPlayers, setAllNHLPlayers] = useState([]);

  // Generate year options
  const currentYear = new Date().getFullYear();
  const startYear = 2020;
  const yearOptions = Array.from({length: currentYear - startYear + 1}, (_, i) => currentYear - i);

  useEffect(() => {
    initializeNHLData();
  }, []);

  useEffect(() => {
    if (player1 && player2) {
      loadComparison();
    }
  }, [player1, player2, player1Year, player2Year]);

  const initializeNHLData = async () => {
    try {
      setNhlDataLoading(true);
      await NHLDataService.initializeData();
      const players = NHLDataService.getAllPlayers();
      setAllNHLPlayers(players);
    } catch (error) {
      console.error('Error initializing NHL data:', error);
      Alert.alert('Error', 'Failed to load NHL data. Please try again.');
    } finally {
      setNhlDataLoading(false);
    }
  };

  const searchPlayers = (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    const results = allNHLPlayers.filter(player =>
      player.displayName && 
      player.displayName.toLowerCase().includes(query.toLowerCase())
    );
    setSearchResults(results);
  };

  const selectPlayer = (player, playerNumber) => {
    const otherPlayer = playerNumber === 1 ? player2 : player1;
    
    // Check if players can be compared (same position group)
    if (otherPlayer && !NHLDataService.canCompare(player, otherPlayer)) {
      const playerPos = NHLDataService.getPositionGroup(player.position?.displayName || player.position?.name);
      const otherPos = NHLDataService.getPositionGroup(otherPlayer.position?.displayName || otherPlayer.position?.name);
      
      Alert.alert(
        'Position Mismatch',
        `Cannot compare ${playerPos}s with ${otherPos}s. Please select players from the same position group (forwards, defensemen, or goalies).`,
        [{ text: 'OK' }]
      );
      return;
    }
    
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
      const [stats1, stats2] = await Promise.all([
        fetchPlayerStats(player1.id, player1Year),
        fetchPlayerStats(player2.id, player2Year)
      ]);

      if (stats1 && stats2) {
        setComparisonStats({
          player1: { ...player1, stats: stats1 },
          player2: { ...player2, stats: stats2 }
        });
      }
    } catch (error) {
      console.error('Error loading comparison:', error);
      Alert.alert('Error', 'Failed to load player statistics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchPlayerStats = async (playerId, year) => {
    try {
      const response = await fetch(
        `https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl/seasons/${year}/types/2/athletes/${playerId}/statistics?lang=en&region=us`
      );
      const data = await response.json();

      // Build a flat map of statName -> value/displayValue for easy lookup
      const statsMap = {};

      // Helper to set value and aliases
      const setStat = (name, value, displayValue) => {
        // Prefer displayValue when available, otherwise keep numeric value
        const val = (displayValue !== undefined && displayValue !== null) ? displayValue : (value !== undefined ? value : null);
        statsMap[name] = val;

        // common aliases to normalize API naming differences
        const aliases = {
          shotsTotal: ['shots'],
          avgGoalsAgainst: ['goalsAgainstAverage', 'goalsAgainstAvg'],
          timeOnIcePerGame: ['avgTimeOnIce'],
          shots: ['shotsTotal'],
          savePct: ['savePercentage', 'svPct'],
          saves: ['saves'],
          plusMinus: ['plusMinus'],
          points: ['points'],
          powerPlayGoals: ['ppGoals'],
        };

        if (aliases[name]) {
          aliases[name].forEach(a => { if (!(a in statsMap)) statsMap[a] = val; });
        }
      };

      // Case 1: older/newer endpoints may include a statistics array
      if (data.statistics && Array.isArray(data.statistics) && data.statistics.length > 0) {
        const primary = data.statistics[0];
        if (primary.stats && Array.isArray(primary.stats)) {
          primary.stats.forEach(s => setStat(s.name, s.value, s.displayValue));
        }
      }

      // Case 2: more detailed structure under `splits.categories[].stats`
      if (data.splits && data.splits.categories && Array.isArray(data.splits.categories)) {
        data.splits.categories.forEach(category => {
          if (category.stats && Array.isArray(category.stats)) {
            category.stats.forEach(s => setStat(s.name, s.value, s.displayValue));
          }
        });
      }

      // If nothing found, return null
      if (Object.keys(statsMap).length === 0) return null;

      return statsMap;
    } catch (error) {
      console.error(`Error fetching stats for player ${playerId}:`, error);
      return null;
    }
  };

  // NHL Position Groupings
  const getPositionGroup = (position) => {
    return NHLDataService.getPositionGroup(position);
  };

  // Get relevant stats for each position group
  const getPositionStats = (positionGroup, categories) => {
    const statMappings = {
      forward: {
        'Scoring': ['goals', 'assists', 'points', 'plusMinus'],
        'Shooting': ['shots', 'shootingPct', 'gameWinningGoals', 'powerPlayGoals'],
        'Advanced': ['timeOnIce', 'avgTimeOnIce', 'faceOffPct', 'hits']
      },
      defenseman: {
        'Scoring': ['goals', 'assists', 'points', 'plusMinus'],
        'Defense': ['hits', 'blockedShots', 'timeOnIce', 'avgTimeOnIce'],
        'Special Teams': ['powerPlayGoals', 'powerPlayAssists', 'shortHandedGoals', 'shortHandedAssists']
      },
      goalie: {
        'Basic': ['wins', 'losses', 'saves', 'goalsAgainst'],
        'Percentages': ['savePct', 'goalsAgainstAverage'],
        'Advanced': ['shutouts', 'gamesStarted', 'timeOnIce']
      }
    };

    return statMappings[positionGroup] || {};
  };

  const getNHLTeamAbbreviation = (team) => {
    const teamMapping = {
      '21': 'TOR', '10': 'MTL', '3': 'CGY', '6': 'EDM', '22': 'VAN', '28': 'WPG',
      '1': 'BOS', '13': 'NYR', '15': 'PHI', '16': 'PIT', '20': 'TBL', '7': 'CAR',
      '4': 'CHI', '5': 'DET', '27': 'NSH', '19': 'STL', '23': 'WSH',
      '25': 'ANA', '8': 'LAK', '18': 'SJS', '29': 'CBJ', '30': 'MIN', '14': 'OTT',
      '26': 'FLA', '2': 'BUF', '11': 'NJD', '12': 'NYI', '9': 'DAL', '17': 'COL',
      '129764': 'UTA', '124292': 'SEA', '37': 'VGK'
    };

    if (team?.abbreviation) {
      return team.abbreviation;
    }
    
    const abbr = teamMapping[team?.id?.toString()];
    if (abbr) {
      return abbr;
    }
    
    return team?.name?.substring(0, 3)?.toUpperCase() || 'NHL';
  };

  const getTeamLogo = (player) => {
    const logoUrl = isDarkMode ? player.team?.logos?.[1]?.href : player.team?.logos?.[0]?.href;
    return logoUrl || getTeamLogoUrl(getNHLTeamAbbreviation(player.team), 'nhl');
  };

  const renderPlayerCard = (player, playerNumber) => {
    const year = playerNumber === 1 ? player1Year : player2Year;
    const setYear = playerNumber === 1 ? setPlayer1Year : setPlayer2Year;
    const showYearPicker = playerNumber === 1 ? showYear1Picker : showYear2Picker;
    const setShowYearPicker = playerNumber === 1 ? setShowYear1Picker : setShowYear2Picker;

    if (!player) {
      return (
        <TouchableOpacity
          style={[styles.playerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => openPlayerSearch(playerNumber)}
        >
          <View style={styles.addPlayerButton}>
            <Text style={[styles.addPlayerIcon, { color: theme.textSecondary }]}>+</Text>
            <Text style={[styles.addPlayerText, { color: theme.textSecondary }]}>
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
          <Text style={styles.clearButtonText}>×</Text>
        </TouchableOpacity>

        <View style={styles.teamHeader}>
          <Image
            source={{ uri: getTeamLogo(player) }}
            style={styles.teamLogo}
          />
          <Text style={[styles.teamName, { color: theme.textSecondary }]}>
            {getNHLTeamAbbreviation(player.team)}
          </Text>
        </View>

        <View style={styles.playerImageContainer}>
          <Image
            source={{ 
              uri: player.headshot?.href || `https://a.espncdn.com/i/headshots/nhl/players/full/${player.id}.png`
            }}
            style={styles.playerImage}
          />
        </View>

        <View style={styles.playerNameContainer}>
          <Text style={[styles.playerName, { color: theme.text }]}>
            {player.displayName}
          </Text>
          <Text style={[styles.playerDetails, { color: theme.textSecondary }]}>
            {player.position?.displayName || 'Player'} • #{player.jersey || '00'}
          </Text>
        </View>

        <View style={styles.yearSelector}>
          <Text style={[styles.yearLabel, { color: theme.textSecondary }]}>Season</Text>
          <TouchableOpacity
            style={[styles.yearButton, { backgroundColor: theme.background, borderColor: theme.border }]}
            onPress={() => setShowYearPicker(true)}
          >
            <Text style={[styles.yearButtonText, { color: theme.text }]}>{year}</Text>
            <Text style={[styles.yearButtonArrow, { color: theme.textSecondary }]}>▼</Text>
          </TouchableOpacity>
        </View>

        <Modal visible={showYearPicker} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.yearPickerModal, { backgroundColor: theme.surface }]}>
              <Text style={[styles.yearPickerTitle, { color: theme.text, borderBottomColor: theme.border }]}>
                Select Season
              </Text>
              <ScrollView style={styles.yearOptions}>
                {yearOptions.map(yearOption => (
                  <TouchableOpacity
                    key={yearOption}
                    style={styles.yearOption}
                    onPress={() => {
                      setYear(yearOption);
                      setShowYearPicker(false);
                    }}
                  >
                    <Text style={[styles.yearOptionText, { 
                      color: yearOption === year ? colors.primary : theme.text 
                    }]}>
                      {yearOption}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={[styles.yearPickerCancel, { borderTopColor: theme.border }]}
                onPress={() => setShowYearPicker(false)}
              >
                <Text style={[styles.yearPickerCancelText, { color: colors.primary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  };

  const renderComparisonStats = () => {
    if (!comparisonStats) return null;

    const { player1: p1, player2: p2 } = comparisonStats;
    const positionGroup = getPositionGroup(p1.position?.displayName || p1.position?.name);
    const statCategories = getPositionStats(positionGroup, p1.stats);

    return (
      <View style={styles.statsContainer}>
        <View style={[styles.comparisonHeader, { backgroundColor: colors.primary }]}>
          <Text style={[styles.comparisonType, { color: 'white' }]}>
            {positionGroup.charAt(0).toUpperCase() + positionGroup.slice(1)} Comparison
          </Text>
        </View>

        {Object.entries(statCategories).map(([categoryName, statKeys]) => (
          <View key={categoryName}>
            <Text style={[styles.categoryHeader, { color: theme.text, backgroundColor: theme.surface }]}>
              {categoryName}
            </Text>
            {statKeys.map(statKey => {
              const stat1 = p1.stats?.[statKey];
              const stat2 = p2.stats?.[statKey];
              
              if (stat1 === undefined && stat2 === undefined) return null;

              const val1 = parseFloat(stat1) || 0;
              const val2 = parseFloat(stat2) || 0;
              const isHigherBetter = !['goalsAgainst', 'goalsAgainstAverage', 'losses'].includes(statKey);
              const winner = isHigherBetter ? (val1 > val2 ? 1 : val1 < val2 ? 2 : 0) : (val1 < val2 ? 1 : val1 > val2 ? 2 : 0);

              return (
                <View key={statKey} style={[styles.statRow, { backgroundColor: theme.background }]}>
                  <View style={[styles.statBox, { 
                    backgroundColor: winner === 1 ? colors.primary + '20' : theme.surface,
                    borderWidth: winner === 1 ? 1 : 0,
                    borderColor: winner === 1 ? colors.primary : 'transparent'
                  }]}>
                    <Text style={[styles.statValue, { 
                      color: winner === 1 ? colors.primary : theme.text 
                    }]}>
                      {stat1 || '0'}
                    </Text>
                  </View>

                  <View style={styles.statLabelContainer}>
                    <Text style={[styles.statLabel, { color: theme.text }]}>
                      {statKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </Text>
                  </View>

                  <View style={[styles.statBox, { 
                    backgroundColor: winner === 2 ? colors.primary + '20' : theme.surface,
                    borderWidth: winner === 2 ? 1 : 0,
                    borderColor: winner === 2 ? colors.primary : 'transparent'
                  }]}>
                    <Text style={[styles.statValue, { 
                      color: winner === 2 ? colors.primary : theme.text 
                    }]}>
                      {stat2 || '0'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  if (nhlDataLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading NHL data...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.primary }]}>Compare Players</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Compare NHL players from the same position group
          </Text>
        </View>

        <View style={styles.playersHeader}>
          {renderPlayerCard(player1, 1)}
          
          <View style={styles.vsContainer}>
            <Text style={[styles.vsText, { color: theme.text }]}>VS</Text>
          </View>
          
          {renderPlayerCard(player2, 2)}
        </View>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              Loading comparison...
            </Text>
          </View>
        )}

        {!loading && comparisonStats && renderComparisonStats()}

        {!loading && !comparisonStats && player1 && player2 && (
          <View style={styles.errorContainer}>
            <Text style={[styles.errorText, { color: theme.textSecondary }]}>
              Unable to load statistics for comparison
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Search Modal */}
      <Modal 
        visible={showSearchModal} 
        animationType="slide" 
        presentationStyle="pageSheet" 
        onRequestClose={() => setShowSearchModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Select Player {searchingForPlayer}
            </Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowSearchModal(false)}
            >
              <Text style={[styles.modalCloseText, { color: colors.primary }]}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <TextInput
              style={[styles.searchInput, { 
                color: theme.text, 
                backgroundColor: theme.surface,
                borderColor: theme.border 
              }]}
              placeholder="Search for a player..."
              placeholderTextColor={theme.textSecondary}
              value={searchText}
              onChangeText={(text) => {
                setSearchText(text);
                searchPlayers(text);
              }}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>

          <View style={styles.searchResults}>
            <FlatList
              data={searchResults}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.searchResultItem, { backgroundColor: theme.surface }]}
                  onPress={() => selectPlayer(item, searchingForPlayer)}
                >
                  <View style={[styles.searchResultImage, { backgroundColor: theme.background }]}>
                    <Image
                      source={{ 
                        uri: item.headshot?.href || `https://a.espncdn.com/i/headshots/nhl/players/full/${item.id}.png`
                      }}
                      style={styles.playerHeadshot}
                    />
                  </View>
                  <View style={styles.searchResultInfo}>
                    <Text style={[styles.searchResultName, { color: theme.text }]}>
                      {item.displayName}
                    </Text>
                    <Text style={[styles.searchResultDetails, { color: theme.textSecondary }]}>
                      {item.position?.displayName || 'Player'} • #{item.jersey || '00'}
                    </Text>
                    <Text style={[styles.searchResultTeam, { color: theme.textTertiary }]}>
                      {getNHLTeamAbbreviation(item.team)}
                    </Text>
                  </View>
                  <Image
                    source={{ uri: getTeamLogo(item) }}
                    style={styles.searchResultTeamLogo}
                  />
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
            />
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
    minHeight: 240,
    justifyContent: 'flex-start',
    borderWidth: 1,
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
    width: 70,
    height: 70,
    borderRadius: 30,
    marginBottom: 12,
  },
  playerHeadshot: {
    width: 50,
    height: 50,
    borderRadius: 50,
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
    paddingVertical: 12,
    marginBottom: 12,
    borderRadius: 8,
  },
  comparisonType: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  categoryHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    padding: 12,
    textAlign: 'center',
    marginBottom: 8,
    borderRadius: 6,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 12,
    marginBottom: 4,
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
    width: 50,
    height: 50,
    borderRadius: 25,
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
